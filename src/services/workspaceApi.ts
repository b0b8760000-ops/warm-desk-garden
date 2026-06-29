import { callApi, isApiConfigured } from './apiClient'

type ApiRecord = Record<string, unknown> & {
  id?: unknown
  _id?: unknown
}

export type WorkspaceSnapshot = {
  folders: unknown[]
  notes: unknown[]
  noteAttachments: unknown[]
  reflections: unknown[]
  reflectionPhotos: unknown[]
  friends: unknown[]
  friendGroups: unknown[]
  albums: unknown[]
  photos: unknown[]
  chatPosts: unknown[]
  chatReplies: unknown[]
  chatThreads: unknown[]
  chatMessages: unknown[]
  calendarEvents: unknown[]
  calendarTasks: unknown[]
  eventInvites: unknown[]
  notifications: unknown[]
}

export function normalizeApiRecord<T extends ApiRecord>(record: T) {
  const { _id, ...rest } = record
  const mongoId =
    typeof _id === 'string'
      ? _id
      : _id && typeof _id === 'object' && '$oid' in _id
        ? String((_id as { $oid: unknown }).$oid)
        : undefined

  return {
    ...rest,
    id: typeof record.id === 'string' ? record.id : mongoId,
  }
}

function normalizeApiList<T>(records: unknown[]) {
  return records.map((record) => normalizeApiRecord(record as ApiRecord)) as T[]
}

export async function loadWorkspaceSnapshot(): Promise<WorkspaceSnapshot | null> {
  if (!isApiConfigured) return null

  const [
    folders,
    notes,
    noteAttachments,
    reflections,
    reflectionPhotos,
    friends,
    friendGroups,
    albums,
    photos,
    chatPosts,
    chatReplies,
    chatThreads,
    chatMessages,
    calendarEvents,
    calendarTasks,
    eventInvites,
    notifications,
  ] = await Promise.all([
    callApi<unknown[]>('GET', '/folders'),
    callApi<unknown[]>('GET', '/notes'),
    callApi<unknown[]>('GET', '/note-attachments'),
    callApi<unknown[]>('GET', '/reflections'),
    callApi<unknown[]>('GET', '/reflection-photos'),
    callApi<unknown[]>('GET', '/friends'),
    callApi<unknown[]>('GET', '/friend-groups'),
    callApi<unknown[]>('GET', '/albums'),
    callApi<unknown[]>('GET', '/photos'),
    callApi<unknown[]>('GET', '/chat-posts'),
    callApi<unknown[]>('GET', '/chat-replies'),
    callApi<unknown[]>('GET', '/chat-threads'),
    callApi<unknown[]>('GET', '/chat-messages'),
    callApi<unknown[]>('GET', '/calendar/events'),
    callApi<unknown[]>('GET', '/calendar/tasks'),
    callApi<unknown[]>('GET', '/calendar/invites'),
    callApi<unknown[]>('GET', '/notifications'),
  ])

  return {
    folders: normalizeApiList(folders),
    notes: normalizeApiList(notes),
    noteAttachments: normalizeApiList(noteAttachments),
    reflections: normalizeApiList(reflections),
    reflectionPhotos: normalizeApiList(reflectionPhotos),
    friends: normalizeApiList(friends),
    friendGroups: normalizeApiList(friendGroups),
    albums: normalizeApiList(albums),
    photos: normalizeApiList(photos),
    chatPosts: normalizeApiList(chatPosts),
    chatReplies: normalizeApiList(chatReplies),
    chatThreads: normalizeApiList(chatThreads),
    chatMessages: normalizeApiList(chatMessages),
    calendarEvents: normalizeApiList(calendarEvents),
    calendarTasks: normalizeApiList(calendarTasks),
    eventInvites: normalizeApiList(eventInvites),
    notifications: normalizeApiList(notifications),
  }
}

export async function createWorkspaceRecord<T>(path: string, record: T) {
  if (!isApiConfigured) return null
  return normalizeApiRecord(await callApi<ApiRecord>('POST', `/${path}`, record)) as T
}

export async function updateWorkspaceRecord<T>(path: string, id: string, patch: Partial<T>) {
  if (!isApiConfigured || !id) return null
  return normalizeApiRecord(await callApi<ApiRecord>('PATCH', `/${path}/${id}`, patch)) as T
}

export async function deleteWorkspaceRecord(path: string, id: string) {
  if (!isApiConfigured || !id) return null
  return callApi<{ ok: boolean }>('DELETE', `/${path}/${id}`)
}
