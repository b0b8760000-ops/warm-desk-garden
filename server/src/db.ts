import { MongoClient } from 'mongodb'

let client: MongoClient | null = null

export async function getDb() {
  const uri = process.env.MONGODB_URI
  const dbName = process.env.MONGODB_DB_NAME ?? 'warm_desk_garden'

  if (!uri) {
    throw Object.assign(new Error('MONGODB_URI is required.'), { status: 500 })
  }

  if (!client) {
    client = new MongoClient(uri)
    await client.connect()
  }

  return client.db(dbName)
}

export async function closeDb() {
  if (!client) return
  await client.close()
  client = null
}
