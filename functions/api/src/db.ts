import { MongoClient } from 'mongodb'

let client: MongoClient | null = null

export async function getDb() {
  const uri = process.env.MONGODB_URI
  const dbName = process.env.MONGODB_DB_NAME ?? 'warm_desk_garden'

  if (!uri) {
    throw new Error('MONGODB_URI is required.')
  }

  if (!client) {
    client = new MongoClient(uri)
    await client.connect()
  }

  return client.db(dbName)
}

export const collections = {
  profiles: 'profiles',
  folders: 'folders',
  notes: 'notes',
  chatPosts: 'chatPosts',
  chatReplies: 'chatReplies',
  friendships: 'friendships',
  albums: 'albums',
  photos: 'photos',
  calendarEvents: 'calendarEvents',
  calendarTasks: 'calendarTasks',
  eventInvites: 'eventInvites',
  notifications: 'notifications',
  reminderJobs: 'reminderJobs',
} as const
