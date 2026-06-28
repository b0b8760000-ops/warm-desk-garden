import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { collections } from './collections.js'
import { getDb } from './db.js'
import {
  idScopedQuery,
  matchRoute,
  normalizeDocument,
  ownerFields,
  ownerScopedQuery,
  scopedIdQuery,
  type ApiRecord,
} from './routes.js'
import { requireUser, type AuthenticatedRequest } from './auth.js'

export const apiRouter = Router()

apiRouter.use(requireUser)

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true })
})

apiRouter.get('/me', (req, res) => {
  const user = (req as unknown as AuthenticatedRequest).currentUser
  res.json({ id: user.id, email: user.email })
})

apiRouter.all('*path', async (req, res, next) => {
  try {
    const db = await getDb()
    const user = (req as unknown as AuthenticatedRequest).currentUser
    const path = req.path
    const route = matchRoute(path)

    if (route) {
      const scope = ownerScopedQuery(route.collection, user.id)

      if (req.method === 'GET' && !route.id) {
        const documents = await db
          .collection<ApiRecord>(route.collection)
          .find(scope)
          .sort({ createdAt: -1 })
          .toArray()
        res.json(documents.map(normalizeDocument))
        return
      }

      if (req.method === 'POST' && !route.id) {
        const now = new Date().toISOString()
        const document = {
          ...req.body,
          ...ownerFields(route.collection, user.id),
          createdAt: now,
          updatedAt: now,
        }
        const result = await db.collection(route.collection).insertOne(document)
        res.status(201).json({ ...document, id: result.insertedId.toHexString() })
        return
      }

      if (req.method === 'PATCH' && route.id) {
        const result = await db.collection<ApiRecord>(route.collection).findOneAndUpdate(
          scopedIdQuery(route.id, scope),
          { $set: { ...req.body, updatedAt: new Date().toISOString() } },
          { returnDocument: 'after' },
        )
        res.json(normalizeDocument(result))
        return
      }

      if (req.method === 'DELETE' && route.id) {
        await db.collection(route.collection).deleteOne(scopedIdQuery(route.id, scope))
        res.json({ ok: true })
        return
      }
    }

    if (req.method === 'GET' && path === '/calendar/events') {
      const events = await db
        .collection<ApiRecord>(collections.calendarEvents)
        .find({ $or: [{ ownerId: user.id }, { participantIds: user.id }] })
        .toArray()
      res.json(events.map(normalizeDocument))
      return
    }

    if (req.method === 'POST' && path === '/calendar/events') {
      const now = new Date().toISOString()
      const event = {
        ...req.body,
        ownerId: user.id,
        participantIds: req.body.participantIds ?? [],
        createdAt: now,
        updatedAt: now,
      }
      const result = await db.collection(collections.calendarEvents).insertOne(event)
      res.status(201).json({ ...event, id: result.insertedId.toHexString() })
      return
    }

    if (req.method === 'PATCH' && path.startsWith('/calendar/events/')) {
      const id = path.split('/').at(-1)
      const result = await db.collection<ApiRecord>(collections.calendarEvents).findOneAndUpdate(
        scopedIdQuery(id, { ownerId: user.id }),
        { $set: { ...req.body, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )
      res.json(normalizeDocument(result))
      return
    }

    if (req.method === 'DELETE' && path.startsWith('/calendar/events/')) {
      const id = path.split('/').at(-1)
      await db.collection(collections.calendarEvents).deleteOne(scopedIdQuery(id, { ownerId: user.id }))
      res.json({ ok: true })
      return
    }

    if (req.method === 'GET' && path === '/calendar/tasks') {
      const tasks = await db
        .collection<ApiRecord>(collections.calendarTasks)
        .find({ $or: [{ ownerId: user.id }, { assigneeIds: user.id }] })
        .toArray()
      res.json(tasks.map(normalizeDocument))
      return
    }

    if (req.method === 'POST' && path === '/calendar/tasks') {
      const now = new Date().toISOString()
      const task = {
        ...req.body,
        ownerId: user.id,
        assigneeIds: req.body.assigneeIds ?? [],
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      }
      const result = await db.collection(collections.calendarTasks).insertOne(task)
      res.status(201).json({ ...task, id: result.insertedId.toHexString() })
      return
    }

    if (req.method === 'PATCH' && path.startsWith('/calendar/tasks/')) {
      const id = path.split('/').at(-1)
      const result = await db.collection<ApiRecord>(collections.calendarTasks).findOneAndUpdate(
        scopedIdQuery(id, { $or: [{ ownerId: user.id }, { assigneeIds: user.id }] }),
        { $set: { ...req.body, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )
      res.json(normalizeDocument(result))
      return
    }

    if (req.method === 'DELETE' && path.startsWith('/calendar/tasks/')) {
      const id = path.split('/').at(-1)
      await db.collection(collections.calendarTasks).deleteOne(
        scopedIdQuery(id, { $or: [{ ownerId: user.id }, { assigneeIds: user.id }] }),
      )
      res.json({ ok: true })
      return
    }

    if (req.method === 'POST' && path.match(/^\/calendar\/invites\/[^/]+\/respond$/)) {
      const inviteId = path.split('/').at(-2)
      const status = req.body.status === 'accepted' ? 'accepted' : 'declined'
      const invite = await db.collection<ApiRecord>(collections.eventInvites).findOneAndUpdate(
        { ...idScopedQuery(inviteId), toUserId: user.id },
        { $set: { status, respondedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )

      if (invite && status === 'accepted') {
        await db.collection(collections.calendarEvents).updateOne(
          { _id: new ObjectId(String(invite.eventId)) },
          { $addToSet: { participantIds: user.id } },
        )
      }

      res.json(normalizeDocument(invite))
      return
    }

    if (req.method === 'GET' && path === '/notifications') {
      const notifications = await db
        .collection<ApiRecord>(collections.notifications)
        .find({ ownerId: user.id })
        .sort({ createdAt: -1 })
        .toArray()
      res.json(notifications.map(normalizeDocument))
      return
    }

    if (req.method === 'PATCH' && path.startsWith('/notifications/')) {
      const id = path.split('/').at(-1)
      const notification = await db.collection<ApiRecord>(collections.notifications).findOneAndUpdate(
        scopedIdQuery(id, { ownerId: user.id }),
        { $set: { ...req.body, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )
      res.json(normalizeDocument(notification))
      return
    }

    res.status(404).json({ error: 'Route not implemented yet.' })
  } catch (error) {
    next(error)
  }
})
