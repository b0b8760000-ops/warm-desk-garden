import type { CalendarEvent, CalendarTask, ReminderJob } from './types'

type CreateReminderInput = {
  event?: CalendarEvent
  task?: CalendarTask
  timezone: 'Asia/Taipei'
}

type DeliveryOptions = {
  emailProviderConfigured: boolean
}

const taipeiOffsetHours = 8

export function createReminderJobs({
  event,
  task,
  timezone,
}: CreateReminderInput): ReminderJob[] {
  if (timezone !== 'Asia/Taipei') {
    throw new Error('Only Asia/Taipei is configured for the first version.')
  }

  const jobs: ReminderJob[] = []

  if (event) {
    const scheduledFor = new Date(
      new Date(event.startsAt).getTime() - 30 * 60 * 1000,
    ).toISOString()

    jobs.push(
      createJob(event.ownerId, 'in_app', 'calendarEvent', event.id, event.title, scheduledFor),
      createJob(event.ownerId, 'email', 'calendarEvent', event.id, event.title, scheduledFor),
    )
  }

  if (task) {
    const dueDate = new Date(task.dueAt)
    const localDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dueDate)
    const scheduledFor = new Date(`${localDate}T09:00:00.000+08:00`).toISOString()

    jobs.push(
      createJob(task.ownerId, 'in_app', 'calendarTask', task.id, task.title, scheduledFor),
      createJob(task.ownerId, 'email', 'calendarTask', task.id, task.title, scheduledFor),
    )
  }

  return jobs
}

export function resolveReminderDelivery(
  jobs: ReminderJob[],
  options: DeliveryOptions,
): ReminderJob[] {
  return jobs.map((job) => {
    if (job.channel === 'email' && !options.emailProviderConfigured) {
      return { ...job, status: 'provider_not_configured' }
    }

    return { ...job, status: 'queued' }
  })
}

function createJob(
  ownerId: string,
  channel: ReminderJob['channel'],
  resourceType: ReminderJob['resourceType'],
  resourceId: string,
  title: string,
  scheduledFor: string,
): ReminderJob {
  return {
    id: `${resourceType}-${resourceId}-${channel}`,
    ownerId,
    channel,
    resourceType,
    resourceId,
    title,
    scheduledFor,
    status: 'queued',
  }
}

export const reminderDefaults = {
  eventLeadMinutes: 30,
  taskLocalHour: 9,
  taskLocalTimezoneOffsetHours: taipeiOffsetHours,
}
