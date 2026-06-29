import { Router } from 'express'
import multer from 'multer'
import { ObjectId } from 'mongodb'
import { collections } from './collections.js'
import { getDb } from './db.js'
import {
  friendshipPairQuery,
  idScopedQuery,
  matchRoute,
  normalizeDocument,
  ownerFields,
  ownerScopedQuery,
  scopedIdQuery,
  shouldAcceptReciprocalFriendship,
  type ApiRecord,
} from './routes.js'
import { requireUser, type AuthenticatedRequest } from './auth.js'
import {
  defaultVisibilityFields,
  sanitizeCalendarEventCreate,
  sanitizeCalendarEventPatch,
  sanitizeCalendarTaskCreate,
  sanitizeCalendarTaskPatch,
  sanitizeFriendshipPatch,
  sanitizeWorkspacePatch,
} from './security.js'
import { buildFriendshipRequestDocument, type ProfileRecord } from './friendships.js'
import {
  filterAcceptedReadUserIds,
  parseFileCategory,
  parseReadUserIds,
  uploadAppwriteFileForUser,
} from './fileStorage.js'

export const apiRouter = Router()
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
})

function pickNotificationPatch(body: ApiRecord) {
  const allowed = new Set(['readAt', 'status'])
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.has(key)))
}

async function getAcceptedFriendIds(userId: string) {
  const db = await getDb()
  const friendships = await db
    .collection<ApiRecord>(collections.friendships)
    .find({
      friendshipStatus: 'accepted',
      $or: [{ requesterId: userId }, { addresseeId: userId }],
    })
    .toArray()

  return friendships
    .map((friendship) =>
      friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId,
    )
    .filter((id): id is string => typeof id === 'string')
}

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true })
})

apiRouter.use(requireUser)

apiRouter.get('/me', (req, res) => {
  const user = (req as unknown as AuthenticatedRequest).currentUser
  res.json({ id: user.id, email: user.email })
})

apiRouter.post('/files', fileUpload.single('file'), async (req, res, next) => {
  try {
    const user = (req as unknown as AuthenticatedRequest).currentUser
    const file = req.file

    if (!file) {
      res.status(400).json({ error: 'File is required.' })
      return
    }

    const requestedReadUserIds = parseReadUserIds(req.body.readUserIds)
    const acceptedReadUserIds = filterAcceptedReadUserIds(
      requestedReadUserIds,
      await getAcceptedFriendIds(user.id),
    )
    const uploadedFile = await uploadAppwriteFileForUser({
      ownerId: user.id,
      readUserIds: acceptedReadUserIds,
      category: parseFileCategory(req.body.category),
      file,
    })

    res.status(201).json(uploadedFile)
  } catch (error) {
    next(error)
  }
})

