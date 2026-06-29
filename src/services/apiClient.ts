import { createAppwriteJwt } from './appwriteClient'

const renderApiUrl = import.meta.env.VITE_RENDER_API_URL ?? ''
const renderApiBaseUrl = renderApiUrl.replace(/\/$/, '')
const shouldUseRenderApi = Boolean(renderApiUrl || import.meta.env.PROD)

export const isApiConfigured = shouldUseRenderApi

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

export async function callApi<T>(
  method: ApiMethod,
  path: string,
  payload?: unknown,
): Promise<T> {
  if (!shouldUseRenderApi) {
    throw new Error('Render API is required to call the backend.')
  }

  const jwt = await createAppwriteJwt()
  const response = await fetch(buildRenderApiUrl(path), {
    method,
    headers: {
      authorization: `Bearer ${jwt.jwt}`,
      'content-type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify(payload ?? {}),
  })

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
  if (!shouldUseRenderApi) {
    throw new Error('Render API is required for file uploads.')
  }

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
  })

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
