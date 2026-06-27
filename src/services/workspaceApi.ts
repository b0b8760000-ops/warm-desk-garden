import { callApi, isApiConfigured } from './apiClient'

type ApiRecord = Record<string, unknown> & {
  id?: unknown
  _id?: unknown
}

export type WorkspaceSnapshot = {
  folders: unknown[]
  notes: unknown[]
  friends: unknown[]
  albums: unknown[]
  photos: unknown[]
  chatPosts: unknown[]
  calendarEvents: unknown[]
  calendarTasks: unknown[]
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
    friends,
    albums,
    photos,
    chatPosts,
    calendarEvents,
    calendarTasks,
  ] = await Promise.all([
    callApi<unknown[]>('GET', '/folders'),
    callApi<unknown[]>('GET', '/notes'),
    callApi<unknown[]>('GET', '/friends'),
    callApi<unknown[]>('GET', '/albums'),
    callApi<unknown[]>('GET', '/photos'),
    callApi<unknown[]>('GET', '/chat-posts'),
    callApi<unknown[]>('GET', '/calendar/events'),
    callApi<unknown[]>('GET', '/calendar/tasks'),
  ])

  return {
    folders: normalizeApiList(folders),
    notes: normalizeApiList(notes),
    friends: normalizeApiList(friends),
    albums: normalizeApiList(albums),
    photos: normalizeApiList(photos),
    chatPosts: normalizeApiList(chatPosts),
    calendarEvents: normalizeApiList(calendarEvents),
    calendarTasks: normalizeApiList(calendarTasks),
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
