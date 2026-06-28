import { ExecutionMethod } from 'appwrite'
import { appwriteFunctions } from './appwriteClient'
import { createAppwriteJwt } from './appwriteClient'

const functionId = import.meta.env.VITE_APPWRITE_API_FUNCTION_ID ?? ''
const renderApiUrl = import.meta.env.VITE_RENDER_API_URL ?? ''

export const isApiConfigured = Boolean(functionId || renderApiUrl)

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

const executionMethods: Record<ApiMethod, ExecutionMethod> = {
  GET: ExecutionMethod.GET,
  POST: ExecutionMethod.POST,
  PATCH: ExecutionMethod.PATCH,
  DELETE: ExecutionMethod.DELETE,
}

export async function callApi<T>(
  method: ApiMethod,
  path: string,
  payload?: unknown,
): Promise<T> {
  if (renderApiUrl) {
    const jwt = await createAppwriteJwt()
    const response = await fetch(`${renderApiUrl.replace(/\/$/, '')}/api${path}`, {
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

  if (!isApiConfigured) {
    throw new Error('VITE_APPWRITE_API_FUNCTION_ID is required to call the API.')
  }

  const execution = await appwriteFunctions.createExecution(
    functionId,
    JSON.stringify(payload ?? {}),
    false,
    path,
    executionMethods[method],
    { 'content-type': 'application/json' },
  )

  if (execution.status === 'failed') {
    throw new Error(execution.responseBody || 'API request failed.')
  }

  return JSON.parse(execution.responseBody || 'null') as T
}
