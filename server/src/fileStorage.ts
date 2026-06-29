import { Client, ID, Permission, Role, Storage } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'

type StorageEnv = {
  APPWRITE_ENDPOINT?: string
  APPWRITE_PROJECT_ID?: string
  APPWRITE_API_KEY?: string
  APPWRITE_BUCKET_ID?: string
}

type UploadFileInput = {
  ownerId: string
  readUserIds: string[]
  category: FileCategory
  file: {
    buffer: Buffer
    originalname: string
    mimetype?: string
    size?: number
  }
}

export const fileCategories = [
  'avatars',
  'backgrounds',
  'notes',
  'journals',
  'chat',
  'albums',
  'pdfs',
] as const

export type FileCategory = (typeof fileCategories)[number]

function uniqueNonEmptyIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

export function parseReadUserIds(rawValue: unknown) {
  if (!rawValue) return []

  if (Array.isArray(rawValue)) {
    return uniqueNonEmptyIds(rawValue.filter((value): value is string => typeof value === 'string'))
  }

  if (typeof rawValue !== 'string') return []

  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (Array.isArray(parsed)) {
      return uniqueNonEmptyIds(parsed.filter((value): value is string => typeof value === 'string'))
    }
  } catch {
    return uniqueNonEmptyIds(rawValue.split(','))
  }

  return []
}

export function filterAcceptedReadUserIds(requestedUserIds: string[], acceptedFriendIds: string[]) {
  const accepted = new Set(acceptedFriendIds)
  return uniqueNonEmptyIds(requestedUserIds).filter((id) => accepted.has(id))
}

export function buildFilePermissions(ownerId: string, readUserIds: string[]) {
  const readers = uniqueNonEmptyIds([ownerId, ...readUserIds])
  return [
    ...readers.map((readerId) => Permission.read(Role.user(readerId))),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ]
}

export function parseFileCategory(rawValue: unknown): FileCategory {
  return typeof rawValue === 'string' && fileCategories.includes(rawValue as FileCategory)
    ? (rawValue as FileCategory)
    : 'notes'
}

export function buildAppwriteFileViewUrl(fileId: string, env: StorageEnv = process.env) {
  const endpoint = env.APPWRITE_ENDPOINT?.replace(/\/$/, '')
  const projectId = env.APPWRITE_PROJECT_ID
  const bucketId = env.APPWRITE_BUCKET_ID

  if (!endpoint || !projectId || !bucketId) {
    throw Object.assign(
      new Error('APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_BUCKET_ID are required.'),
      { status: 500 },
    )
  }

  return `${endpoint}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}/view?project=${encodeURIComponent(projectId)}`
}

function createStorageClient(env: StorageEnv = process.env) {
  const endpoint = env.APPWRITE_ENDPOINT
  const projectId = env.APPWRITE_PROJECT_ID
  const apiKey = env.APPWRITE_API_KEY
  const bucketId = env.APPWRITE_BUCKET_ID

  if (!endpoint || !projectId || !apiKey || !bucketId) {
    throw Object.assign(
      new Error('APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, and APPWRITE_BUCKET_ID are required.'),
      { status: 500 },
    )
  }

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
  return { storage: new Storage(client), bucketId }
}

export async function uploadAppwriteFileForUser({ ownerId, readUserIds, category, file }: UploadFileInput) {
  const { storage, bucketId } = createStorageClient()
  const uploadedFile = await storage.createFile({
    bucketId,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(file.buffer, file.originalname),
    permissions: buildFilePermissions(ownerId, readUserIds),
  })

  return {
    id: uploadedFile.$id,
    fileId: uploadedFile.$id,
    bucketId,
    category,
    storagePath: `${category}/${ownerId}/${uploadedFile.$id}/${file.originalname}`,
    originalName: file.originalname,
    name: uploadedFile.name,
    mimeType: file.mimetype ?? '',
    size: file.size ?? 0,
    url: buildAppwriteFileViewUrl(uploadedFile.$id),
  }
}
