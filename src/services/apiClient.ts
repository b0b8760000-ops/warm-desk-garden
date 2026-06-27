import { ExecutionMethod } from 'appwrite'
import { appwriteFunctions } from './appwriteClient'

const functionId = import.meta.env.VITE_APPWRITE_API_FUNCTION_ID ?? ''

export const isApiConfigured = Boolean(functionId)

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
