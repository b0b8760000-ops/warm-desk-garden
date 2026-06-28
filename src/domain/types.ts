export type UserId = string

export type LinkedResource = {
  type: 'note' | 'reflection' | 'chatPost' | 'photo'
  id: string
  title: string
}

export type CalendarEvent = {
  id: string
  ownerId: UserId
  title: string
  description?: string
  startsAt: string
  endsAt: string
  visibility: 'private' | 'shared'
  participantIds: UserId[]
  linkedResource?: LinkedResource
  location?: string
  color?: string
}

export type CalendarTask = {
  id: string
  ownerId: UserId
  title: string
  dueAt: string
  priority: 'low' | 'medium' | 'high'
  assigneeIds: UserId[]
  completedAt?: string | null
  eventId?: string
  noteId?: string
}

export type ReminderJob = {
  id: string
  ownerId: UserId
  channel: 'in_app' | 'email'
  resourceType: 'calendarEvent' | 'calendarTask'
  resourceId: string
  title: string
  scheduledFor: string
  status: 'queued' | 'sent' | 'provider_not_configured'
}

export type Folder = {
  id: string
  name: string
  count: number
  color: string
}

export type Note = {
  id: string
  title: string
  excerpt: string
  folder: string
  date: string
  imageUrl: string
  photoCount?: number
  likeCount?: number
  fileCount?: number
  isStarred?: boolean
}

export type ChatPost = {
  id: string
  author: string
  avatarUrl: string
  text: string
  time: string
  unread?: number
}

export type Friend = {
  id: string
  name: string
  status: string
  avatarUrl: string
  tone: 'green' | 'amber' | 'gray'
  isStarred?: boolean
  friendshipId?: string
  friendshipStatus?: 'pending' | 'accepted' | 'declined'
  isIncoming?: boolean
}

export type Photo = {
  id: string
  title: string
  imageUrl: string
  styleType?: 'polaroid' | 'scalloped' | 'film'
  tapeColor?: string
  isStarred?: boolean
  dayOfWeek?: string
  location?: string
}

export type Album = {
  id: string
  title: string
  description: string
  date: string
  coverUrl: string
  themeColor: 'wine' | 'forest' | 'navy' | 'tobacco'
  photoIds: string[]
  weekNum?: number
  location?: string
}


export type FriendGroup = {
  id: string
  name: string
  memberIds: string[]
}

export type ChatThreadMessage = {
  id: string
  author: string
  text: string
  time: string
  mine?: boolean
}

export type ChatThread = {
  id: string
  name: string
  type: 'direct' | 'group'
  avatarUrl?: string
  messages: ChatThreadMessage[]
}

export type FriendPhoto = {
  id: string
  author: string
  avatarUrl: string
  imageUrl: string
  title: string
  weekNum: number
  date: string
  location: string
  badge?: string
  isLiked?: boolean
}
