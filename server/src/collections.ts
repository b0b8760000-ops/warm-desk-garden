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

export type CollectionName = (typeof collections)[keyof typeof collections]
