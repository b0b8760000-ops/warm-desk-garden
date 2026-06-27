import { describe, expect, it } from 'vitest'
import {
  canCompleteTask,
  canEditCalendarEvent,
  canReadCalendarEvent,
} from './access'
import type { CalendarEvent, CalendarTask } from './types'

const sharedEvent: CalendarEvent = {
  id: 'event-study',
  ownerId: 'user-1',
  title: '期末讀書會',
  startsAt: '2026-06-24T10:00:00.000Z',
  endsAt: '2026-06-24T11:30:00.000Z',
  visibility: 'shared',
  participantIds: ['user-2'],
  linkedResource: { type: 'note', id: 'note-1', title: '資料庫筆記' },
}

const privateEvent: CalendarEvent = {
  id: 'event-private',
  ownerId: 'user-1',
  title: '整理心得',
  startsAt: '2026-06-24T13:00:00.000Z',
  endsAt: '2026-06-24T14:00:00.000Z',
  visibility: 'private',
  participantIds: [],
}

const assignedTask: CalendarTask = {
  id: 'task-1',
  ownerId: 'user-1',
  title: '整理旅行相簿',
  dueAt: '2026-06-25T02:00:00.000Z',
  priority: 'medium',
  assigneeIds: ['user-2'],
}

describe('calendar access rules', () => {
  it('lets owners and invited friends read shared events while private events stay owner-only', () => {
    expect(canReadCalendarEvent(sharedEvent, 'user-1')).toBe(true)
    expect(canReadCalendarEvent(sharedEvent, 'user-2')).toBe(true)
    expect(canReadCalendarEvent(sharedEvent, 'user-3')).toBe(false)
    expect(canReadCalendarEvent(privateEvent, 'user-2')).toBe(false)
  })

  it('only lets the owner edit a calendar event in the first version', () => {
    expect(canEditCalendarEvent(sharedEvent, 'user-1')).toBe(true)
    expect(canEditCalendarEvent(sharedEvent, 'user-2')).toBe(false)
  })

  it('lets the owner or assignee complete a shared task', () => {
    expect(canCompleteTask(assignedTask, 'user-1')).toBe(true)
    expect(canCompleteTask(assignedTask, 'user-2')).toBe(true)
    expect(canCompleteTask(assignedTask, 'user-3')).toBe(false)
  })
})
