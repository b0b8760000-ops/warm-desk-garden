import { ObjectId } from 'mongodb'
import { getCurrentUser } from './auth.js'
import { collections, getDb } from './db.js'
import { queueNotification } from './reminderDelivery.js'
import type { FunctionContext } from './types.js'

export default async function main(ctx: FunctionContext) {
  try {
    const user = await getCurrentUser(ctx)
    const db = await getDb()
    const body = parseBody(ctx.req.bodyText)
    const path = normalizePath(ctx.req.path)
    const method = ctx.req.method.toUpperCase()

    if (method === 'GET' && path === '/me') {
      return ctx.res.json({ id: user.id, email: user.email })
    }

    const resourceRoute = matchResourceRoute(path)
    if (resourceRoute) {
      const collection = resourceRoute.collection

      if (method === 'GET' && !resourceRoute.id) {
        const documents = await db
          .collection(collection)
          .find(ownerScopedQuery(collection, user.id))
          .sort({ createdAt: -1 })
          .toArray()

        return ctx.res.json(documents)
      }

      if (method === 'POST' && !resourceRoute.id) {
        const document = {
          ...body,
          ...ownerFields(collection, user.id),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        const result = await db.collection(collection).insertOne(document)

        return ctx.res.json({ ...document, id: result.insertedId.toHexString() }, 201)
      }

      if (method === 'PATCH' && resourceRoute.id) {
        const result = await db.collection(collection).findOneAndUpdate(
          scopedIdQuery(resourceRoute.id, ownerScopedQuery(collection, user.id)),
          { $set: { ...body, updatedAt: new Date().toISOString() } },
          { returnDocument: 'after' },
        )

        return ctx.res.json(result)
      }

      if (method === 'DELETE' && resourceRoute.id) {
        await db.collection(collection).deleteOne(
          scopedIdQuery(resourceRoute.id, ownerScopedQuery(collection, user.id)),
        )

        return ctx.res.json({ ok: true })
      }
    }

    if (method === 'GET' && path === '/calendar/events') {
      const events = await db
        .collection(collections.calendarEvents)
        .find({
          $or: [{ ownerId: user.id }, { participantIds: user.id }],
        })
        .toArray()

      return ctx.res.json(events)
    }

    if (method === 'POST' && path === '/calendar/events') {
      const event = {
        ...body,
        ownerId: user.id,
        participantIds: body.participantIds ?? [],
        createdAt: new Date().toISOString(),
      }
      const result = await db.collection(collections.calendarEvents).insertOne(event)

      await queueNotification(
        db,
        user.id,
        '行事曆已建立',
        `${event.title ?? '新的事件'} 已加入你的行事曆。`,
      )

      return ctx.res.json({ ...event, id: result.insertedId.toHexString() }, 201)
    }

    if (method === 'POST' && path.match(/^\/calendar\/events\/[^/]+\/invite$/)) {
      const eventId = path.split('/').at(-2)
      const event = await db.collection(collections.calendarEvents).findOne({
        ...scopedIdQuery(eventId, { ownerId: user.id }),
      })

      if (!event) {
        return ctx.res.json({ error: 'Not found' }, 404)
      }

      const invite = {
        eventId,
        fromUserId: user.id,
        toUserId: body.toUserId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      const result = await db.collection(collections.eventInvites).insertOne(invite)

      await queueNotification(
        db,
        body.toUserId,
        '新的共同事件邀請',
        `${event.title ?? '共同事件'} 邀請你加入。`,
      )

      return ctx.res.json({ ...invite, id: result.insertedId.toHexString() }, 201)
    }

    if (method === 'PATCH' && path.startsWith('/calendar/events/')) {
      const id = path.split('/').at(-1)
      const result = await db.collection(collections.calendarEvents).findOneAndUpdate(
        scopedIdQuery(id, { ownerId: user.id }),
        { $set: { ...body, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )

      return ctx.res.json(result)
    }

    if (method === 'DELETE' && path.startsWith('/calendar/events/')) {
      const id = path.split('/').at(-1)
      await db.collection(collections.calendarEvents).deleteOne(scopedIdQuery(id, { ownerId: user.id }))

      return ctx.res.json({ ok: true })
    }

    if (method === 'GET' && path === '/calendar/tasks') {
      const tasks = await db
        .collection(collections.calendarTasks)
        .find({
          $or: [{ ownerId: user.id }, { assigneeIds: user.id }],
        })
        .toArray()

      return ctx.res.json(tasks)
    }

    if (method === 'POST' && path === '/calendar/tasks') {
      const task = {
        ...body,
        ownerId: user.id,
        assigneeIds: body.assigneeIds ?? [],
        completedAt: null,
        createdAt: new Date().toISOString(),
      }
      const result = await db.collection(collections.calendarTasks).insertOne(task)

      return ctx.res.json({ ...task, id: result.insertedId.toHexString() }, 201)
    }

    if (method === 'POST' && path.match(/^\/calendar\/invites\/[^/]+\/respond$/)) {
      const inviteId = path.split('/').at(-2)
      const status = body.status === 'accepted' ? 'accepted' : 'declined'
      const invite = await db.collection(collections.eventInvites).findOneAndUpdate(
        { _id: toObjectId(inviteId), toUserId: user.id },
        { $set: { status, respondedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )

      if (!invite) {
        return ctx.res.json({ error: 'Not found' }, 404)
      }

      if (status === 'accepted') {
        await db.collection(collections.calendarEvents).updateOne(
          { _id: toObjectId(invite.eventId) },
          { $addToSet: { participantIds: user.id } },
        )
      }

      return ctx.res.json(invite)
    }

    if (method === 'PATCH' && path.startsWith('/calendar/tasks/')) {
      const id = path.split('/').at(-1)
      const task = await db.collection(collections.calendarTasks).findOne({
        ...scopedIdQuery(id, { $or: [{ ownerId: user.id }, { assigneeIds: user.id }] }),
      })

      if (!task) {
        return ctx.res.json({ error: 'Not found' }, 404)
      }

      const result = await db.collection(collections.calendarTasks).findOneAndUpdate(
        idScopedQuery(id),
        { $set: { ...body, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )

      return ctx.res.json(result)
    }

    if (method === 'DELETE' && path.startsWith('/calendar/tasks/')) {
      const id = path.split('/').at(-1)
      await db.collection(collections.calendarTasks).deleteOne(
        scopedIdQuery(id, { $or: [{ ownerId: user.id }, { assigneeIds: user.id }] }),
      )

      return ctx.res.json({ ok: true })
    }

    if (method === 'GET' && path === '/notifications') {
      const notifications = await db
        .collection(collections.notifications)
        .find({ ownerId: user.id })
        .sort({ createdAt: -1 })
        .toArray()

      return ctx.res.json(notifications)
    }

    if (method === 'PATCH' && path.startsWith('/notifications/')) {
      const id = path.split('/').at(-1)
      const notification = await db.collection(collections.notifications).findOneAndUpdate(
        scopedIdQuery(id, { ownerId: user.id }),
        { $set: { ...body, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )

      return ctx.res.json(notification)
    }

    return ctx.res.json({ error: 'Route not implemented yet.' }, 404)
  } catch (error) {
    const status =
      typeof error === 'object' && error && 'status' in error
        ? Number(error.status)
        : 500
    const message = error instanceof Error ? error.message : 'Unexpected error'
    ctx.error(message)
    return ctx.res.json({ error: message }, status)
  }
}

function parseBody(bodyText = '{}') {
  try {
    return JSON.parse(bodyText || '{}')
  } catch {
    return {}
  }
}

function normalizePath(path: string) {
  if (!path || path === '/') {
    return '/'
  }

  return path.startsWith('/') ? path : `/${path}`
}

function matchResourceRoute(path: string) {
  const routes: Record<string, (typeof collections)[keyof typeof collections]> = {
    folders: collections.folders,
    notes: collections.notes,
    'chat-posts': collections.chatPosts,
    friends: collections.friendships,
    albums: collections.albums,
    photos: collections.photos,
  }
  const [, resource, id] = path.split('/')
  const collection = routes[resource]

  if (!collection) {
    return null
  }

  return { collection, id }
}

function ownerFields(collection: string, userId: string) {
  if (collection === collections.friendships) {
    return { requesterId: userId, friendshipStatus: 'pending' }
  }

  return { ownerId: userId }
}

function ownerScopedQuery(collection: string, userId: string) {
  if (collection === collections.friendships) {
    return {
      $or: [{ requesterId: userId }, { addresseeId: userId }],
    }
  }

  if (collection === collections.chatPosts) {
    return {
      $or: [{ ownerId: userId }, { visibleToUserIds: userId }],
    }
  }

  return { ownerId: userId }
}

function idScopedQuery(id?: string) {
  if (!id || !ObjectId.isValid(id)) {
    if (!id) {
      throw Object.assign(new Error('Invalid id.'), { status: 400 })
    }

    return { id }
  }

  return { $or: [{ _id: new ObjectId(id) }, { id }] }
}

function scopedIdQuery(id: string | undefined, scope: Record<string, unknown>) {
  return {
    $and: [idScopedQuery(id), scope],
  }
}

function toObjectId(id?: string) {
  if (!id || !ObjectId.isValid(id)) {
    throw Object.assign(new Error('Invalid id.'), { status: 400 })
  }

  return new ObjectId(id)
}
