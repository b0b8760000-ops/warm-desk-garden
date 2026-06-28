import { Account, Client, Users } from 'node-appwrite'
import type { Request, Response, NextFunction } from 'express'

export type CurrentUser = {
  id: string
  email: string
  name?: string
}

export type AuthenticatedRequest = Request & {
  currentUser: CurrentUser
}

function getBearerToken(req: Request) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim()
}

export async function getCurrentUserFromRequest(req: Request): Promise<CurrentUser> {
  const endpoint = process.env.APPWRITE_ENDPOINT
  const projectId = process.env.APPWRITE_PROJECT_ID
  const apiKey = process.env.APPWRITE_API_KEY
  const jwt = getBearerToken(req)

  if (!endpoint || !projectId) {
    throw Object.assign(new Error('APPWRITE_ENDPOINT and APPWRITE_PROJECT_ID are required.'), {
      status: 500,
    })
  }

  if (jwt) {
    const client = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt)
    const account = new Account(client)
    const user = await account.get()
    return { id: user.$id, email: user.email, name: user.name }
  }

  const devUserId = req.headers['x-dev-user-id']
  if (process.env.NODE_ENV !== 'production' && typeof devUserId === 'string') {
    return { id: devUserId, email: '' }
  }

  if (apiKey && typeof req.headers['x-appwrite-user-id'] === 'string') {
    const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
    const users = new Users(client)
    const user = await users.get(req.headers['x-appwrite-user-id'])
    return { id: user.$id, email: user.email, name: user.name }
  }

  throw Object.assign(new Error('Authentication required.'), { status: 401 })
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    ;(req as AuthenticatedRequest).currentUser = await getCurrentUserFromRequest(req)
    next()
  } catch (error) {
    next(error)
  }
}
