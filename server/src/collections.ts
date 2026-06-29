export const collections = {
  profiles: 'profiles',
  friendGroups: 'friendGroups',
  folders: 'folders',
  notes: 'notes',
  noteAttachments: 'noteAttachments',
  reflections: 'reflections',
  reflectionPhotos: 'reflectionPhotos',
  chatPosts: 'chatPosts',
  chatReplies: 'chatReplies',
  chatThreads: 'chatThreads',
  chatMessages: 'chatMessages',
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
