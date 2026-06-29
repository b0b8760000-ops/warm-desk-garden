import { collections } from './collections.js'

type Patch = Record<string, unknown>
type TaskPatchRole = 'owner' | 'assignee'

const fileMetadataFields = [
  'fileId',
  'bucketId',
  'storagePath',
  'category',
  'url',
  'mimeType',
  'size',
  'originalName',
] as const

const workspacePatchFields: Record<string, Set<string>> = {
  [collections.friendGroups]: new Set(['name', 'memberIds']),
  [collections.folders]: new Set(['name', 'count', 'color', 'visibility', 'visibleToUserIds']),
  [collections.notes]: new Set([
    'folderId',
    'title',
    'excerpt',
    'folder',
    'date',
    'imageUrl',
    'photoCount',
    'likeCount',
    'fileCount',
    'isStarred',
    'attachments',
    'visibility',
    'visibleToUserIds',
  ]),
  [collections.noteAttachments]: new Set([
    'noteId',
    'name',
    'kind',
    'visibility',
    'visibleToUserIds',
    ...fileMetadataFields,
  ]),
  [collections.reflections]: new Set([
    'title',
    'content',
    'date',
    'mood',
    'imageUrl',
    'photoIds',
    'isStarred',
  ]),
  [collections.reflectionPhotos]: new Set([
    'reflectionId',
    'title',
    'imageUrl',
    'isStarred',
    'visibleToUserIds',
    'likedByUserIds',
    'comments',
    ...fileMetadataFields,
  ]),
  [collections.chatPosts]: new Set([
    'author',
    'avatarUrl',
    'action',
    'text',
    'time',
    'likes',
    'editable',
    'isOnline',
    'images',
    'comments',
    'chatMessages',
    'likedByMe',
    'visibleToUserIds',
    'fileIds',
  ]),
  [collections.chatReplies]: new Set([
    'postId',
    'author',
    'avatarUrl',
    'text',
    'time',
    'likedByUserIds',
  ]),
  [collections.chatThreads]: new Set([
    'name',
    'type',
    'memberIds',
    'avatarUrl',
    'lastMessageAt',
    'visibleToUserIds',
  ]),
  [collections.chatMessages]: new Set([
    'threadId',
    'text',
    'time',
    'attachmentIds',
    'readByUserIds',
    'visibleToUserIds',
  ]),
  [collections.friendships]: new Set(['name', 'status', 'avatarUrl', 'tone', 'isStarred', 'friendshipStatus']),
  [collections.albums]: new Set([
    'title',
    'description',
    'date',
    'coverUrl',
    'themeColor',
    'photoIds',
    'weekNum',
    'location',
    'visibleToUserIds',
    'ownerName',
    'ownerAvatarUrl',
  ]),
  [collections.photos]: new Set([
    'title',
    'imageUrl',
    'styleType',
    'tapeColor',
    'isStarred',
    'dayOfWeek',
    'location',
    'visibleToUserIds',
    'ownerName',
    'ownerAvatarUrl',
    'albumTitle',
    'weekNum',
    'likedByUserIds',
    'comments',
    ...fileMetadataFields,
  ]),
}

const visibilityScopedCollections: Set<string> = new Set([
  collections.folders,
  collections.notes,
  collections.noteAttachments,
])

const eventFields = new Set([
  'title',
  'description',
  'startsAt',
  'endsAt',
  'visibility',
  'linkedResource',
  'location',
  'color',
])

const taskFields = new Set(['title', 'dueAt', 'priority', 'eventId', 'noteId'])

function pickAllowed(source: Patch, allowed: Set<string>) {
  return Object.fromEntries(
    Object.entries(source).filter(([key, value]) => allowed.has(key) && value !== undefined),
  )
}

function sanitizeVisibleToUserIds(value: unknown, allowedVisibleToUserIds: string[]) {
  if (!Array.isArray(value)) return []

  const allowed = new Set(allowedVisibleToUserIds)
  return [
    ...new Set(
      value.filter((id): id is string => typeof id === 'string' && allowed.has(id)),
    ),
  ]
}

export function defaultVisibilityFields(collection: string) {
  if (!visibilityScopedCollections.has(collection)) return {}

  return {
    visibility: 'private',
    visibleToUserIds: [],
  }
}

export function sanitizeWorkspacePatch(
  collection: string,
  patch: Patch,
  allowedVisibleToUserIds: string[] = [],
) {
  const sanitized = pickAllowed(patch, workspacePatchFields[collection] ?? new Set())

  if (!visibilityScopedCollections.has(collection)) return sanitized

  const hasVisibility = Object.prototype.hasOwnProperty.call(patch, 'visibility')
  const hasVisibleIds = Object.prototype.hasOwnProperty.call(patch, 'visibleToUserIds')
  if (!hasVisibility && !hasVisibleIds) return sanitized

  const visibleToUserIds = sanitizeVisibleToUserIds(patch.visibleToUserIds, allowedVisibleToUserIds)
  const visibility = patch.visibility === 'shared' ? 'shared' : 'private'

  return {
    ...sanitized,
    visibility,
    visibleToUserIds: visibility === 'shared' ? visibleToUserIds : [],
  }
}

export function sanitizeCalendarEventCreate(
  body: Patch,
  ownerId: string,
  now: string,
  allowedParticipantIds: string[] = [],
) {
  const requestedParticipantIds = Array.isArray(body.participantIds)
    ? body.participantIds.filter((id): id is string => typeof id === 'string')
    : []
  const allowedParticipants = new Set(allowedParticipantIds)

  return {
    ...pickAllowed(body, eventFields),
    ownerId,
    participantIds: [...new Set(requestedParticipantIds.filter((id) => allowedParticipants.has(id)))],
    createdAt: now,
    updatedAt: now,
  }
}

export function sanitizeCalendarEventPatch(patch: Patch, allowedParticipantIds?: string[]) {
  const sanitized = pickAllowed(patch, eventFields)
  if (Array.isArray(patch.participantIds) && allowedParticipantIds) {
    const allowedParticipants = new Set(allowedParticipantIds)
    const participantIds = patch.participantIds.filter(
      (id): id is string => typeof id === 'string' && allowedParticipants.has(id),
    )
    return { ...sanitized, participantIds: [...new Set(participantIds)] }
  }

  return sanitized
}

export function sanitizeFriendshipPatch(patch: Patch, friendship: Patch | null, userId: string) {
  if (
    patch.friendshipStatus === 'accepted' &&
    friendship?.friendshipStatus === 'pending' &&
    friendship.addresseeId === userId
  ) {
    return { friendshipStatus: 'accepted' }
  }

  return {}
}

export function sanitizeCalendarTaskCreate(body: Patch, ownerId: string, now: string) {
  return {
    ...pickAllowed(body, taskFields),
    ownerId,
    assigneeIds: [],
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function sanitizeCalendarTaskPatch(patch: Patch, role: TaskPatchRole) {
  if (role === 'assignee') {
    return pickAllowed(patch, new Set(['completedAt']))
  }

  return pickAllowed(patch, new Set([...taskFields, 'completedAt']))
}

export function chatPostRooms(post: Patch) {
  const ownerId = typeof post.ownerId === 'string' ? post.ownerId : ''
  const visibleToUserIds = Array.isArray(post.visibleToUserIds)
    ? post.visibleToUserIds.filter((id): id is string => typeof id === 'string')
    : []

  return [...new Set([ownerId, ...visibleToUserIds].filter(Boolean))].map((id) => `user:${id}`)
}
