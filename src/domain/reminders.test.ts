import { describe, expect, it } from 'vitest'
import { createReminderJobs, resolveReminderDelivery } from './reminders'
import type { CalendarEvent, CalendarTask } from './types'

const event: CalendarEvent = {
  id: 'event-1',
  ownerId: 'user-1',
  title: '小組共同日曆',
  startsAt: '2026-06-24T10:00:00.000Z',
  endsAt: '2026-06-24T11:00:00.000Z',
  visibility: 'shared',
  participantIds: ['user-2'],
}

const task: CalendarTask = {
  id: 'task-1',
  ownerId: 'user-1',
  title: '寄出心得草稿',
  dueAt: '2026-06-25T15:30:00.000Z',
  priority: 'high',
  assigneeIds: ['user-2'],
}

describe('calendar reminder planning', () => {
  it('creates in-app and email jobs for event and task reminders', () => {
    const jobs = createReminderJobs({
      event,
      task,
      timezone: 'Asia/Taipei',
    })

    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'in_app',
          resourceType: 'calendarEvent',
          resourceId: 'event-1',
          scheduledFor: '2026-06-24T09:30:00.000Z',
        }),
        expect.objectContaining({
          channel: 'email',
          resourceType: 'calendarEvent',
          resourceId: 'event-1',
          scheduledFor: '2026-06-24T09:30:00.000Z',
        }),
        expect.objectContaining({
          channel: 'in_app',
          resourceType: 'calendarTask',
          resourceId: 'task-1',
          scheduledFor: '2026-06-25T01:00:00.000Z',
        }),
        expect.objectContaining({
          channel: 'email',
          resourceType: 'calendarTask',
          resourceId: 'task-1',
          scheduledFor: '2026-06-25T01:00:00.000Z',
        }),
      ]),
    )
  })

  it('keeps in-app reminders queued and marks email jobs when provider setup is missing', () => {
    const jobs = createReminderJobs({ event, timezone: 'Asia/Taipei' })
    const resolved = resolveReminderDelivery(jobs, {
      emailProviderConfigured: false,
    })

    expect(resolved.find((job) => job.channel === 'in_app')?.status).toBe(
      'queued',
    )
    expect(resolved.find((job) => job.channel === 'email')?.status).toBe(
      'provider_not_configured',
    )
  })
})
