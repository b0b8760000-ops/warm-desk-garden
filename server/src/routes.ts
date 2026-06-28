import { ObjectId, type Filter } from 'mongodb'
import { collections, type CollectionName } from './collections.js'

export type ApiRecord = Record<string, unknown>

export function normalizePath(path = '/') {
  if (!path || path === '/') return '/'
  return path.startsWith('/') ? path : `/${path}`
}

export function matchRoute(path: string) {
  const routes: Record<string, CollectionName> = {
    folders: collections.folders,
    notes: collections.notes,
    'chat-posts': collections.chatPosts,
    friends: collections.friendships,
    albums: collections.albums,
    photos: collections.photos,
  }
  const [, resource, id] = normalizePath(path).split('/')
  const collection = routes[resource]

  if (!collection) return null

  return { resource, collection, id }
}

export function ownerFields(collection: string, userId: string) {
  if (collection === collections.friendships) {
    return { requesterId: userId, friendshipStatus: 'pending' }
  }

  return { ownerId: userId }
}

export function ownerScopedQuery(collection: string, userId: string): Filter<ApiRecord> {
  if (collection === collections.friendships) {
    return { $or: [{ requesterId: userId }, { addresseeId: userId }] }
  }

  if (collection === collections.chatPosts) {
    return { $or: [{ ownerId: userId }, { visibleToUserIds: userId }] }
  }

  return { ownerId: userId }
}

export function friendshipPairQuery(userId: string, addresseeId: unknown): Filter<ApiRecord> {
  if (typeof addresseeId !== 'string' || !addresseeId || addresseeId === userId) {
    throw Object.assign(new Error('A valid friend user id is required.'), { status: 400 })
  }

  return {
    $or: [
      { requesterId: userId, addresseeId },
      { requesterId: addresseeId, addresseeId: userId },
    ],
  }
}

export function shouldAcceptReciprocalFriendship(friendship: ApiRecord, userId: string) {
  return friendship.friendshipStatus === 'pending' && friendship.addresseeId === userId
}

export function idScopedQuery(id?: string): Filter<ApiRecord> {
  if (!id) {
    throw Object.assign(new Error('Invalid id.'), { status: 400 })
  }

  if (!ObjectId.isValid(id)) {
    return { id }
  }

  return { $or: [{ _id: new ObjectId(id) }, { id }] }
}

export function scopedIdQuery(id: string | undefined, scope: Filter<ApiRecord>) {
  return { $and: [idScopedQuery(id), scope] }
}

export function normalizeDocument<T extends ApiRecord | null>(document: T) {
  if (!document) return document
  const { _id, ...rest } = document
  return {
    ...rest,
    id: typeof rest.id === 'string' ? rest.id : String(_id),
  }
}
