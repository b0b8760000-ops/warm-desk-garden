import { Client, Users } from 'node-appwrite'
import type { CurrentUser, FunctionContext } from './types.js'

export async function getCurrentUser(ctx: FunctionContext): Promise<CurrentUser> {
  const userId = ctx.req.headers['x-appwrite-user-id']

  if (!userId) {
    throw Object.assign(new Error('Authentication required.'), { status: 401 })
  }

  const endpoint = process.env.APPWRITE_ENDPOINT
  const projectId = process.env.APPWRITE_PROJECT_ID
  const apiKey = process.env.APPWRITE_API_KEY

  if (!endpoint || !projectId || !apiKey) {
    return { id: userId, email: '' }
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey)
  const users = new Users(client)
  const user = await users.get(userId)

  return { id: user.$id, email: user.email }
}
