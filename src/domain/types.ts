export type UserId = string

export type LinkedResource = {
  type: 'note' | 'reflection' | 'chatPost' | 'photo'
  id: string
  title: string
}

export type StoredFileCategory =
  | 'avatars'
  | 'backgrounds'
  | 'notes'
  | 'journals'
  | 'chat'
  | 'albums'
  | 'pdfs'

export type StoredFileMetadata = {
  fileId?: string
  bucketId?: string
  storagePath?: string
  category?: StoredFileCategory
  url: string
  mimeType?: string
  size?: number
  originalName?: string
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
  ownerId?: UserId
  name: string
  count: number
  color: string
  visibility?: 'private' | 'shared'
  visibleToUserIds?: UserId[]
}

export type Note = {
  id: string
  ownerId?: UserId
  folderId?: string
  title: string
  excerpt: string
  folder: string
  date: string
  imageUrl: string
  photoCount?: number
  likeCount?: number
  fileCount?: number
  isStarred?: boolean
  visibility?: 'private' | 'shared'
  visibleToUserIds?: UserId[]
}

export type NoteAttachment = StoredFileMetadata & {
  id: string
  ownerId?: UserId
  noteId?: string
  name: string
  kind: 'photo' | 'pdf'
  visibility?: 'private' | 'shared'
  visibleToUserIds?: UserId[]
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
  email?: string
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
  ownerId?: string
  ownerName?: string
  ownerAvatarUrl?: string
  visibleToUserIds?: string[]
  albumTitle?: string
  weekNum?: number
  likedByUserIds?: UserId[]
  comments?: PhotoComment[]
  fileId?: string
  bucketId?: string
  storagePath?: string
  category?: StoredFileCategory
  mimeType?: string
  size?: number
  originalName?: string
}

export type PhotoComment = {
  id: string
  authorId: UserId
  author: string
  avatarUrl: string
  timeLabel: string
  text: string
  likedByUserIds?: UserId[]
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
  ownerId?: string
  ownerName?: string
  ownerAvatarUrl?: string
  visibleToUserIds?: string[]
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
  attachmentIds?: string[]
}

export type ChatThread = {
  id: string
  name: string
  type: 'direct' | 'group'
  avatarUrl?: string
  messages: ChatThreadMessage[]
  memberIds?: UserId[]
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
  likedByUserIds?: UserId[]
  comments?: PhotoComment[]
}
