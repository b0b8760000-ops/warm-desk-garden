import 'dotenv/config'
import { collections } from './collections.js'
import { getDb } from './db.js'

async function main() {
  const db = await getDb()
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const tasks = await db
    .collection(collections.calendarTasks)
    .find({
      dueDate: today,
      completedAt: null,
      reminderQueuedAt: { $exists: false },
    })
    .toArray()

  for (const task of tasks) {
    await db.collection(collections.reminderJobs).insertOne({
      ownerId: task.ownerId,
      title: '任務到期提醒',
      body: task.title ?? '今天有一項任務到期',
      dueAt: now.toISOString(),
      status: 'pending',
      createdAt: now.toISOString(),
    })
    await db.collection(collections.calendarTasks).updateOne(
      { _id: task._id },
      { $set: { reminderQueuedAt: now.toISOString() } },
    )
  }
}

main()
  .then(() => {
    console.log('Reminder cron completed.')
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
