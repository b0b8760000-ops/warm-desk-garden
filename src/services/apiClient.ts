import { createAppwriteJwt } from './appwriteClient'

const renderApiUrl = import.meta.env.VITE_RENDER_API_URL ?? ''
const renderApiBaseUrl = renderApiUrl.replace(/\/$/, '')

export const isApiConfigured = true

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type UploadedFileMetadata = {
  fileId?: string
  bucketId?: string
  storagePath?: string
  category?: string
  url: string
  mimeType?: string
  size?: number
  originalName?: string
}

function buildRenderApiUrl(path: string) {
  return `${renderApiBaseUrl}/api${path}`
}

function normalizeNetworkError(error: unknown): never {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    throw new Error('無法連線到後端 API，請確認 Render 服務與 CORS 設定。')
  }

  throw error
}

export async function callApi<T>(
  method: ApiMethod,
  path: string,
  payload?: unknown,
): Promise<T> {
  const jwt = await createAppwriteJwt()
  const response = await fetch(buildRenderApiUrl(path), {
    method,
    headers: {
      authorization: `Bearer ${jwt.jwt}`,
      'content-type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify(payload ?? {}),
  }).catch(normalizeNetworkError)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'API request failed.' }))
    throw new Error(error.error ?? 'API request failed.')
  }

  return response.json() as Promise<T>
}

export async function uploadFile(
  file: File,
  readUserIds: string[] = [],
  category = 'notes',
): Promise<UploadedFileMetadata> {
  const jwt = await createAppwriteJwt()
  const formData = new FormData()
  formData.set('file', file)
  formData.set('readUserIds', JSON.stringify(readUserIds))
  formData.set('category', category)

  const response = await fetch(buildRenderApiUrl('/files'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jwt.jwt}`,
    },
    body: formData,
  }).catch(normalizeNetworkError)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'File upload failed.' }))
    throw new Error(error.error ?? 'File upload failed.')
  }

  const uploadedFile = (await response.json()) as UploadedFileMetadata
  if (!uploadedFile.url) {
    throw new Error('File upload did not return a display URL.')
  }

  return uploadedFile
}

export async function uploadFileForDisplay(
  file: File,
  readUserIds: string[] = [],
  category = 'notes',
) {
  return (await uploadFile(file, readUserIds, category)).url
}
