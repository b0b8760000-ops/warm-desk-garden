import { Client, ID, Messaging } from 'node-appwrite'
import type { Db } from 'mongodb'
import { collections } from './db.js'

export async function queueNotification(
  db: Db,
  ownerId: string,
  title: string,
  body: string,
) {
  await db.collection(collections.notifications).insertOne({
    ownerId,
    title,
    body,
    readAt: null,
    createdAt: new Date().toISOString(),
  })
}

export async function sendEmailReminder(subject: string, body: string) {
  const endpoint = process.env.APPWRITE_ENDPOINT
  const projectId = process.env.APPWRITE_PROJECT_ID
  const apiKey = process.env.APPWRITE_API_KEY
  const emailTopicId = process.env.APPWRITE_EMAIL_TOPIC_ID

  if (!endpoint || !projectId || !apiKey || !emailTopicId) {
    return 'provider_not_configured' as const
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey)
  const messaging = new Messaging(client)

  await messaging.createEmail({
    messageId: ID.unique(),
    subject,
    content: body,
    topics: [emailTopicId],
    draft: false,
    html: true,
  })

  return 'queued' as const
}
