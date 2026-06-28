import 'dotenv/config'
import { collections } from './collections.js'
import { getDb } from './db.js'

const pollMs = Number(process.env.WORKER_POLL_MS ?? 60_000)

async function processReminderJobs() {
  const db = await getDb()
  const now = new Date().toISOString()
  const jobs = await db
    .collection(collections.reminderJobs)
    .find({ status: 'pending', dueAt: { $lte: now } })
    .limit(20)
    .toArray()

  for (const job of jobs) {
    await db.collection(collections.notifications).insertOne({
      ownerId: job.ownerId,
      title: job.title ?? '提醒',
      body: job.body ?? '',
      reminderJobId: job._id,
      readAt: null,
      createdAt: new Date().toISOString(),
    })
    await db.collection(collections.reminderJobs).updateOne(
      { _id: job._id },
      { $set: { status: 'completed', completedAt: new Date().toISOString() } },
    )
  }
}

async function loop() {
  try {
    await processReminderJobs()
  } catch (error) {
    console.error(error)
  } finally {
    setTimeout(loop, pollMs)
  }
}

void loop()
