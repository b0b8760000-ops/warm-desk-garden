import { collections } from './collections.js'

type Patch = Record<string, unknown>
type TaskPatchRole = 'owner' | 'assignee'

const workspacePatchFields: Record<string, Set<string>> = {
  [collections.folders]: new Set(['name', 'count', 'color']),
  [collections.notes]: new Set([
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
  ]),
  [collections.friendships]: new Set(['name', 'status', 'avatarUrl', 'tone', 'isStarred']),
  [collections.albums]: new Set([
    'title',
    'description',
    'date',
    'coverUrl',
    'themeColor',
    'photoIds',
    'weekNum',
    'location',
  ]),
  [collections.photos]: new Set([
    'title',
    'imageUrl',
    'styleType',
    'tapeColor',
    'isStarred',
    'dayOfWeek',
    'location',
  ]),
}

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

export function sanitizeWorkspacePatch(collection: string, patch: Patch) {
  return pickAllowed(patch, workspacePatchFields[collection] ?? new Set())
}

export function sanitizeCalendarEventCreate(body: Patch, ownerId: string, now: string) {
  return {
    ...pickAllowed(body, eventFields),
    ownerId,
    participantIds: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function sanitizeCalendarEventPatch(patch: Patch) {
  return pickAllowed(patch, eventFields)
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