apiRouter.post('/profiles', async (req, res) => {
  try {
    const db = await getDb()
    const user = (req as unknown as AuthenticatedRequest).currentUser
    const body = req.body

    const profile = {
      userId: user.id,
      name: body.name ?? user.name ?? '',
      email: user.email.toLowerCase(),
      avatarUrl: body.avatarUrl ?? `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150`,
      status: body.status ?? '用手札記錄生活 ✏️',
      tone: body.tone ?? 'green',
      updatedAt: new Date().toISOString()
    }

    await db.collection(collections.profiles).updateOne(
      { userId: user.id },
      { 
        $set: profile, 
        $setOnInsert: { createdAt: new Date().toISOString() } 
      },
      { upsert: true }
    )
    res.json(profile)
  } catch (err) {
    console.error('Failed to update profile:', err)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

apiRouter.get('/profiles/search', async (req, res) => {
  try {
    const db = await getDb()
    const searchEmail = String(req.query.email || '').trim().toLowerCase()
    if (!searchEmail) {
      res.status(400).json({ error: 'Email is required' })
      return
    }
    const profile = await db.collection(collections.profiles).findOne({ email: searchEmail })
    if (!profile) {
      res.json(null)
      return
    }
    res.json({
      id: profile.userId,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      status: profile.status,
      tone: profile.tone
    })
  } catch (err) {
    console.error('Search profile failed:', err)
    res.status(500).json({ error: 'Search profile failed' })
  }
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

        if (route.collection === collections.friendships) {
          const collection = db.collection<ApiRecord>(route.collection)
          const existing = await collection.findOne(friendshipPairQuery(user.id, req.body.addresseeId))

          if (existing) {
            if (shouldAcceptReciprocalFriendship(existing, user.id)) {
              const accepted = await collection.findOneAndUpdate(
                idScopedQuery(String(existing._id ?? existing.id)),
                { $set: { friendshipStatus: 'accepted', updatedAt: now } },
                { returnDocument: 'after' },
              )
              res.status(200).json(normalizeDocument(accepted))
              return
            }

            res.status(200).json(normalizeDocument(existing))
            return
          }

          const addresseeProfile = await db
            .collection<ProfileRecord>(collections.profiles)
            .findOne({ userId: req.body.addresseeId })
          if (!addresseeProfile) {
            res.status(404).json({ error: 'Friend profile was not found.' })
            return
          }

          const requesterProfile = await db
            .collection<ProfileRecord>(collections.profiles)
            .findOne({ userId: user.id })
          const document = buildFriendshipRequestDocument({
            currentUser: user,
            requesterProfile,
            addresseeProfile,
            now,
          })
          const result = await collection.insertOne(document)
          res.status(201).json({ ...document, id: result.insertedId.toHexString() })
          return
        }

        const acceptedFriendIds = await getAcceptedFriendIds(user.id)
        const sanitizedBody = sanitizeWorkspacePatch(route.collection, req.body, acceptedFriendIds)
        const document = {
          ...defaultVisibilityFields(route.collection),
          ...sanitizedBody,
          ...ownerFields(route.collection, user.id),
          createdAt: now,
          updatedAt: now,
        }
        const result = await db.collection(route.collection).insertOne(document)
        res.status(201).json({ ...document, id: result.insertedId.toHexString() })
        return
      }

      if (req.method === 'PATCH' && route.id) {
        if (route.collection === collections.friendships) {
          const friendship = await db.collection<ApiRecord>(route.collection).findOne(
            scopedIdQuery(route.id, scope),
          )
          const patch = sanitizeFriendshipPatch(req.body, friendship, user.id)
          if (!friendship || Object.keys(patch).length === 0) {
            res.status(403).json({ error: 'Only the invite recipient can accept this friendship.' })
            return
          }
          const result = await db.collection<ApiRecord>(route.collection).findOneAndUpdate(
            scopedIdQuery(route.id, scope),
            { $set: { ...patch, updatedAt: new Date().toISOString() } },
            { returnDocument: 'after' },
          )
          res.json(normalizeDocument(result))
          return
        }

        const patch = sanitizeWorkspacePatch(
          route.collection,
          req.body,
          await getAcceptedFriendIds(user.id),
        )
        const result = await db.collection<ApiRecord>(route.collection).findOneAndUpdate(
          scopedIdQuery(route.id, scope),
          { $set: { ...patch, updatedAt: new Date().toISOString() } },
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
      const event = sanitizeCalendarEventCreate(req.body, user.id, now, await getAcceptedFriendIds(user.id))
      const result = await db.collection(collections.calendarEvents).insertOne(event)
      res.status(201).json({ ...event, id: result.insertedId.toHexString() })
      return
    }

    if (req.method === 'PATCH' && path.startsWith('/calendar/events/')) {
      const id = path.split('/').at(-1)
      const patch = sanitizeCalendarEventPatch(req.body, await getAcceptedFriendIds(user.id))
      const result = await db.collection<ApiRecord>(collections.calendarEvents).findOneAndUpdate(
        scopedIdQuery(id, { ownerId: user.id }),
        { $set: { ...patch, updatedAt: new Date().toISOString() } },
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
      const task = sanitizeCalendarTaskCreate(req.body, user.id, now)
      const result = await db.collection(collections.calendarTasks).insertOne(task)
      res.status(201).json({ ...task, id: result.insertedId.toHexString() })
      return
    }

    if (req.method === 'PATCH' && path.startsWith('/calendar/tasks/')) {
      const id = path.split('/').at(-1)
      const task = await db.collection<ApiRecord>(collections.calendarTasks).findOne(
        scopedIdQuery(id, { $or: [{ ownerId: user.id }, { assigneeIds: user.id }] }),
      )

      if (!task) {
        res.json(null)
        return
      }

      const patch = sanitizeCalendarTaskPatch(
        req.body,
        task.ownerId === user.id ? 'owner' : 'assignee',
      )
      const result = await db.collection<ApiRecord>(collections.calendarTasks).findOneAndUpdate(
        scopedIdQuery(id, { $or: [{ ownerId: user.id }, { assigneeIds: user.id }] }),
        { $set: { ...patch, updatedAt: new Date().toISOString() } },
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

    if (req.method === 'GET' && path === '/calendar/invites') {
      const invites = await db
        .collection<ApiRecord>(collections.eventInvites)
        .find({ $or: [{ fromUserId: user.id }, { toUserId: user.id }] })
        .sort({ createdAt: -1 })
        .toArray()
      res.json(invites.map(normalizeDocument))
      return
    }

    if (req.method === 'POST' && path === '/calendar/invites') {
      const now = new Date().toISOString()
      const acceptedFriendIds = new Set(await getAcceptedFriendIds(user.id))
      const toUserId = typeof req.body.toUserId === 'string' ? req.body.toUserId : ''

      if (!acceptedFriendIds.has(toUserId)) {
        res.status(403).json({ error: 'Only accepted friends can receive calendar invites.' })
        return
      }

      const invite = {
        eventId: req.body.eventId,
        fromUserId: user.id,
        toUserId,
        title: req.body.title,
        time: req.body.time,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }
      const result = await db.collection(collections.eventInvites).insertOne(invite)
      res.status(201).json({ ...invite, id: result.insertedId.toHexString() })
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
        { $set: { ...pickNotificationPatch(req.body), updatedAt: new Date().toISOString() } },
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
