import type { CalendarEvent, CalendarTask, UserId } from './types'

export function canReadCalendarEvent(
  event: CalendarEvent,
  currentUserId: UserId,
) {
  if (event.ownerId === currentUserId) {
    return true
  }

  return (
    event.visibility === 'shared' &&
    event.participantIds.includes(currentUserId)
  )
}

export function canEditCalendarEvent(
  event: CalendarEvent,
  currentUserId: UserId,
) {
  return event.ownerId === currentUserId
}

export function canCompleteTask(task: CalendarTask, currentUserId: UserId) {
  return (
    task.ownerId === currentUserId || task.assigneeIds.includes(currentUserId)
  )
}
