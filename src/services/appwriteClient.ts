import { Account, Client, ID } from 'appwrite'

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1'
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '6a39ed84003504b380f9'

export const appwriteConfig = {
  endpoint,
  projectId,
}

export const isAppwriteConfigured = Boolean(endpoint && projectId)

export const appwriteClient = new Client()

if (isAppwriteConfigured) {
  appwriteClient.setEndpoint(endpoint).setProject(projectId)
}

export const appwriteAccount = new Account(appwriteClient)

export type AuthUser = {
  id: string
  email: string
  name: string
}

function normalizeAuthUser(user: { $id: string; email: string; name?: string }) {
  return {
    id: user.$id,
    email: user.email,
    name: user.name ?? '',
  }
}

export async function getCurrentUser() {
  return normalizeAuthUser(await appwriteAccount.get())
}

export async function signInWithEmail(email: string, password: string) {
  await appwriteAccount.createEmailPasswordSession(email, password)
  return getCurrentUser()
}

export async function registerWithEmail(email: string, password: string, name: string) {
  await appwriteAccount.create(ID.unique(), email, password, name)
  return signInWithEmail(email, password)
}

export async function signOut() {
  return appwriteAccount.deleteSession('current')
}

export async function createAppwriteJwt() {
  return appwriteAccount.createJWT()
}

export async function updateUserName(name: string) {
  return await appwriteAccount.updateName(name)
}
