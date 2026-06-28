import { Account, Client, Functions, ID, Permission, Role, Storage } from 'appwrite'

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT ?? ''
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID ?? ''
const bucketId = import.meta.env.VITE_APPWRITE_BUCKET_ID ?? ''

export const appwriteConfig = {
  endpoint,
  projectId,
  bucketId,
}

type FileViewConfig = typeof appwriteConfig

export const isAppwriteConfigured = Boolean(endpoint && projectId)

export const appwriteClient = new Client()

if (isAppwriteConfigured) {
  appwriteClient.setEndpoint(endpoint).setProject(projectId)
}

export const appwriteAccount = new Account(appwriteClient)
export const appwriteStorage = new Storage(appwriteClient)
export const appwriteFunctions = new Functions(appwriteClient)

export async function signInWithEmail(email: string, password: string) {
  return appwriteAccount.createEmailPasswordSession(email, password)
}

export async function signOut() {
  return appwriteAccount.deleteSession('current')
}

export async function createAppwriteJwt() {
  return appwriteAccount.createJWT()
}

export function buildOwnerFilePermissions(userId: string) {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ]
}

export function buildFileViewUrl(fileId: string, config: FileViewConfig = appwriteConfig) {
  if (!config.endpoint || !config.projectId || !config.bucketId) {
    throw new Error('Appwrite endpoint, project id, and bucket id are required to view files.')
  }

  const endpointUrl = config.endpoint.replace(/\/$/, '')
  return `${endpointUrl}/storage/buckets/${encodeURIComponent(config.bucketId)}/files/${encodeURIComponent(fileId)}/view?project=${encodeURIComponent(config.projectId)}`
}

export async function uploadUserFile(file: File) {
  if (!bucketId) {
    throw new Error('VITE_APPWRITE_BUCKET_ID is required to upload files.')
  }

  const user = await appwriteAccount.get()
  return appwriteStorage.createFile(
    bucketId,
    ID.unique(),
    file,
    buildOwnerFilePermissions(user.$id),
  )
}

export async function uploadUserFileForDisplay(file: File) {
  const uploadedFile = await uploadUserFile(file)
  return buildFileViewUrl(uploadedFile.$id)
}
