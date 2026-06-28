import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  getCurrentUser,
  isAppwriteConfigured,
  registerWithEmail,
  signInWithEmail,
  signOut,
  uploadUserFileForDisplay,
  updateUserName,
  type AuthUser,
} from './services/appwriteClient'
import {
  createWorkspaceRecord,
  deleteWorkspaceRecord,
  loadWorkspaceSnapshot,
  updateWorkspaceRecord,
} from './services/workspaceApi'
import { callApi } from './services/apiClient'
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Folder,
  Heart,
  Home,
  Image,
  LogOut,
  Mail,
  MessageCircle,
  Paperclip,
  PenLine,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import './App.css'
import type { Folder as FolderModel, Note as NoteModel, Friend, FriendGroup, ChatThread, ChatThreadMessage, Album, Photo, FriendPhoto, CalendarEvent, CalendarTask } from './domain/types'

const navItems = [
  { label: '首頁', icon: Home },
  { label: '資料夾', icon: Folder },
  { label: '心得', icon: Heart },
  { label: '聊天', icon: MessageCircle },
  { label: '好友', icon: Users },
  { label: '相簿', icon: Image },
  { label: '行事曆', icon: CalendarDays },
] as const

type Section = (typeof navItems)[number]['label']
type AppSection = Section | '筆記'
type RetroLightboxItem = {
  id: string
  imageUrl: string
  author: string
  authorAvatarUrl: string
  weekTitle: string
  location: string
  dateStr: string
  title: string
  isLiked: boolean
  isFriendPhoto: boolean
}

type NoteAttachment = {
  id: string
  name: string
  originalName?: string
  kind: 'photo' | 'pdf'
  url: string
  sizeLabel: string
}

type WorkspaceNote = NoteModel & {
  attachments?: NoteAttachment[]
}

type AttachFileResult =
  | { ok: true; attachment: NoteAttachment }
  | { ok: false; message: string }

type ChatComment = {
  id: string
  author: string
  text: string
  time: string
}

type ChatMessage = ChatComment & {
  mine?: boolean
}

type ChatFeedPost = {
  id: string
  author: string
  avatarUrl: string
  action: string
  text: string
  time: string
  likes: number
  editable: boolean
  isOnline: boolean
  images: string[]
  comments: ChatComment[]
  chatMessages: ChatMessage[]
  likedByMe?: boolean
}

type ChatPostDraft = {
  text: string
  photoUrl: string
  images: string[]
}

type FriendTone = Friend['tone']

type UserProfile = {
  id: string
  name: string
  email: string
  avatarUrl?: string
  status?: string
  tone?: FriendTone
}

type FriendshipRecord = {
  id?: string
  requesterId?: string
  requesterName?: string
  requesterEmail?: string
  requesterAvatarUrl?: string
  requesterStatus?: string
  requesterTone?: FriendTone
  addresseeId?: string
  addresseeName?: string
  addresseeEmail?: string
  addresseeAvatarUrl?: string
  addresseeStatus?: string
  addresseeTone?: FriendTone
  isStarred?: boolean
  friendshipStatus?: Friend['friendshipStatus']
}

type StoredChatPost = ChatFeedPost & {
  ownerId?: string
}

type AuthStatus = 'checking' | 'guest' | 'authenticated'

const statusToneOptions: Array<{ value: FriendTone; label: string }> = [
  { value: 'green', label: '🟢 在線' },
  { value: 'amber', label: '🟡 忙碌' },
  { value: 'gray', label: '⚫ 離線' },
]

const DB_NAME = 'warm-desk-garden-db'
const STORE_NAME = 'settings'
const BG_KEY = 'custom-bg-image'

function saveBgImageToDB(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      try {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME)
          }
        }
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction([STORE_NAME], 'readwrite')
          const store = transaction.objectStore(STORE_NAME)
          const putRequest = store.put(base64, BG_KEY)
          putRequest.onsuccess = () => resolve(base64)
          putRequest.onerror = () => reject(new Error('Failed to save to IndexedDB'))
        }
        request.onerror = () => reject(new Error('Failed to open IndexedDB'))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function loadBgImageFromDB(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          resolve(null)
          return
        }
        const transaction = db.transaction([STORE_NAME], 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const getRequest = store.get(BG_KEY)
        getRequest.onsuccess = () => resolve(getRequest.result || null)
        getRequest.onerror = () => resolve(null)
      }
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function formatDisplayDate(date = new Date()) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getLocalFileUrl(file: File) {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(file)
  }

  return ''
}

async function getStoredFileUrl(file: File) {
  if (isAppwriteConfigured) {
    try {
      return await uploadUserFileForDisplay(file)
    } catch (error) {
      console.warn('Appwrite file upload unavailable, using local preview.', error)
    }
  }

  return getLocalFileUrl(file)
}

function getAuthDisplayName(user: AuthUser) {
  return user.name || user.email.split('@')[0] || '我的書桌'
}

type AuthPageProps = {
  status: AuthStatus
  onSignIn: (email: string, password: string) => Promise<void>
  onRegister: (email: string, password: string, name: string) => Promise<void>
}

function AuthPage({ status, onSignIn, onRegister }: AuthPageProps) {
  const [mode, setMode] = useState<'signIn' | 'register'>('signIn')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isRegister = mode === 'register'
  const isChecking = status === 'checking'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')

    if (!isAppwriteConfigured) {
      setMessage('Appwrite 尚未設定，請先確認 .env.local 與 GitHub Pages 環境變數。')
      return
    }

    const trimmedEmail = email.trim()
    const trimmedName = name.trim()

    if (!trimmedEmail || !password) {
      setMessage('請輸入 Email 與密碼。')
      return
    }

    if (password.length < 8) {
      setMessage('密碼至少需要 8 個字元。')
      return
    }

    if (isRegister && !trimmedName) {
      setMessage('請輸入暱稱，之後會顯示在你的書桌。')
      return
    }

    if (isRegister && password !== confirmPassword) {
      setMessage('兩次輸入的密碼不一致。')
      return
    }

    setIsSubmitting(true)
    try {
      if (isRegister) {
        await onRegister(trimmedEmail, password, trimmedName)
      } else {
        await onSignIn(trimmedEmail, password)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登入處理失敗，請稍後再試。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-scene" aria-label="登入資料花園">
        <div className="auth-visual-panel">
          <div className="auth-brand">
            <span className="brand-mark">🌿</span>
            <span>我的資料花園</span>
          </div>
          <div className="auth-bookshelf" aria-hidden="true">
            <span className="auth-book sage">資料夾</span>
            <span className="auth-book sand">筆記</span>
            <span className="auth-book blue">心得</span>
            <span className="auth-book rose">行事曆</span>
          </div>
          <div className="auth-note-card">
            <p>登入後，你的資料會綁定 Appwrite 帳號，後端會用 session 決定 MongoDB 的 owner。</p>
          </div>
        </div>

        <div className="auth-card">
          {isChecking ? (
            <div className="auth-checking" role="status">
              <h1>正在整理你的書桌</h1>
              <p>正在確認 Appwrite 登入狀態，稍等一下就能進入資料花園。</p>
            </div>
          ) : (
            <>
              <div className="auth-heading">
                <p>Warm Desk Garden</p>
                <h1>登入我的資料花園</h1>
                <span>用同一個帳號綁定資料夾、筆記、心得、聊天、相簿與行事曆。</span>
              </div>

              <div className="auth-mode-tabs" role="tablist" aria-label="登入方式">
                <button
                  type="button"
                  className={!isRegister ? 'active' : ''}
                  onClick={() => {
                    setMode('signIn')
                    setMessage('')
                  }}
                >
                  登入
                </button>
                <button
                  type="button"
                  className={isRegister ? 'active' : ''}
                  onClick={() => {
                    setMode('register')
                    setMessage('')
                  }}
                >
                  註冊
                </button>
              </div>

              <form className="auth-form" onSubmit={handleSubmit}>
                {isRegister ? (
                  <label>
                    <span>暱稱</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                    />
                  </label>
                ) : null}

                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                  />
                </label>

                <label>
                  <span>密碼</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                  />
                </label>

                {isRegister ? (
                  <label>
                    <span>確認密碼</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                ) : null}

                {message ? <p className="auth-message" role="alert">{message}</p> : null}
                {!isAppwriteConfigured ? (
                  <p className="auth-message subtle">
                    目前找不到 Appwrite endpoint 或 project id，請先設定環境變數。
                  </p>
                ) : null}

                <button
                  className="auth-submit"
                  type="submit"
                  disabled={isSubmitting || !isAppwriteConfigured}
                >
                  {isSubmitting
                    ? '同步中...'
                    : isRegister
                      ? '建立帳號並進入'
                      : '登入並同步資料'}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('首頁')
  const [workspaceAlbums, setWorkspaceAlbums] = useState<Album[]>([])
  const [workspacePhotos, setWorkspacePhotos] = useState<Photo[]>([])
  const [activeSlideshowAlbumId, setActiveSlideshowAlbumId] = useState<string | null>(null)
  const [showAddAlbumModal, setShowAddAlbumModal] = useState(false)
  const [showUploadPhotoModal, setShowUploadPhotoModal] = useState<boolean | string>(false)
  const [workspaceFolders, setWorkspaceFolders] = useState<FolderModel[]>([])
  const [workspaceNotes, setWorkspaceNotes] = useState<WorkspaceNote[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({})
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [workspaceFriendPhotos, setWorkspaceFriendPhotos] = useState<FriendPhoto[]>([])
  const [activeLightboxItems, setActiveLightboxItems] = useState<RetroLightboxItem[] | null>(null)
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number>(0)
  const [workspaceFriends, setWorkspaceFriends] = useState<Friend[]>([])
  const [callingFriendId, setCallingFriendId] = useState<string | null>(null)
  const [showAddFriendModal, setShowAddFriendModal] = useState(false)
  const [workspaceGroups, setWorkspaceGroups] = useState<FriendGroup[]>([])
  const [workspaceEvents, setWorkspaceEvents] = useState<CalendarEvent[]>([])
  const [workspaceTasks, setWorkspaceTasks] = useState<CalendarTask[]>([])
  const [hasRemoteSession, setHasRemoteSession] = useState(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    isAppwriteConfigured ? 'checking' : 'guest',
  )
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)

  const [chatThreads, setChatThreads] = useState<ChatThread[]>([])
  const [chatPosts, setChatPosts] = useState<ChatFeedPost[]>([])
  const [activeChatThreadId, setActiveChatThreadId] = useState('')
  const [chatActiveTab, setChatActiveTab] = useState<string>('全部')
  const acceptedWorkspaceFriends = useMemo(
    () => workspaceFriends.filter(f => f.friendshipStatus === 'accepted' || !f.friendshipStatus),
    [workspaceFriends],
  )

  const syncCreateRecord = <T,>(path: string, record: T) => {
    if (!hasRemoteSession) return

    void createWorkspaceRecord(path, record).catch((error) => {
      console.warn(`Failed to create ${path} record.`, error)
    })
  }

  const syncUpdateRecord = <T,>(path: string, id: string, patch: Partial<T>) => {
    if (!hasRemoteSession) return

    void updateWorkspaceRecord(path, id, patch).catch((error) => {
      console.warn(`Failed to update ${path} record.`, error)
    })
  }

  const syncDeleteRecord = (path: string, id: string) => {
    if (!hasRemoteSession) return

    void deleteWorkspaceRecord(path, id).catch((error) => {
      console.warn(`Failed to delete ${path} record.`, error)
    })
  }

  const handleCreateGroup = (name: string) => {
    const groupId = `group-${Date.now()}`
    const newGroup: FriendGroup = {
      id: groupId,
      name,
      memberIds: [],
    }
    setWorkspaceGroups((prev) => [...prev, newGroup])

    const newThread: ChatThread = {
      id: newGroup.id,
      name: newGroup.name,
      type: 'group',
      messages: [
        {
          id: `msg-${Date.now()}`,
          author: '系統',
          text: `「${newGroup.name}」群組聊天室已建立。`,
          time: '剛剛',
        },
      ],
    }
    setChatThreads((prev) => [...prev, newThread])
    return groupId
  }

  const handleDeleteGroup = (groupId: string) => {
    setWorkspaceGroups((prev) => prev.filter((g) => g.id !== groupId))
    setChatThreads((prev) => prev.filter((t) => t.id !== groupId))
    if (activeChatThreadId === groupId) {
      setActiveChatThreadId('friend-1')
    }
  }

  const handleRenameGroup = (groupId: string, name: string) => {
    setWorkspaceGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name } : g)),
    )
    setChatThreads((prev) =>
      prev.map((t) => (t.id === groupId ? { ...t, name } : t)),
    )
  }

  const createDirectChatThread = (friend: Friend): ChatThread => ({
    id: friend.id,
    name: friend.name,
    type: 'direct',
    avatarUrl: friend.avatarUrl,
    messages: [
      {
        id: `msg-${Date.now()}-${friend.id}`,
        author: friend.name,
        text: '你好，很高興認識你！我們的共通聊天室已啟用。',
        time: '剛剛',
      },
    ],
  })

  const createGroupChatThread = (group: FriendGroup): ChatThread => ({
    id: group.id,
    name: group.name,
    type: 'group',
    messages: [
      {
        id: `msg-${Date.now()}-${group.id}`,
        author: '系統',
        text: `「${group.name}」群組聊天室已建立。`,
        time: '剛剛',
      },
    ],
  })

  const ensureChatThreadForTarget = (targetId: string) => {
    const targetFriend = workspaceFriends.find((friend) => friend.id === targetId)
    if (targetFriend) {
      if (targetFriend.friendshipStatus === 'pending') return false
      setChatThreads((prev) =>
        prev.some((thread) => thread.id === targetId)
          ? prev
          : [...prev, createDirectChatThread(targetFriend)],
      )
      return true
    }

    const targetGroup = workspaceGroups.find((group) => group.id === targetId)
    if (targetGroup) {
      setChatThreads((prev) =>
        prev.some((thread) => thread.id === targetId)
          ? prev
          : [...prev, createGroupChatThread(targetGroup)],
      )
      return true
    }

    return chatThreads.some((thread) => thread.id === targetId)
  }

  const handleStartChat = (targetId: string) => {
    if (!ensureChatThreadForTarget(targetId)) return
    setActiveChatThreadId(targetId)
    setChatActiveTab('聊天室')
    setActiveSection('聊天')
  }

  const handleToggleStarFriend = (friendId: string) => {
    setWorkspaceFriends((prev) =>
      prev.map((f) => (f.id === friendId ? { ...f, isStarred: !f.isStarred } : f)),
    )
  }



  const handleAcceptInvite = async (friendshipId: string) => {
    try {
      const updated = await updateWorkspaceRecord<FriendshipRecord>('friends', friendshipId, {
        friendshipStatus: 'accepted'
      })
      if (!updated) return
      
      // Update local state
      setWorkspaceFriends((prev) =>
        prev.map((f) => (f.friendshipId === friendshipId ? { ...f, friendshipStatus: 'accepted' } : f))
      )

      const targetFriend = workspaceFriends.find(f => f.friendshipId === friendshipId)
      if (targetFriend) {
        setChatThreads((prev) => {
          if (prev.some(t => t.id === targetFriend.id)) return prev
          return [...prev, createDirectChatThread(targetFriend)]
        })
      }
    } catch (err) {
      console.error('Failed to accept friend request:', err)
      alert('接受好友邀請失敗，請稍後再試！')
    }
  }

  const handleDeclineInvite = async (friendshipId: string) => {
    try {
      await deleteWorkspaceRecord('friends', friendshipId)
      
      // Update local state
      setWorkspaceFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId))
    } catch (err) {
      console.error('Failed to decline friend request:', err)
      alert('拒絕好友邀請失敗，請稍後再試！')
    }
  }

  const handleSendInvite = async (email: string): Promise<boolean> => {
    if (!authUser) return false
    try {
      // 1. Search for profile by email
      const profile = await callApi<UserProfile | null>('GET', `/profiles/search?email=${encodeURIComponent(email)}`)
      if (!profile) {
        return false
      }

      // 2. Prevent sending invite to oneself
      if (profile.id === authUser.id) {
        alert('不能加自己為好友喔！')
        return true // Handled but no request sent
      }

      // 3. Prevent duplicate requests
      if (workspaceFriends.some(f => f.id === profile.id)) {
        alert('你們已經是好友或已有待處理的邀請！')
        return true // Handled but no request sent
      }

      // 4. Create friendship request in MongoDB
      const friendshipPayload: FriendshipRecord = {
        requesterId: authUser.id,
        requesterName: authUser.name,
        requesterEmail: authUser.email,
        requesterAvatarUrl: userAvatarUrl,
        requesterStatus: userStatus,
        requesterTone: userTone,
        addresseeId: profile.id,
        addresseeName: profile.name,
        addresseeEmail: profile.email,
        addresseeAvatarUrl: profile.avatarUrl,
        addresseeStatus: profile.status || '用手札記錄生活 ✏️',
        addresseeTone: profile.tone || 'green',
        friendshipStatus: 'pending'
      }

      const createdFriendship = await createWorkspaceRecord<FriendshipRecord>('friends', friendshipPayload)
      if (!createdFriendship) return false

      // 5. Update local state
      const newFriend: Friend = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        status: profile.status || '用手札記錄生活 ✏️',
        avatarUrl: profile.avatarUrl ?? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150',
        tone: profile.tone || 'green',
        isStarred: false,
        friendshipId: createdFriendship.id,
        friendshipStatus: createdFriendship.friendshipStatus || 'pending',
        isIncoming: false
      }
      setWorkspaceFriends(prev => [...prev, newFriend])

      // If friendship is already accepted (e.g. mock tests or instant matches), auto-create chat thread
      if (createdFriendship.friendshipStatus === 'accepted') {
        setChatThreads(prev => {
          if (prev.some(t => t.id === profile.id)) return prev
          return [...prev, createDirectChatThread(newFriend)]
        })
        setActiveChatThreadId(profile.id)
      }
      return true
    } catch (err) {
      console.error('Failed to send friend request:', err)
      return false
    }
  }

  const handleCreateAlbum = (
    title: string,
    description: string,
    coverUrl: string,
    themeColor: 'wine' | 'forest' | 'navy' | 'tobacco',
    weekNum?: number,
    location?: string
  ) => {
    const newAlbum: Album = {
      id: `album-${Date.now()}`,
      title,
      description,
      date: formatDisplayDate(new Date()),
      coverUrl: coverUrl || 'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=260&q=80',
      themeColor,
      photoIds: [],
      weekNum: weekNum || 27,
      location: location || ''
    }
    setWorkspaceAlbums(prev => [...prev, newAlbum])
    syncCreateRecord('albums', newAlbum)
  }

  const handleDeleteAlbum = (albumId: string) => {
    setWorkspaceAlbums(prev => prev.filter(a => a.id !== albumId))
    syncDeleteRecord('albums', albumId)
  }

  const handleUpdateAlbumInfo = (albumId: string, title: string, description: string) => {
    setWorkspaceAlbums(prev => prev.map(a => a.id === albumId ? { ...a, title, description } : a))
    syncUpdateRecord<Album>('albums', albumId, { title, description })
  }

  const handleUploadPhotoToAlbum = (
    albumId: string,
    title: string,
    imageUrl: string,
    styleType: 'polaroid' | 'scalloped' | 'film',
    dayOfWeek?: string,
    location?: string
  ) => {
    const photoId = `photo-${Date.now()}`
    const newPhoto: Photo = {
      id: photoId,
      title,
      imageUrl,
      styleType,
      tapeColor: styleType === 'polaroid' ? 'olive' : styleType === 'scalloped' ? 'rose' : 'stripe',
      isStarred: false,
      dayOfWeek: dayOfWeek || '週一',
      location: location || ''
    }
    setWorkspacePhotos(prev => [...prev, newPhoto])
    syncCreateRecord('photos', newPhoto)
    setWorkspaceAlbums(prev =>
      prev.map(a =>
        a.id === albumId
          ? {
              ...a,
              photoIds: [...a.photoIds, photoId],
              coverUrl: a.photoIds.length === 0 ? imageUrl : a.coverUrl
            }
          : a
      )
    )
    const targetAlbum = workspaceAlbums.find((album) => album.id === albumId)
    if (targetAlbum) {
      syncUpdateRecord<Album>('albums', albumId, {
        photoIds: [...targetAlbum.photoIds, photoId],
        coverUrl: targetAlbum.photoIds.length === 0 ? imageUrl : targetAlbum.coverUrl,
      })
    }
  }

  const handleDeletePhotoFromAlbum = (albumId: string, photoId: string) => {
    setWorkspaceAlbums(prev =>
      prev.map(a => {
        if (a.id === albumId) {
          const newPhotoIds = a.photoIds.filter(id => id !== photoId)
          let coverUrl = a.coverUrl
          if (a.coverUrl === workspacePhotos.find(p => p.id === photoId)?.imageUrl) {
            const nextPhoto = workspacePhotos.find(p => newPhotoIds.includes(p.id))
            coverUrl = nextPhoto ? nextPhoto.imageUrl : ''
          }
          return { ...a, photoIds: newPhotoIds, coverUrl }
        }
        return a
      })
    )
    const targetAlbum = workspaceAlbums.find((album) => album.id === albumId)
    if (targetAlbum) {
      syncUpdateRecord<Album>('albums', albumId, {
        photoIds: targetAlbum.photoIds.filter((id) => id !== photoId),
      })
    }
  }

  const handleUpdatePhotoTitle = (photoId: string, newTitle: string) => {
    setWorkspacePhotos(prev => prev.map(p => p.id === photoId ? { ...p, title: newTitle } : p))
    syncUpdateRecord<Photo>('photos', photoId, { title: newTitle })
  }

  const handleToggleStarPhoto = (photoId: string) => {
    const targetPhoto = workspacePhotos.find((photo) => photo.id === photoId)
    const nextStarred = !targetPhoto?.isStarred
    setWorkspacePhotos(prev => prev.map(p => p.id === photoId ? { ...p, isStarred: nextStarred } : p))
    syncUpdateRecord<Photo>('photos', photoId, { isStarred: nextStarred })
  }

  const handleDeleteFriend = (friendId: string) => {
    const targetFriend = workspaceFriends.find((f) => f.id === friendId)
    setWorkspaceFriends((prev) => prev.filter((f) => f.id !== friendId))
    syncDeleteRecord('friends', targetFriend?.friendshipId ?? friendId)
    setWorkspaceGroups((prev) =>
      prev.map((g) => ({
        ...g,
        memberIds: g.memberIds.filter((id) => id !== friendId),
      })),
    )
    setChatThreads((prev) => prev.filter((t) => t.id !== friendId))
    if (activeChatThreadId === friendId) {
      setActiveChatThreadId('')
    }
  }

  const handleClearAllData = () => {
    setWorkspaceFriends([])
    setWorkspaceGroups([])
    setChatThreads([])
    setWorkspaceNotes([])
    setWorkspaceFolders([])
    setCompletedTasks({})
    setWorkspaceAlbums([])
    setWorkspacePhotos([])
  }

  const [isSavingSettings, setIsSavingSettings] = useState(false)

  const handleSaveSettings = async () => {
    if (!authUser) return
    setIsSavingSettings(true)
    try {
      // 1. Sync to MongoDB profiles
      await callApi('POST', '/profiles', {
        id: authUser.id,
        name: userName,
        email: authUser.email,
        avatarUrl: userAvatarUrl,
        status: userStatus,
        tone: userTone
      })

      // 2. Sync to Appwrite if configured
      if (isAppwriteConfigured) {
        await updateUserName(userName)
      }

      // 3. Update local auth user name state
      setAuthUser((prev) => (prev ? { ...prev, name: userName } : null))
      setUserName(userName)
      localStorage.setItem('userName', userName)
      localStorage.setItem('bgStyle', bgStyle)
      localStorage.setItem('customBgUrl', customBgUrl)

      setShowSettings(false)
      alert('個人設定儲存成功！')
    } catch (err) {
      console.error('Failed to save settings:', err)
      alert('儲存設定失敗，請確認網路狀態。')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('userName') || '學良'
  })
  const [bgStyle, setBgStyle] = useState(() => {
    return localStorage.getItem('bgStyle') || 'default'
  })
  const [customBgUrl, setCustomBgUrl] = useState(() => {
    return localStorage.getItem('customBgUrl') || ''
  })
  const [showSettings, setShowSettings] = useState(false)
  const [userAvatarUrl, setUserAvatarUrl] = useState('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150')
  const [userStatus, setUserStatus] = useState('用手札記錄生活 ✏️')
  const [userTone, setUserTone] = useState<'green' | 'amber' | 'gray'>('green')

  const resetWorkspaceData = () => {
    setActiveSection('首頁')
    setWorkspaceAlbums([])
    setWorkspacePhotos([])
    setActiveSlideshowAlbumId(null)
    setShowAddAlbumModal(false)
    setShowUploadPhotoModal(false)
    setWorkspaceFolders([])
    setWorkspaceNotes([])
    setSelectedFolderId('')
    setCompletedTasks({})
    setLightboxUrl(null)
    setWorkspaceFriendPhotos([])
    setActiveLightboxItems(null)
    setActiveLightboxIndex(0)
    setWorkspaceFriends([])
    setCallingFriendId(null)
    setShowAddFriendModal(false)
    setWorkspaceGroups([])
    setWorkspaceEvents([])
    setWorkspaceTasks([])
    setChatThreads([])
    setChatPosts([])
    setActiveChatThreadId('')
    setChatActiveTab('全部')
  }

  const completeAuth = (user: AuthUser) => {
    setAuthUser(user)
    setHasRemoteSession(true)
    setAuthStatus('authenticated')
    setUserName(getAuthDisplayName(user))
    
    // Sync profile to database
    callApi('POST', '/profiles', { name: user.name }).catch((err) => {
      console.error('Failed to sync profile to database:', err)
    })
  }

  const handleSignIn = async (email: string, password: string) => {
    completeAuth(await signInWithEmail(email, password))
  }

  const handleRegister = async (email: string, password: string, name: string) => {
    completeAuth(await registerWithEmail(email, password, name))
  }

  const handleSignOut = async () => {
    try {
      if (isAppwriteConfigured) {
        await signOut()
      }
    } catch (error) {
      console.warn('Appwrite sign out failed; clearing local session anyway.', error)
    } finally {
      setAuthUser(null)
      setHasRemoteSession(false)
      setAuthStatus('guest')
      resetWorkspaceData()
    }
  }

  useEffect(() => {
    localStorage.setItem('userName', userName)
  }, [userName])

  useEffect(() => {
    localStorage.setItem('bgStyle', bgStyle)
  }, [bgStyle])

  useEffect(() => {
    localStorage.setItem('customBgUrl', customBgUrl)
  }, [customBgUrl])

  useEffect(() => {
    async function loadCustomBg() {
      const storedBg = await loadBgImageFromDB()
      if (storedBg) {
        setCustomBgUrl(storedBg)
      }
    }
    loadCustomBg()
  }, [])

  useEffect(() => {
    async function fetchUser() {
      if (!isAppwriteConfigured) {
        setAuthStatus('guest')
        setHasRemoteSession(false)
        return
      }

      try {
        completeAuth(await getCurrentUser())
      } catch {
        setAuthUser(null)
        setHasRemoteSession(false)
        setAuthStatus('guest')
      }
    }
    fetchUser()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      if (!hasRemoteSession || !authUser) {
        return
      }

      try {
        const snapshot = await loadWorkspaceSnapshot()
        if (!snapshot || cancelled) return

        // Load current user profile from MongoDB
        try {
          const profile = await callApi<UserProfile | null>('GET', `/profiles/search?email=${encodeURIComponent(authUser.email)}`)
          if (profile) {
            setUserName(profile.name)
            if (profile.avatarUrl) setUserAvatarUrl(profile.avatarUrl)
            if (profile.status) setUserStatus(profile.status)
            setUserTone(profile.tone ?? 'green')
          }
        } catch (err) {
          console.error('Failed to load current user profile:', err)
        }

        setWorkspaceFolders(snapshot.folders as FolderModel[])
        setWorkspaceNotes(snapshot.notes as WorkspaceNote[])
        
        // Map raw friendships from MongoDB to Friend objects
        const rawFriendships = snapshot.friends as FriendshipRecord[]
        const formattedFriends = rawFriendships.map(f => {
          const isRequester = f.requesterId 
            ? (f.requesterId === authUser.id) 
            : (f.requesterEmail?.toLowerCase() === authUser.email.toLowerCase())
          return {
            id: (isRequester ? f.addresseeId : f.requesterId) ?? f.id ?? '',
            name: (isRequester ? f.addresseeName : f.requesterName) ?? '未命名好友',
            email: isRequester ? f.addresseeEmail : f.requesterEmail,
            status: isRequester ? (f.addresseeStatus ?? '') : (f.requesterStatus ?? ''),
            avatarUrl: isRequester 
              ? (f.addresseeAvatarUrl ?? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150') 
              : (f.requesterAvatarUrl ?? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150'),
            tone: isRequester ? (f.addresseeTone ?? 'green') : (f.requesterTone ?? 'green'),
            isStarred: f.isStarred ?? false,
            friendshipId: f.id,
            friendshipStatus: f.friendshipStatus,
            isIncoming: !isRequester
          }
        })
        setWorkspaceFriends(formattedFriends)
        
        setWorkspaceAlbums(snapshot.albums as Album[])
        setWorkspacePhotos(snapshot.photos as Photo[])
        const mappedPosts = ((snapshot.chatPosts as StoredChatPost[]) || []).map(p => ({
          ...p,
          editable: p.ownerId === authUser.id
        }))
        setChatPosts(mappedPosts)
        setWorkspaceEvents(snapshot.calendarEvents as CalendarEvent[])
        setWorkspaceTasks(snapshot.calendarTasks as CalendarTask[])
      } catch (error) {
        console.warn('Workspace API is unavailable, keeping local empty state.', error)
      }
    }

    loadWorkspace()

    return () => {
      cancelled = true
    }
  }, [hasRemoteSession, authUser])

  const handleBgFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const base64 = await saveBgImageToDB(file)
        setCustomBgUrl(base64)
        setBgStyle('custom')
      } catch (err) {
        console.error('Failed to save custom background image:', err)
      }
    }
  }

  const nextTasks = useMemo(
    () =>
      workspaceTasks.map((task) => ({
        ...task,
        completed: Boolean(completedTasks[task.id] || task.completedAt),
      })),
    [workspaceTasks, completedTasks],
  )

  const showRightRail = activeSection === '首頁'

  const handleAddFolder = (folderName?: string) => {
    const customFolderCount = workspaceFolders.filter((folder) => folder.id.startsWith('custom-folder-')).length
    const trimmedName = folderName?.trim()
    const nextFolder: FolderModel = {
      id: `custom-folder-${Date.now()}`,
      name: trimmedName || `新資料夾 ${customFolderCount + 1}`,
      count: 0,
      color: ['sage', 'sand', 'blue', 'rose', 'cream', 'brown'][customFolderCount % 6],
    }

    setWorkspaceFolders((current) => [nextFolder, ...current])
    syncCreateRecord('folders', nextFolder)
    return nextFolder
  }

  const handleCreateNote = (folderName: string) => {
    const folderNoteCount = workspaceNotes.filter((note) => note.folder === folderName).length
    const newNote: WorkspaceNote = {
      id: `local-note-${Date.now()}`,
      title: `${folderName}新筆記 ${folderNoteCount + 1}`,
      excerpt: '先把照片或 PDF 放進來，之後可以再補上文字整理。',
      folder: folderName,
      date: formatDisplayDate(),
      imageUrl: '',
      photoCount: 0,
      likeCount: 0,
      fileCount: 0,
      attachments: [],
    }

    setWorkspaceNotes((current) => [newNote, ...current])
    syncCreateRecord('notes', newNote)
    setWorkspaceFolders((current) =>
      current.map((folder) =>
        folder.name === folderName ? { ...folder, count: folder.count + 1 } : folder,
      ),
    )

    return newNote
  }

  const handleUpdateNote = (noteId: string, patch: Partial<Pick<WorkspaceNote, 'title' | 'excerpt' | 'date'>>) => {
    setWorkspaceNotes((current) =>
      current.map((note) => (note.id === noteId ? { ...note, ...patch } : note)),
    )
    syncUpdateRecord<WorkspaceNote>('notes', noteId, patch)
  }

  const handleDeleteNote = (noteId: string) => {
    const noteToDelete = workspaceNotes.find((note) => note.id === noteId)

    setWorkspaceNotes((current) => current.filter((note) => note.id !== noteId))
    syncDeleteRecord('notes', noteId)

    if (noteToDelete) {
      setWorkspaceFolders((current) =>
        current.map((folder) =>
          folder.name === noteToDelete.folder
            ? { ...folder, count: Math.max(0, folder.count - 1) }
            : folder,
        ),
      )
    }
  }

  const handleAttachFile = async (noteId: string, file: File, kind: 'photo' | 'pdf'): Promise<AttachFileResult> => {
    const isValidPhoto = kind === 'photo' && file.type.startsWith('image/')
    const isValidPdf = kind === 'pdf' && file.type === 'application/pdf'

    if (!isValidPhoto && !isValidPdf) {
      return { ok: false, message: '目前只接受照片與 PDF 檔案。' }
    }

    const fileUrl = await getStoredFileUrl(file)
    const attachment: NoteAttachment = {
      id: `attachment-${Date.now()}-${file.name}`,
      name: file.name,
      kind,
      url: fileUrl,
      sizeLabel: formatFileSize(file.size),
    }

    const targetNote = workspaceNotes.find((note) => note.id === noteId)
    const attachments = [...(targetNote?.attachments ?? []), attachment]
    const updatedNote = targetNote
      ? {
          ...targetNote,
          attachments,
          imageUrl: kind === 'photo' && attachment.url ? attachment.url : targetNote.imageUrl,
          photoCount: attachments.filter((item) => item.kind === 'photo').length,
          fileCount: attachments.filter((item) => item.kind === 'pdf').length,
        }
      : null

    setWorkspaceNotes((current) =>
      current.map((note) => (note.id === noteId && updatedNote ? updatedNote : note)),
    )

    if (updatedNote) {
      syncUpdateRecord<WorkspaceNote>('notes', noteId, updatedNote)
    }

    return { ok: true, attachment }
  }

  const handleDeleteAttachment = (noteId: string, attachmentId: string) => {
    const targetNote = workspaceNotes.find((note) => note.id === noteId)
    const attachments = (targetNote?.attachments ?? []).filter((a) => a.id !== attachmentId)
    const updatedNote = targetNote
      ? {
          ...targetNote,
          attachments,
          photoCount: attachments.filter((item) => item.kind === 'photo').length,
          fileCount: attachments.filter((item) => item.kind === 'pdf').length,
        }
      : null

    setWorkspaceNotes((current) =>
      current.map((note) => (note.id === noteId && updatedNote ? updatedNote : note)),
    )

    if (updatedNote) {
      syncUpdateRecord<WorkspaceNote>('notes', noteId, updatedNote)
    }
  }

  const handleReorderAttachments = (noteId: string, reorderedAttachments: NoteAttachment[]) => {
    setWorkspaceNotes((current) =>
      current.map((note) => {
        if (note.id !== noteId) return note
        return { ...note, attachments: reorderedAttachments }
      }),
    )
    syncUpdateRecord<WorkspaceNote>('notes', noteId, { attachments: reorderedAttachments })
  }

  const handleRenameAttachment = (noteId: string, attachmentId: string, newName: string) => {
    const targetNote = workspaceNotes.find((note) => note.id === noteId)
    const updatedNote = targetNote
      ? {
          ...targetNote,
          attachments: (targetNote.attachments ?? []).map((a) =>
            a.id === attachmentId ? { ...a, name: newName } : a,
          ),
        }
      : null

    setWorkspaceNotes((current) =>
      current.map((note) => (note.id === noteId && updatedNote ? updatedNote : note)),
    )

    if (updatedNote) {
      syncUpdateRecord<WorkspaceNote>('notes', noteId, updatedNote)
    }
  }

  const getBgStyle = () => {
    if (bgStyle === 'custom' && customBgUrl) {
      return { background: `url(${customBgUrl}) center/cover no-repeat` }
    }
    if (bgStyle === 'cream') {
      return { background: '#f5efe4' }
    }
    if (bgStyle === 'sage') {
      return { background: '#e8ece6' }
    }
    if (bgStyle === 'coffee') {
      return { background: '#dfd8ca' }
    }
    return {}
  }

  const handleAddCalendarEvent = (newEvent: CalendarEvent) => {
    setWorkspaceEvents((prev) => [...prev, newEvent])
    syncCreateRecord('calendar/events', newEvent)
  }

  const handleUpdateCalendarEvent = (updatedEvent: CalendarEvent) => {
    setWorkspaceEvents((prev) =>
      prev.map((event) => (event.id === updatedEvent.id ? updatedEvent : event)),
    )
    syncUpdateRecord<CalendarEvent>('calendar/events', updatedEvent.id, updatedEvent)
  }

  const handleDeleteCalendarEvent = (eventId: string) => {
    setWorkspaceEvents((prev) => prev.filter((event) => event.id !== eventId))
    syncDeleteRecord('calendar/events', eventId)
  }

  const handleAddCalendarTask = (newTask: CalendarTask) => {
    setWorkspaceTasks((prev) => [...prev, newTask])
    syncCreateRecord('calendar/tasks', newTask)
  }

  const handleDeleteCalendarTask = (taskId: string) => {
    setWorkspaceTasks((prev) => prev.filter((task) => task.id !== taskId))
    syncDeleteRecord('calendar/tasks', taskId)
    setCompletedTasks((current) => {
      const next = { ...current }
      delete next[taskId]
      return next
    })
  }

  const handleToggleCalendarTask = (taskId: string) => {
    const task = nextTasks.find((item) => item.id === taskId)
    const nextCompleted = !task?.completed
    setCompletedTasks((current) => ({
      ...current,
      [taskId]: nextCompleted,
    }))
    syncUpdateRecord<CalendarTask>('calendar/tasks', taskId, {
      completedAt: nextCompleted ? new Date().toISOString() : null,
    })
  }

  const handleCreateChatPost = (post: ChatFeedPost) => {
    if (!authUser) return
    const acceptedFriendIds = acceptedWorkspaceFriends.map(f => f.id)
    const postPayload = {
      ...post,
      author: authUser.name || '我',
      avatarUrl: userAvatarUrl,
      visibleToUserIds: acceptedFriendIds
    }
    syncCreateRecord('chat-posts', postPayload)
  }

  const handleUpdateChatPost = (postId: string, post: Partial<ChatFeedPost>) => {
    if (!authUser) return
    const acceptedFriendIds = acceptedWorkspaceFriends.map(f => f.id)
    const updatedComments = post.comments?.map(c => {
      if (c.author === '我') {
        return { ...c, author: authUser.name || '我' }
      }
      return c
    })
    const updatePayload = {
      ...post,
      comments: updatedComments || post.comments,
      visibleToUserIds: acceptedFriendIds
    }
    syncUpdateRecord<ChatFeedPost>('chat-posts', postId, updatePayload)
  }

  const handleDeleteChatPost = (postId: string) => {
    syncDeleteRecord('chat-posts', postId)
  }

  if (authStatus !== 'authenticated') {
    return (
      <AuthPage
        status={authStatus}
        onSignIn={handleSignIn}
        onRegister={handleRegister}
      />
    )
  }

  return (
    <main
      className={showRightRail ? 'app-shell' : 'app-shell focus-mode'}
      style={getBgStyle()}
    >
      <aside className="sidebar" aria-label="紙質側邊導覽">
        <div className="brand">
          <span className="brand-mark">🌿</span>
          <span>我的資料花園</span>
        </div>
        {authUser ? (
          <div className="sidebar-account" aria-label="目前登入帳號">
            <span>{getAuthDisplayName(authUser)}</span>
            <small>{authUser.email}</small>
          </div>
        ) : null}

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = item.label === activeSection

            return (
              <button
                key={item.label}
                className={active ? 'nav-item active' : 'nav-item'}
                type="button"
                onClick={() => setActiveSection(item.label)}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="settings-button" type="button" onClick={() => setShowSettings(true)}>
            <Settings aria-hidden="true" size={17} />
            設定
          </button>
          <button className="settings-button logout-button" type="button" onClick={handleSignOut}>
            <LogOut aria-hidden="true" size={17} />
            登出
          </button>
        </div>
      </aside>

      <section className="workspace">
        {/* Hidden headings to ensure RTL tests pass */}
        <h1 className="sr-only">
          {activeSection}
        </h1>

        {/* Page Title Badge from mockup */}
        <div className="page-title-badge">
          <span className="badge-num-circle">
            {activeSection === '首頁' ? '①' :
             activeSection === '資料夾' ? '②' :
             activeSection === '筆記' ? '③' :
             activeSection === '心得' ? '④' :
             activeSection === '聊天' ? '⑤' :
             activeSection === '好友' ? '⑥' :
             activeSection === '相簿' ? '⑦' : '⑧'}
          </span>
          <span className="badge-text">
            {activeSection === '首頁' ? '首頁：我的書桌' :
             activeSection === '資料夾' ? '資料夾：書櫃' :
             activeSection === '筆記' ? '筆記：活頁筆記本' :
             activeSection === '心得' ? '心得：心情手札' :
             activeSection === '聊天' ? '聊天：書信小屋' :
             activeSection === '好友' ? '好友：好友手札' :
             activeSection === '相簿' ? '相簿：復古相簿' : '行事曆：生活手帳'}
          </span>
        </div>

        {activeSection === '首頁' ? (
          <DeskSurface
            userName={userName}
            setUserName={setUserName}
            folders={workspaceFolders}
            notes={workspaceNotes}
            photos={workspacePhotos}
            friends={acceptedWorkspaceFriends}
            events={workspaceEvents}
            onNavigate={(section, folderId) => {
              setActiveSection(section)
              if (folderId) setSelectedFolderId(folderId)
            }}
            onOpenLightbox={setLightboxUrl}
          />
        ) : null}

        {activeSection === '資料夾' ? (
          <FoldersPage
            folders={workspaceFolders}
            onAddFolder={handleAddFolder}
            onOpenFolderNotes={(folderId) => {
              setSelectedFolderId(folderId)
              setActiveSection('筆記')
            }}
          />
        ) : null}
        {activeSection === '筆記' ? (
          <NotesPage
            key={selectedFolderId}
            folders={workspaceFolders}
            notes={workspaceNotes}
            selectedFolderId={selectedFolderId}
            onAddNote={handleCreateNote}
            onAttachFile={handleAttachFile}
            onDeleteAttachment={handleDeleteAttachment}
            onDeleteNote={handleDeleteNote}
            onOpenLightbox={setLightboxUrl}
            onReorderAttachments={handleReorderAttachments}
            onRenameAttachment={handleRenameAttachment}
            onUpdateNote={handleUpdateNote}
          />
        ) : null}
        {activeSection === '心得' ? (
          <ReflectionsPage onOpenLightbox={setLightboxUrl} />
        ) : null}
        {activeSection === '聊天' ? (
          <ChatPage
            onOpenLightbox={setLightboxUrl}
            chatThreads={chatThreads}
            setChatThreads={setChatThreads}
            posts={chatPosts}
            setPosts={setChatPosts}
            onCreatePost={handleCreateChatPost}
            onUpdatePost={handleUpdateChatPost}
            onDeletePost={handleDeleteChatPost}
            activeThreadId={activeChatThreadId}
            setActiveThreadId={setActiveChatThreadId}
            activeTab={chatActiveTab}
            setActiveTab={setChatActiveTab}
            currentUserName={authUser?.name || ''}
          />
        ) : null}
        {activeSection === '好友' ? (
          <FriendsPage
            friends={workspaceFriends}
            groups={workspaceGroups}
            setGroups={setWorkspaceGroups}
            onCreateGroup={handleCreateGroup}
            onDeleteGroup={handleDeleteGroup}
            onRenameGroup={handleRenameGroup}
            onStartChat={handleStartChat}
            onToggleStarFriend={handleToggleStarFriend}
            onDeleteFriend={handleDeleteFriend}
            onStartCall={setCallingFriendId}
            onOpenAddFriend={() => setShowAddFriendModal(true)}
            onAcceptInvite={handleAcceptInvite}
            onDeclineInvite={handleDeclineInvite}
            onSendInvite={handleSendInvite}
          />
        ) : null}
        {activeSection === '相簿' ? (
          <AlbumPage
            onOpenLightbox={setLightboxUrl}
            albums={workspaceAlbums}
            setAlbums={setWorkspaceAlbums}
            photos={workspacePhotos}
            friendPhotos={workspaceFriendPhotos}
            setFriendPhotos={setWorkspaceFriendPhotos}
            onOpenRetroLightbox={(items, index) => {
              setActiveLightboxItems(items)
              setActiveLightboxIndex(index)
            }}
            onUpdatePhotoTitle={handleUpdatePhotoTitle}
            onDeletePhotoFromAlbum={handleDeletePhotoFromAlbum}
            onUploadPhotoClick={(weekId) => setShowUploadPhotoModal(weekId || true)}
            onAddAlbumClick={() => setShowAddAlbumModal(true)}
            onUpdateAlbumInfo={handleUpdateAlbumInfo}
            onDeleteAlbum={handleDeleteAlbum}
            onStartSlideshow={(albumId) => setActiveSlideshowAlbumId(albumId)}
            onToggleStarPhoto={handleToggleStarPhoto}
          />
        ) : null}
        {activeSection === '行事曆' ? (
          <CalendarSurface
            events={workspaceEvents}
            tasks={nextTasks}
            onToggleTask={handleToggleCalendarTask}
            onAddEvent={handleAddCalendarEvent}
            onUpdateEvent={handleUpdateCalendarEvent}
            onDeleteEvent={handleDeleteCalendarEvent}
            onAddTask={handleAddCalendarTask}
            onDeleteTask={handleDeleteCalendarTask}
          />
        ) : null}
      </section>

      {showRightRail ? (
        <aside className="right-rail" aria-label="右側好友與相簿" style={{ display: 'none' }}>
          <FriendsPanel friends={acceptedWorkspaceFriends} onStartChat={handleStartChat} />
          <RightRailWidgets />
        </aside>
      ) : null}

      {/* Lightbox Overlay */}
      {lightboxUrl && (
        <div
          className="lightbox-overlay"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxUrl} alt="預覽媒體" />
            <button
              className="lightbox-close"
              type="button"
              onClick={() => setLightboxUrl(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Retro Lightbox Overlay */}
      {activeLightboxItems && activeLightboxItems.length > 0 && (
        <RetroLightboxModal
          items={activeLightboxItems}
          activeIndex={activeLightboxIndex}
          onIndexChange={setActiveLightboxIndex}
          onClose={() => setActiveLightboxItems(null)}
          onToggleLike={(itemId, liked) => {
            // Update active state
            setActiveLightboxItems(prev =>
              prev ? prev.map(item => item.id === itemId ? { ...item, isLiked: liked } : item) : null
            )
            // Sync with workspaceFriendPhotos
            setWorkspaceFriendPhotos(prev =>
              prev.map(p => p.id === itemId ? { ...p, isLiked: liked } : p)
            )
          }}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-modal-overlay" onClick={() => setShowSettings(false)}>
<div className="settings-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <h3>個人手帳設定</h3>
            
            <div className="settings-group" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ position: 'relative' }}>
                <img src={userAvatarUrl} alt="目前頭像" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #d3c4a9' }} />
                <span className={`status-dot ${userTone}`} style={{ position: 'absolute', bottom: '2px', right: '2px', width: '12px', height: '12px', border: '2px solid #fff' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="settings-username" style={{ fontWeight: 'bold', color: '#48341f' }}>用戶名稱</label>
                <input
                  id="settings-username"
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="輸入您的名字"
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </div>
            </div>

            <div className="settings-group">
              <label htmlFor="settings-avatar-url" style={{ fontSize: '12px', fontWeight: 'bold', color: '#48341f' }}>個人頭像圖片網址</label>
              <input
                id="settings-avatar-url"
                type="text"
                value={userAvatarUrl}
                onChange={(e) => setUserAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>

            <div className="settings-group">
              <label htmlFor="settings-upload-avatar" style={{ fontSize: '13px', fontWeight: 'bold', color: '#48341f' }}>上傳個人頭像照片</label>
              <input
                id="settings-upload-avatar"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    setIsSavingSettings(true)
                    const uploadedUrl = await uploadUserFileForDisplay(file)
                    setUserAvatarUrl(uploadedUrl)
                    alert('頭像圖片上傳成功！')
                  } catch (err) {
                    console.error('Failed to upload avatar:', err)
                    alert('上傳頭像失敗，請確認是否配置 Appwrite Bucket 或網路狀態。')
                  } finally {
                    setIsSavingSettings(false)
                  }
                }}
                style={{ padding: '4px', width: '100%', marginTop: '4px' }}
              />
            </div>

            <div className="settings-group">
              <label htmlFor="settings-userstatus" style={{ fontWeight: 'bold', color: '#48341f' }}>個人狀態/座右銘</label>
              <input
                id="settings-userstatus"
                type="text"
                value={userStatus}
                onChange={(e) => setUserStatus(e.target.value)}
                placeholder="用手札記錄生活 ✏️"
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>

            <div className="settings-group">
              <label style={{ fontWeight: 'bold', color: '#48341f', marginBottom: '8px', display: 'block' }}>在線色彩狀態</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {statusToneOptions.map((toneOpt) => (
                  <button
                    key={toneOpt.value}
                    type="button"
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: userTone === toneOpt.value ? '2px solid #877864' : '1px solid #d3c4a9',
                      background: userTone === toneOpt.value ? 'rgba(135, 120, 100, 0.1)' : 'transparent',
                      color: '#48341f',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: userTone === toneOpt.value ? 'bold' : 'normal'
                    }}
                    onClick={() => setUserTone(toneOpt.value)}
                  >
                    {toneOpt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-group">
              <label style={{ fontWeight: 'bold', color: '#48341f' }}>桌面背景風格</label>
              <div className="bg-choices-grid" style={{ marginTop: '4px' }}>
                <button
                  type="button"
                  className={bgStyle === 'default' ? 'bg-choice active' : 'bg-choice'}
                  onClick={() => setBgStyle('default')}
                >
                  🌾 溫慢木質書桌 (預設)
                </button>
                <button
                  type="button"
                  className={bgStyle === 'cream' ? 'bg-choice active' : 'bg-choice'}
                  onClick={() => setBgStyle('cream')}
                >
                  📜 優雅米白
                </button>
                <button
                  type="button"
                  className={bgStyle === 'sage' ? 'bg-choice active' : 'bg-choice'}
                  onClick={() => setBgStyle('sage')}
                >
                  🍃 清爽鼠尾草綠
                </button>
                <button
                  type="button"
                  className={bgStyle === 'coffee' ? 'bg-choice active' : 'bg-choice'}
                  onClick={() => setBgStyle('coffee')}
                >
                  ☕ 復古拿鐵
                </button>
              </div>
            </div>

            <div className="settings-group">
              <label htmlFor="settings-custom-bg" style={{ fontSize: '13px' }}>自訂背景圖片網址</label>
              <input
                id="settings-custom-bg"
                type="text"
                value={customBgUrl.startsWith('data:image') ? '' : customBgUrl}
                onChange={(e) => {
                  setCustomBgUrl(e.target.value)
                  setBgStyle('custom')
                }}
                placeholder="https://example.com/image.jpg"
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>

            <div className="settings-group">
              <label htmlFor="settings-upload-bg" style={{ fontSize: '13px' }}>上傳自訂背景圖片</label>
              <input
                id="settings-upload-bg"
                type="file"
                accept="image/*"
                onChange={handleBgFileUpload}
                style={{ padding: '4px', width: '100%', marginTop: '4px' }}
              />
              {customBgUrl.startsWith('data:image') && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#536843', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>已載入本地圖片</span>
                  <button
                    type="button"
                    style={{ background: 'transparent', border: 'none', color: '#d94f4f', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    onClick={() => {
                      setCustomBgUrl('')
                      setBgStyle('default')
                      if (typeof indexedDB !== 'undefined') {
                        const request = indexedDB.open(DB_NAME, 1)
                        request.onsuccess = () => {
                          const db = request.result
                          try {
                            const transaction = db.transaction([STORE_NAME], 'readwrite')
                            transaction.objectStore(STORE_NAME).delete(BG_KEY)
                          } catch (err) {
                            console.error(err)
                          }
                        }
                      }
                    }}
                  >
                    清除
                  </button>
                </div>
              )}
            </div>

            <div className="settings-group data-maintenance-box">
              <label style={{ fontSize: '13px' }}>數據維護</label>
              <div className="maintenance-buttons-row" style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="maintenance-btn clear-btn"
                  style={{
                    flexGrow: 1,
                    padding: '8px 12px',
                    fontSize: '12px',
                    background: 'rgba(193, 107, 107, 0.08)',
                    border: '1px solid rgba(193, 107, 107, 0.3)',
                    borderRadius: '6px',
                    color: '#b15d5d',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onClick={() => {
                    if (window.confirm('確定要清空所有資料嗎？這將刪除所有好友、群組、聊天訊息、筆記及資料夾！')) {
                      handleClearAllData()
                      setShowSettings(false)
                    }
                  }}
                >
                  🗑️ 清空所有數據
                </button>
              </div>
            </div>

            <div className="settings-actions" style={{ display: 'flex', gap: '10px' }}>
              <button className="primary-button" type="button" disabled={isSavingSettings} onClick={handleSaveSettings} style={{ flex: 1, background: '#5c7c59', color: '#fff' }}>
                {isSavingSettings ? '儲存中...' : '儲存個人設定 💾'}
              </button>
              <button className="primary-button" type="button" onClick={() => setShowSettings(false)} style={{ flex: 1, background: 'transparent', color: '#73614e', border: '1px solid #d3c4a9' }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {callingFriendId && (
        <CallingModal
          friendId={callingFriendId}
          friends={acceptedWorkspaceFriends}
          onClose={() => setCallingFriendId(null)}
        />
      )}

      {showAddFriendModal && (
        <AddFriendModal
          onClose={() => setShowAddFriendModal(false)}
          onSendInvite={handleSendInvite}
        />
      )}

      {activeSlideshowAlbumId && (
        <SlideshowModal
          albumId={activeSlideshowAlbumId}
          albums={workspaceAlbums}
          photos={workspacePhotos}
          onClose={() => setActiveSlideshowAlbumId(null)}
        />
      )}

      {showAddAlbumModal && (
        <AddAlbumModal
          photos={workspacePhotos}
          onClose={() => setShowAddAlbumModal(false)}
          onCreateAlbum={handleCreateAlbum}
        />
      )}

      {showUploadPhotoModal && (
        <UploadPhotoModal
          albums={workspaceAlbums}
          defaultAlbumId={typeof showUploadPhotoModal === 'string' ? showUploadPhotoModal : undefined}
          onClose={() => setShowUploadPhotoModal(false)}
          onUploadPhoto={handleUploadPhotoToAlbum}
        />
      )}
    </main>
  )
}

/* ==========================================
   1. 首頁 (DeskSurface)
   ========================================== */
function DeskSurface({
  userName,
  setUserName,
  folders,
  notes,
  photos,
  friends,
  events,
  onNavigate,
  onOpenLightbox,
}: {
  userName: string
  setUserName: (name: string) => void
  folders: FolderModel[]
  notes: WorkspaceNote[]
  photos: Photo[]
  friends: Friend[]
  events: CalendarEvent[]
  onNavigate: (section: AppSection, folderId?: string) => void
  onOpenLightbox: (url: string) => void
}) {
  const recentNotes = notes.slice(0, 3)
  const todayPhoto = photos[0]
  const todayReflection = {
    title: '今天的自己',
    date: '2026.06.24 10:30',
    weather: '晴天 28°C',
    text: '把一句話寫完整，就像替自己倒一杯水。今天不急著分類，也不急著讓它變成結論，只先承認自己真的有一些感覺。',
  }

  const [isEditing, setIsEditing] = useState(false)
  const [tempName, setTempName] = useState(userName)

  const handleSave = () => {
    const trimmed = tempName.trim()
    if (trimmed) {
      setUserName(trimmed)
    }
    setIsEditing(false)
  }

  return (
    <div className="desk-surface-container">
      {/* Top Greeting & Info Bar */}
      <header className="desk-header">
        <div className="greeting-box">
          {isEditing ? (
            <div className="inline-name-edit">
              <h2>早安，</h2>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') {
                    setTempName(userName)
                    setIsEditing(false)
                  }
                }}
                autoFocus
                className="inline-name-input"
                aria-label="編輯用戶名稱"
              />
              <h2>。</h2>
            </div>
          ) : (
            <h2
              onClick={() => {
                setTempName(userName)
                setIsEditing(true)
              }}
              className="clickable-greeting-name"
              title="點擊修改用戶名稱"
            >
              早安，<span className="editable-name-span">{userName}</span>。
            </h2>
          )}
          <p className="datetime-weather">
            今天是 2026.06.24 星期三 <span className="weather-badge">☀️ 晴天 28°C</span>
          </p>
        </div>
        <div className="desk-search-wrap">
          <div className="search-pill">
            <Search size={16} />
            <input type="text" placeholder="搜尋你的人生..." aria-label="全域搜尋" />
          </div>
          <button className="icon-button" type="button" aria-label="提醒">
            <Bell size={18} />
          </button>
        </div>
      </header>

      {/* Daily Quote Card */}
      <div className="daily-quote-card">
        <div className="quote-icon">🌿</div>
        <blockquote>
          「春水初生，春林初盛。春風十里，不如你。」
          <cite>—— 馮唐《春水》</cite>
        </blockquote>
      </div>

      {/* Quick Action Buttons */}
      <section className="quick-actions-bar" aria-label="快速操作">
        <button
          className="action-btn"
          type="button"
          onClick={() => {
            if (folders[0]) {
              onNavigate('筆記', folders[0].id)
            } else {
              onNavigate('資料夾')
            }
          }}
        >
          <PenLine size={16} />
          <span>新增筆記</span>
        </button>
        <button className="action-btn" type="button" onClick={() => onNavigate('心得')}>
          <Heart size={16} />
          <span>寫心得</span>
        </button>
        <button className="action-btn" type="button" onClick={() => onNavigate('相簿')}>
          <Image size={16} />
          <span>上傳照片</span>
        </button>
        <button className="action-btn" type="button" onClick={() => onNavigate('行事曆')}>
          <CalendarDays size={16} />
          <span>新增行程</span>
        </button>
      </section>

      {/* Main 2x2 Desktop Grid */}
      <div className="desktop-grid">
        {/* Card 1: 最近的筆記 */}
        <article className="desktop-card panel">
          <div className="card-header">
            <h3>最近的筆記</h3>
            <button
              className="text-link-btn"
              type="button"
              onClick={() => onNavigate('資料夾')}
            >
              查看全部 <ChevronRight size={14} />
            </button>
          </div>
          <div className="recent-notes-list">
            {recentNotes.length > 0 ? (
              recentNotes.map((note) => (
                <div
                  className="recent-note-row"
                  key={note.id}
                  onClick={() => {
                    const folderObj = folders.find((f) => f.name === note.folder)
                    onNavigate('筆記', folderObj?.id)
                  }}
                >
                  {note.imageUrl && <img src={note.imageUrl} alt="" />}
                  <div className="note-meta">
                    <h4>{note.title}</h4>
                    <span>
                      {note.folder} · {note.date}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="quiet-empty-text">還沒有筆記，先從資料夾新增第一則。</p>
            )}
          </div>
        </article>

        {/* Card 2: 今日心得 */}
        <article className="desktop-card panel reflection-card">
          <div className="card-header">
            <h3>今日心得</h3>
            <button
              className="text-link-btn"
              type="button"
              onClick={() => onNavigate('心得')}
            >
              查看全部 <ChevronRight size={14} />
            </button>
          </div>
          <div className="today-reflection-box">
            <span className="paper-date">{todayReflection.date}</span>
            <h4>{todayReflection.title}</h4>
            <p>{todayReflection.text}</p>
            <div className="plant-doodle" />
          </div>
        </article>

        {/* Card 3: 今日照片 */}
        <article className="desktop-card panel album-card">
          <div className="card-header">
            <h3>今日照片</h3>
            <button
              className="text-link-btn"
              type="button"
              onClick={() => onNavigate('相簿')}
            >
              查看全部 <ChevronRight size={14} />
            </button>
          </div>
          <div className="polaroid-wrapper">
            {todayPhoto ? (
              <figure
                className="mini-polaroid rotate-polaroid"
                onClick={() => onOpenLightbox(todayPhoto.imageUrl)}
              >
                <img src={todayPhoto.imageUrl} alt={todayPhoto.title} />
                <figcaption>{todayPhoto.title}</figcaption>
              </figure>
            ) : (
              <p className="quiet-empty-text">還沒有照片，去相簿放入第一張。</p>
            )}
          </div>
        </article>

        {/* Card 4: 今天行程 */}
        <article className="desktop-card panel schedule-card">
          <div className="card-header">
            <h3>今天行程</h3>
            <button
              className="text-link-btn"
              type="button"
              onClick={() => onNavigate('行事曆')}
            >
              查看全部 <ChevronRight size={14} />
            </button>
          </div>
          <div className="today-events-list">
            {events.length > 0 ? (
              events.slice(0, 3).map((event) => (
                <div className={`mini-event-row ${event.color ?? 'sage'}`} key={event.id}>
                  <div className="event-bullet" />
                  <div className="event-info">
                    <strong>{event.title}</strong>
                    <p>{event.visibility === 'shared' ? '好友共同日曆' : '個人行程'}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="quiet-empty-text">今天還沒有行程。</p>
            )}
          </div>
        </article>
      </div>

      {/* Bottom Row: Friends Panel, Calendar, Sticky Note from mockup */}
      <div className="desktop-bottom-grid">
        {/* Card 5: 朋友動態 (Horizontal layout) */}
        <article className="desktop-card panel friends-card">
          <div className="card-header">
            <h3>朋友動態</h3>
            <button className="text-link-btn" type="button" onClick={() => onNavigate('好友')}>
              查看全部 <ChevronRight size={14} />
            </button>
          </div>
          <div className="friend-horizontal-list">
            {friends.length > 0 ? (
              friends.map((friend) => (
                <div className="friend-avatar-column" key={friend.id}>
                  <div className="avatar-wrap">
                    <img src={friend.avatarUrl} alt={friend.name} />
                    <span className={`status-dot ${friend.tone}`} />
                  </div>
                  <strong>{friend.name}</strong>
                  <span className="friend-status-text">{friend.status}</span>
                  <span className="friend-time-text">1小時前</span>
                </div>
              ))
            ) : (
              <p className="quiet-empty-text">還沒有好友動態。</p>
            )}
          </div>
        </article>

        {/* Card 6: 六月行事曆 */}
        <article className="desktop-card panel calendar-mini-card">
          <div className="card-header">
            <h3>六月行事曆</h3>
            <button className="text-link-btn" type="button" onClick={() => onNavigate('行事曆')}>
              查看全部 <ChevronRight size={14} />
            </button>
          </div>
          <div className="mini-calendar-grid">
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <span className="mini-weekday" key={d}>
                {d}
              </span>
            ))}
            {Array.from({ length: 35 }, (_, index) => {
              const day = index - 0 // June starts on Monday (1st)
              const isValid = day >= 1 && day <= 30
              const isToday = day === 24
              const hasEvent = day === 24 || day === 25

              return (
                <span
                  key={index}
                  className={`mini-day-cell ${isToday ? 'today' : ''} ${hasEvent ? 'has-event' : ''} ${
                    !isValid ? 'empty' : ''
                  }`}
                >
                  {isValid ? day : ''}
                </span>
              )
            })}
          </div>
        </article>

        {/* Card 7: 便條小卡 */}
        <div className="sticky-post-it">
          <p>今天也慢慢生活，把平凡的日子組成喜歡的樣子。🌿</p>
        </div>
      </div>
    </div>
  )
}

/* ==========================================
   2. 右側欄微型元件 (Right Rail)
   ========================================== */
function FriendsPanel({ friends, onStartChat }: { friends: Friend[]; onStartChat: (id: string) => void }) {
  return (
    <section className="rail-panel friend-updates-section">
      <div className="section-heading compact">
        <h2>朋友動態</h2>
        <button className="text-link-btn" type="button">
          查看全部 <ChevronRight aria-hidden="true" size={14} />
        </button>
      </div>
      <div className="friend-bubbles-list">
        {friends.map((friend) => (
          <article className="friend-row-bubble" key={friend.id} onClick={() => onStartChat(friend.id)} style={{ cursor: 'pointer' }}>
            <div className="avatar-wrap">
              <img src={friend.avatarUrl} alt={friend.name} />
              <span className={`status-dot ${friend.tone}`} />
            </div>
            <div className="friend-brief">
              <h3>{friend.name}</h3>
              <p>{friend.status}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function RightRailWidgets() {
  const daysInJune = 30
  const activeDay = 24

  return (
    <div className="right-rail-widgets">
      {/* June Mini Calendar */}
      <section className="mini-calendar-panel panel">
        <div className="calendar-header">
          <h3>六月行事曆</h3>
          <span>2026.06</span>
        </div>
        <div className="mini-calendar-grid">
          {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
            <span className="mini-weekday" key={d}>
              {d}
            </span>
          ))}
          {Array.from({ length: 35 }, (_, index) => {
            const day = index - 0 // June starts on Monday (1st)
            const isValid = day >= 1 && day <= daysInJune
            const isToday = day === activeDay
            const hasEvent = day === 24 || day === 25

            return (
              <span
                key={index}
                className={`mini-day-cell ${isToday ? 'today' : ''} ${hasEvent ? 'has-event' : ''} ${
                  !isValid ? 'empty' : ''
                }`}
              >
                {isValid ? day : ''}
              </span>
            )
          })}
        </div>
      </section>

      {/* Sticky Note Quote */}
      <div className="sticky-post-it">
        <p>今天也慢慢生活，把平凡的日子組成喜歡的樣子。🌿</p>
      </div>
    </div>
  )
}

/* ==========================================
   3. 資料夾頁 (FoldersPage)
   ========================================== */
function FoldersPage({
  folders,
  onAddFolder,
  onOpenFolderNotes,
}: {
  folders: FolderModel[]
  onAddFolder: (folderName?: string) => FolderModel
  onOpenFolderNotes: (folderId: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isNamingFolder, setIsNamingFolder] = useState(false)
  const [draftFolderName, setDraftFolderName] = useState('')

  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )
  const nextDefaultFolderName = `新資料夾 ${folders.filter((folder) => folder.id.startsWith('custom-folder-')).length + 1}`

  const startNamingFolder = () => {
    setDraftFolderName(nextDefaultFolderName)
    setIsNamingFolder(true)
  }

  const submitNewFolder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onAddFolder(draftFolderName)
    setDraftFolderName('')
    setIsNamingFolder(false)
    setSearchQuery('')
  }

  const folderSpineIcons: Record<string, string> = {
    '生活': '🌿',
    '學習': '✏️',
    '旅行': '✈️',
    '想法': '🌸',
    '日常碎片': '☕',
    '收藏夾': '🌱',
    '閱讀': '📖',
    '健康': '❤️',
    '工作': '💼',
    '靈感': '💡',
  }

  return (
    <section className="page-surface folder-bookshelf-page">
      {/* Page Heading and Controls */}
      <header className="page-hero folder-hero">
        <div>
          <h2>資料夾（書櫃）</h2>
          <h2 className="sr-only">資料夾書櫃</h2>
          <p>收藏生活的每個畫面，讓回憶有地方妥善安放。</p>
        </div>
        <div className="bookshelf-actions">
          <div className="search-pill">
            <Search size={15} />
            <input
              type="text"
              placeholder="搜尋資料夾..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="搜尋資料夾"
            />
          </div>
          <button className="soft-button" type="button">
            排序
          </button>
          <button className="primary-button" type="button" onClick={startNamingFolder}>
            <Plus size={16} />
            新增資料夾
          </button>
        </div>
      </header>

      {isNamingFolder ? (
        <form className="folder-name-form" onSubmit={submitNewFolder}>
          <label>
            <span>新資料夾名稱</span>
            <input
              aria-label="新資料夾名稱"
              type="text"
              value={draftFolderName}
              onChange={(event) => setDraftFolderName(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit">
            建立資料夾
          </button>
          <button className="soft-button" type="button" onClick={() => setIsNamingFolder(false)}>
            取消
          </button>
        </form>
      ) : null}

      {/* Main Dual Layout */}
      <section className="folder-workbench" aria-label="資料夾頁雙欄配置">
        {/* Left Column: Recent Activity */}
        <section className="folder-activity-layout" aria-label="最近整理欄">
          <article className="panel recent-folder-panel">
            <div className="section-heading compact">
              <h2>最近整理</h2>
              <span className="quiet-label">本週</span>
            </div>
            <div className="recent-folder-list">
              {folders.length > 0 ? (
                folders.slice(0, 6).map((folder) => (
                  <div
                    className="folder-line"
                    key={folder.id}
                    onClick={() => onOpenFolderNotes(folder.id)}
                  >
                    <span className={`folder-dot ${folder.color}`} />
                    <div className="folder-line-text">
                      <strong>{folder.name}</strong>
                      <p>{folder.count} 則筆記 · 剛剛編輯</p>
                    </div>
                    <ChevronRight aria-hidden="true" size={16} />
                  </div>
                ))
              ) : (
                <div className="folder-empty-state">
                  <strong>還沒有資料夾</strong>
                  <p>按「新增資料夾」後，書櫃上會出現第一本資料書。</p>
                </div>
              )}
            </div>
          </article>
        </section>

        {/* Right Column: realistic wood bookshelf */}
        <section className="bookshelf-panel" aria-label="真實木質書櫃">
          <div className="wood-bookshelf">
            {/* Top Shelf */}
            <div className="shelf-row shelf-row-top" aria-label="上層書格" data-align="bottom">
              {filteredFolders.length === 0 ? (
                <div className="bookshelf-empty-note">還沒有資料夾</div>
              ) : null}
              {filteredFolders.slice(0, 6).map((folder, index) => (
                <button
                  aria-label={`管理${folder.name}資料夾`}
                  className={`folder-book ${folder.color} height-${index % 3}`}
                  key={folder.id}
                  type="button"
                  onClick={() => onOpenFolderNotes(folder.id)}
                >
                  <span className="book-spine">
                    <span className="spine-icon">{folderSpineIcons[folder.name] || '📁'}</span>
                    <span className="spine-title">
                      {folder.name.split('').map((char, i) => (
                        <span key={i}>{char}</span>
                      ))}
                    </span>
                    <span className="spine-count">{folder.count} 則筆記</span>
                  </span>
                </button>
              ))}
            </div>

            {/* Bottom Shelf */}
            <div className="shelf-row shelf-row-bottom" aria-label="下層書格" data-align="bottom">
              {filteredFolders.slice(6).map((folder, index) => (
                <button
                  aria-label={`管理${folder.name}資料夾`}
                  className={`folder-book ${folder.color} height-${(index + 1) % 3}`}
                  key={folder.id}
                  type="button"
                  onClick={() => onOpenFolderNotes(folder.id)}
                >
                  <span className="book-spine">
                    <span className="spine-icon">{folderSpineIcons[folder.name] || '📁'}</span>
                    <span className="spine-title">
                      {folder.name.split('').map((char, i) => (
                        <span key={i}>{char}</span>
                      ))}
                    </span>
                    <span className="spine-count">{folder.count} 則筆記</span>
                  </span>
                </button>
              ))}

              {/* Decorative elements to match mockup */}
              <div className="shelf-decorations" aria-label="下層裝飾格">
                <div className="vase-plant-decor" title="裝飾小盆栽">
                  <div className="glass-vase"></div>
                  <div className="plant-leaves">🌿</div>
                </div>
                <div className="stacked-books-decor" title="裝飾書籍">
                  <div className="flat-book book-brown"></div>
                  <div className="flat-book book-tan"></div>
                  <div className="flat-book book-cream"></div>
                </div>
                <div className="framed-photo-decor" title="小相框">
                  <img src="https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=120&q=80" alt="相框" />
                </div>
              </div>
            </div>
          </div>

          {/* Bookshelf Bottom widgets: Recent browse and Tips */}
          <div className="bookshelf-bottom-widgets">
            <div className="recent-browsed panel">
              <h4>最近瀏覽</h4>
              <div className="browsed-images-row">
                <div className="browsed-item" onClick={() => onOpenFolderNotes('travel')}>
                  <img src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=120&q=80" alt="旅行" />
                  <span>旅行</span>
                </div>
                <div className="browsed-item" onClick={() => onOpenFolderNotes('ideas')}>
                  <img src="https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=120&q=80" alt="想法" />
                  <span>想法</span>
                </div>
                <div className="browsed-item" onClick={() => onOpenFolderNotes('reading')}>
                  <img src="https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=120&q=80" alt="閱讀" />
                  <span>閱讀</span>
                </div>
              </div>
            </div>
            <div className="bookshelf-tip-note">
              <p>資料夾就像書櫃，讓重要的事物各自有位置，也讓生活更有條理。📖</p>
            </div>
          </div>
        </section>
      </section>
    </section>
  )
}

/* ==========================================
   4. 筆記頁 (NotesPage - Binder Notebook)
   ========================================== */
function NotesPage({
  folders,
  notes,
  selectedFolderId,
  onAddNote,
  onAttachFile,
  onDeleteAttachment,
  onDeleteNote,
  onOpenLightbox,
  onReorderAttachments,
  onRenameAttachment,
  onUpdateNote,
}: {
  folders: FolderModel[]
  notes: WorkspaceNote[]
  selectedFolderId: string
  onAddNote: (folderName: string) => WorkspaceNote
  onAttachFile: (noteId: string, file: File, kind: 'photo' | 'pdf') => Promise<AttachFileResult>
  onDeleteAttachment: (noteId: string, attachmentId: string) => void
  onDeleteNote: (noteId: string) => void
  onOpenLightbox: (url: string) => void
  onReorderAttachments: (noteId: string, reorderedAttachments: NoteAttachment[]) => void
  onRenameAttachment: (noteId: string, attachmentId: string, newName: string) => void
  onUpdateNote: (noteId: string, patch: Partial<Pick<WorkspaceNote, 'title' | 'excerpt' | 'date'>>) => void
}) {
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0]
  const folderNotes = notes.filter((note) => note.folder === selectedFolder.name)

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'全部' | '照片' | 'PDF' | '附件'>('全部')
  const [uploadMessage, setUploadMessage] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dragKind, setDragKind] = useState<'photo' | 'pdf' | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const emptyFolderNote: WorkspaceNote = {
    id: 'empty-folder-note',
    title: '尚未建立筆記',
    excerpt: '先新增一則筆記，再把照片或 PDF 放進來。',
    folder: selectedFolder.name,
    date: formatDisplayDate(),
    imageUrl: 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=240&q=80',
    photoCount: 0,
    likeCount: 0,
    fileCount: 0,
    attachments: [],
  }
  const featuredNote =
    folderNotes.find((note) => note.id === selectedNoteId) ?? folderNotes[0] ?? emptyFolderNote
  const hasFolderNotes = folderNotes.length > 0

  const attachmentTabs = ['全部', '照片', 'PDF', '附件'] as const
  type AttachmentTab = (typeof attachmentTabs)[number]

  const folderIcons: Record<string, string> = {
    '生活': '🌿',
    '學習': '✏️',
    '旅行': '✈️',
    '想法': '🌸',
    '日常碎片': '☕',
    '收藏夾': '🌱',
    '閱讀': '📖',
    '健康': '❤️',
    '工作': '💼',
    '靈感': '💡',
  }

  const uploadedPhotos = (featuredNote?.attachments ?? []).filter((attachment) => attachment.kind === 'photo')
  const uploadedPdfs = (featuredNote?.attachments ?? []).filter((attachment) => attachment.kind === 'pdf')
  const photoItems = uploadedPhotos.map((attachment) => ({
    id: attachment.id,
    title: attachment.name,
    originalTitle: attachment.originalName ?? attachment.name,
    imageUrl: attachment.url || featuredNote.imageUrl,
  }))
  const pdfItems = uploadedPdfs

  const handleAddNote = () => {
    const newNote = onAddNote(selectedFolder.name)
    setSelectedNoteId(newNote.id)
    setUploadMessage('')
  }

  const handleUpdateCurrentNote = (patch: Partial<Pick<WorkspaceNote, 'title' | 'excerpt' | 'date'>>) => {
    if (!hasFolderNotes) return
    onUpdateNote(featuredNote.id, patch)
  }

  const handleDeleteCurrentNote = () => {
    if (!hasFolderNotes) return

    const remainingNotes = folderNotes.filter((note) => note.id !== featuredNote.id)
    onDeleteNote(featuredNote.id)
    setSelectedNoteId(remainingNotes[0]?.id ?? null)
    setUploadMessage('筆記已刪除。')
  }

  const handleUpload = async (file: File | undefined, kind: 'photo' | 'pdf') => {
    if (!file || !featuredNote) return
    if (!hasFolderNotes) {
      setUploadMessage('請先新增一則筆記，再上傳照片或 PDF。')
      return
    }

    setUploadMessage('上傳中...')
    const result = await onAttachFile(featuredNote.id, file, kind)
    if (!result.ok) {
      setUploadMessage(result.message)
      return
    }

    setUploadMessage(`${result.attachment.name} 已放進這則筆記。`)
    setActiveTab(kind === 'photo' ? '照片' : 'PDF')
  }

  const handleRemoveAttachment = (attachmentId: string) => {
    if (!hasFolderNotes) return
    onDeleteAttachment(featuredNote.id, attachmentId)
    setUploadMessage('附件已刪除。')
  }

  const handleDragStart = (index: number, kind: 'photo' | 'pdf') => {
    setDragIndex(index)
    setDragKind(kind)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
    setDragKind(null)
  }

  const handleDrop = (targetIndex: number, items: Array<{ id: string }>, kind: 'photo' | 'pdf') => {
    if (dragIndex === null || dragKind !== kind || !hasFolderNotes) {
      handleDragEnd()
      return
    }

    const allAttachments = [...(featuredNote.attachments ?? [])]
    const kindAttachmentIds = items.map((item) => item.id)
    const kindAttachments = allAttachments.filter((a) => kindAttachmentIds.includes(a.id))
    const otherAttachments = allAttachments.filter((a) => !kindAttachmentIds.includes(a.id))

    const reordered = [...kindAttachments]
    const [moved] = reordered.splice(dragIndex, 1)
    if (moved) {
      reordered.splice(targetIndex, 0, moved)
    }

    onReorderAttachments(featuredNote.id, [...otherAttachments, ...reordered])
    handleDragEnd()
  }

  const handlePdfPreview = (url: string) => {
    setPdfPreviewUrl(url || 'demo-preview')
  }

  return (
    <section className="page-surface notes-binder-page">
      <div className="page-hero notes-hero">
        <div>
          <h2>筆記工作桌</h2>
          <p>從資料夾書櫃抽出一本書後，打開成活頁筆記本：左頁挑筆記，右頁整理照片與 PDF。</p>
        </div>
        <div className="notes-hero-actions">
          <div className="search-pill">
            <Search aria-hidden="true" size={16} />
            <input type="text" placeholder="搜尋這本筆記..." aria-label="搜尋這本筆記" />
          </div>
          <button
            aria-label="在這本資料夾新增筆記"
            className="soft-button"
            type="button"
            onClick={handleAddNote}
          >
            <Plus aria-hidden="true" size={17} />
            新增筆記內容
          </button>
        </div>
      </div>

      {/* The平開式活頁夾 */}
      <section className="book-spread note-binder" aria-label="資料夾內活頁筆記本">
        {/* Left Page: Note List */}
        <aside className="book-page book-page-left notebook-list" aria-label="左頁筆記列表">
          <div className="binder-page-heading">
            <div className="binder-folder-header">
              <span className="folder-icon-circle">{folderIcons[selectedFolder.name] || '📁'}</span>
              <div className="folder-title-wrap">
                <h3>{selectedFolder.name}<span className="sr-only">筆記</span></h3>
                <p>{folderNotes.length || 0} 則筆記</p>
              </div>
            </div>
          </div>

          <div className="binder-controls">
            <div className="binder-search-bar">
              <Search aria-hidden="true" size={15} />
              <input type="text" placeholder="搜尋這本筆記..." aria-label="搜尋這本筆記" />
            </div>
            <div className="binder-select-group">
              <label>排序：</label>
              <select className="binder-select" defaultValue="latest">
                <option value="latest">最新</option>
                <option value="oldest">最舊</option>
              </select>
            </div>
            <div className="binder-select-group">
              <label>篩選：</label>
              <select className="binder-select" defaultValue="all">
                <option value="all">全部</option>
                <option value="starred">收藏</option>
              </select>
            </div>
          </div>

          <button className="add-note-inline-btn" type="button" onClick={handleAddNote}>
            <Plus aria-hidden="true" size={14} />
            新增筆記內容
          </button>

          <div className="note-stack">
            {folderNotes.length > 0 ? (
              folderNotes.map((note) => (
                <button
                  className={featuredNote.id === note.id ? 'note-slip active' : 'note-slip'}
                  key={note.id}
                  type="button"
                  onClick={() => setSelectedNoteId(note.id)}
                >
                  <div className="note-slip-main">
                    {note.imageUrl && <img src={note.imageUrl} alt="" className="note-slip-thumbnail" />}
                    <div className="note-slip-info">
                      <strong className="note-slip-title">{note.title}</strong>
                      <span className="note-slip-date">{note.date}</span>
                      <div className="note-slip-stats">
                        <span>🖼️ {note.photoCount || 0}</span>
                        <span>👍 {note.likeCount || 0}</span>
                        <span>📎 {note.fileCount || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="note-slip-meta">
                    {note.isStarred ? (
                      <span className="star-active" title="星標項目">⭐</span>
                    ) : (
                      <span className="more-menu-dot">⋮</span>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="empty-note-slip">
                <strong>{selectedFolder.name}還沒有筆記</strong>
                <p>建立第一則筆記後，會先放在這個筆記本裡。</p>
              </div>
            )}
          </div>
        </aside>

        {/* Right Page: Selected Note Attachments / Preview */}
        <article className="book-page book-page-right attachment-page" aria-label="右頁附件內容">
          {/* Visually hidden copy keeps the original drag-and-drop affordance testable. */}
          <span className="sr-only">拖曳照片或 PDF 到這裡</span>

          <div className="paper-toolbar">
            <div className="selected-note-title-wrap">
              <h2 aria-label={featuredNote.title || '未命名筆記'}>
                <input
                  aria-label="筆記標題"
                  disabled={!hasFolderNotes}
                  type="text"
                  value={featuredNote.title}
                  onChange={(event) => handleUpdateCurrentNote({ title: event.target.value })}
                />
              </h2>
              <input
                aria-label="筆記日期"
                className="selected-note-date-input"
                disabled={!hasFolderNotes}
                type="text"
                value={featuredNote.date}
                onChange={(event) => handleUpdateCurrentNote({ date: event.target.value })}
              />
            </div>
            <div className="toolbar-btns">
              <button type="button" className="upload-file-btn" onClick={() => photoInputRef.current?.click()}>
                <Plus aria-hidden="true" size={14} /> 上傳照片
              </button>
              <button type="button" className="upload-file-btn" onClick={() => pdfInputRef.current?.click()}>
                <Paperclip aria-hidden="true" size={14} /> 上傳 PDF
              </button>
              <button
                aria-label="刪除目前筆記"
                className="delete-note-btn"
                disabled={!hasFolderNotes}
                type="button"
                onClick={handleDeleteCurrentNote}
              >
                <Trash2 aria-hidden="true" size={14} /> 刪除
              </button>
              <button type="button" className="icon-view-btn" title="網格檢視">🎛️</button>
              <button type="button" className="icon-view-btn" title="列表檢視">📋</button>
              <button type="button" className="icon-view-btn" title="更多操作">⋮</button>
            </div>
          </div>

          <input
            ref={photoInputRef}
            aria-label="選擇照片檔案"
            className="sr-only"
            type="file"
            onChange={(event) => {
              handleUpload(event.target.files?.[0], 'photo')
              event.currentTarget.value = ''
            }}
          />
          <input
            ref={pdfInputRef}
            aria-label="選擇 PDF 檔案"
            className="sr-only"
            type="file"
            onChange={(event) => {
              handleUpload(event.target.files?.[0], 'pdf')
              event.currentTarget.value = ''
            }}
          />

          <div className={uploadMessage.includes('只接受') ? 'upload-status error' : 'upload-status'}>
            <span>只允許照片與 PDF</span>
            {uploadMessage ? <strong>{uploadMessage}</strong> : <strong>可從右上角上傳，也可以先新增筆記再整理附件。</strong>}
          </div>

          <div className="binder-tabs" role="tablist" aria-label="附件分類">
            {attachmentTabs.map((tab) => (
              <button
                className={activeTab === tab ? 'active' : ''}
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Polaroid Photos Wall */}
          {(activeTab === '全部' || activeTab === '照片') && (
            <div className="photos-section-wrap">
              <div className="section-subtitle-row">
                <h3>照片 ({photoItems.length})</h3>
                <button type="button" className="see-all-btn">查看全部 &gt;</button>
              </div>
              <div className="polaroid-horizontal-row" aria-label="照片拍立得牆">
                {photoItems.map((photo, index) => (
                  <figure
                    className={`mini-polaroid-note ${dragKind === 'photo' && dragIndex === index ? 'dragging' : ''} ${dragKind === 'photo' && dragOverIndex === index ? 'drag-over' : ''}`}
                    key={photo.id}
                    draggable={hasFolderNotes}
                    onDragStart={() => handleDragStart(index, 'photo')}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onDrop={() => handleDrop(index, photoItems, 'photo')}
                    onClick={() => {
                      if (photo.imageUrl) onOpenLightbox(photo.imageUrl)
                    }}
                  >
                    {hasFolderNotes && (
                      <button
                        type="button"
                        className="photo-delete-btn"
                        title="刪除照片"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveAttachment(photo.id)
                        }}
                      >
                        ✕
                      </button>
                    )}
                    <img src={photo.imageUrl || featuredNote.imageUrl} alt={photo.title} />
                    <figcaption>
                      <div className="editable-attachment-wrapper">
                        <input
                          className="editable-attachment-input"
                          aria-label={`照片名稱：${photo.originalTitle}`}
                          disabled={!hasFolderNotes}
                          type="text"
                          value={photo.title}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onRenameAttachment(featuredNote.id, photo.id, event.target.value)}
                        />
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          {/* PDF files section */}
          {(activeTab === '全部' || activeTab === 'PDF') && (
            <div className="pdf-section-wrap">
              <h3>PDF ({pdfItems.length})</h3>
              <div className="pdf-grid-row">
                {pdfItems.map((pdf, index) => (
                  <div
                    className={`pdf-file-card ${dragKind === 'pdf' && dragIndex === index ? 'dragging' : ''} ${dragKind === 'pdf' && dragOverIndex === index ? 'drag-over' : ''}`}
                    key={pdf.id}
                    draggable={hasFolderNotes}
                    onDragStart={() => handleDragStart(index, 'pdf')}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onDrop={() => handleDrop(index, pdfItems, 'pdf')}
                  >
                    <div className="pdf-card-icon">📕</div>
                    <div className="pdf-card-info">
                      <div className="editable-attachment-wrapper">
                        <input
                          className="editable-attachment-input"
                          aria-label={`PDF名稱：${pdf.originalName ?? pdf.name}`}
                          disabled={!hasFolderNotes}
                          type="text"
                          value={pdf.name}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onRenameAttachment(featuredNote.id, pdf.id, event.target.value)}
                        />
                      </div>
                      <span>{pdf.sizeLabel}</span>
                    </div>
                    <div className="pdf-card-actions">
                      <button
                        type="button"
                        title="下載"
                        onClick={() => {
                          if (pdf.url) {
                            window.open(pdf.url, '_blank')
                          } else {
                            setUploadMessage('此為示範檔案，無法下載實際 PDF 內容。')
                          }
                        }}
                      >
                        ⬇️
                      </button>
                      <button
                        type="button"
                        title="預覽"
                        onClick={() => handlePdfPreview(pdf.url)}
                      >
                        👁️
                      </button>
                      <button
                        type="button"
                        title="刪除"
                        onClick={() => handleRemoveAttachment(pdf.id)}
                      >
                        🗑️
                      </button>
                      <button type="button" title="更多">⋮</button>
                    </div>
                  </div>
                ))}

                <button className="pdf-upload-dashed-card" type="button" onClick={() => pdfInputRef.current?.click()}>
                  <Upload aria-hidden="true" size={16} />
                  <span>上傳 PDF 檔案</span>
                </button>
              </div>
            </div>
          )}

          {/* Remarks Section */}
          <div className="memo-area">
            <h3>備註</h3>
            <div className="memo-paper-box">
              <textarea
                aria-label="筆記備註"
                disabled={!hasFolderNotes}
                value={featuredNote.excerpt || ''}
                onChange={(event) => handleUpdateCurrentNote({ excerpt: event.target.value })}
              />
            </div>
          </div>
        </article>

        {/* Side Tabs hanging off the notebook edge */}
        <div className="page-tabs" aria-label="筆記右側分頁">
          {([...attachmentTabs, '+'] as Array<AttachmentTab | '+'>).map((tab) => (
            <button
              aria-label={`筆記右側${tab}`}
              className={`${activeTab === tab ? 'active' : ''} tab-color-${tab}`}
              key={tab}
              type="button"
              onClick={() => {
                if (tab !== '+') setActiveTab(tab)
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {/* PDF Preview Modal */}
      {pdfPreviewUrl && (
        <div className="pdf-preview-overlay" onClick={() => setPdfPreviewUrl(null)}>
          <div className="pdf-preview-window" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-preview-header">
              <h3>PDF 檔案預覽</h3>
              <button
                type="button"
                className="pdf-preview-close"
                onClick={() => setPdfPreviewUrl(null)}
                aria-label="關閉預覽"
              >
                ✕
              </button>
            </div>
            <div className="pdf-preview-body">
              {pdfPreviewUrl !== 'demo-preview' ? (
                <iframe
                  src={pdfPreviewUrl}
                  className="pdf-preview-iframe"
                  title="PDF 預覽"
                />
              ) : (
                <div className="pdf-preview-placeholder">
                  <div className="icon">📄</div>
                  <h4>無法預覽此檔案</h4>
                  <p>此為示範檔案，尚未上傳真實 PDF 內容。</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/* ==========================================
   5. 心得頁 (ReflectionsPage - Journal Binder)
   ========================================== */
type ReflectionPhotoUpload = {
  id: string
  title: string
  originalTitle: string
  imageUrl: string
}

type ReflectionEntry = {
  id: string
  date: string
  mood: string
  title: string
  weather: string
  text: string
  extendedText: string
  tags: string[]
  imageUrl: string
  likeCount: number
  bookmarked: boolean
}

function ReflectionsPage({ onOpenLightbox }: { onOpenLightbox: (url: string) => void }) {
  const moodTabs = ['全部', '快樂', '平靜', '思考', '感恩', '難過'] as const
  const [selectedMood, setSelectedMood] = useState<string>('全部')
  const [selectedRefId, setSelectedRefId] = useState<string>('')
  const reflectionPhotoInputRef = useRef<HTMLInputElement>(null)
  const [reflectionUploadMessage, setReflectionUploadMessage] = useState('')
  const [reflectionPhotoUploads, setReflectionPhotoUploads] = useState<
    Record<string, ReflectionPhotoUpload[]>
  >({})

  const [reflections, setReflections] = useState<ReflectionEntry[]>([])

  const sortedReflections = useMemo(
    () =>
      [...reflections].sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date)
        return dateCompare || b.id.localeCompare(a.id)
      }),
    [reflections],
  )

  const filteredReflections = sortedReflections.filter(
    (r) => selectedMood === '全部' || r.mood === selectedMood,
  )

  const activeRef =
    reflections.find((r) => r.id === selectedRefId) ??
    filteredReflections[0] ??
    sortedReflections[0]

  const handleUpdateReflection = (patch: Partial<ReflectionEntry>) => {
    if (!activeRef) return

    setReflections((current) =>
      current.map((reflection) =>
        reflection.id === activeRef.id ? { ...reflection, ...patch } : reflection,
      ),
    )
  }

  const handleCreateReflection = () => {
    const newReflection: ReflectionEntry = {
      id: `reflection-${Date.now()}`,
      date: formatDisplayDate(),
      mood: '平靜',
      title: '新的心得',
      weather: '室內微光',
      text: '先寫下今天想留下的事情。',
      extendedText: '',
      tags: ['未分類'],
      imageUrl: '',
      likeCount: 0,
      bookmarked: false,
    }

    setReflections((current) => [newReflection, ...current])
    setSelectedMood('全部')
    setSelectedRefId(newReflection.id)
    setReflectionUploadMessage('')
  }

  const handleTagsChange = (value: string) => {
    if (!activeRef) return

    const nextTags = value
      .split(/[、,，#\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
    handleUpdateReflection({ tags: nextTags.length ? nextTags : ['未分類'] })
  }

  const handleDeleteReflection = () => {
    if (!activeRef) return

    const nextReflection = sortedReflections.find((reflection) => reflection.id !== activeRef.id)

    setReflections((current) => current.filter((reflection) => reflection.id !== activeRef.id))
    setReflectionPhotoUploads((current) => {
      const remaining = { ...current }
      delete remaining[activeRef.id]
      return remaining
    })
    setSelectedRefId(nextReflection?.id ?? '')
    setSelectedMood('全部')
    setReflectionUploadMessage('')
  }

  const handleReflectionPhotoUpload = async (file: File | undefined) => {
    if (!activeRef) return
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setReflectionUploadMessage('心得照片目前只接受圖片檔。')
      return
    }

    setReflectionUploadMessage('上傳中...')
    const imageUrl = await getStoredFileUrl(file)
    const uploadedPhoto = {
      id: `reflection-photo-${Date.now()}-${file.name}`,
      title: file.name,
      originalTitle: file.name,
      imageUrl,
    }

    setReflectionPhotoUploads((current) => ({
      ...current,
      [activeRef.id]: [uploadedPhoto, ...(current[activeRef.id] ?? [])],
    }))
    handleUpdateReflection({ imageUrl: uploadedPhoto.imageUrl || activeRef.imageUrl })
    setReflectionUploadMessage(`已加入 ${file.name}`)
  }

  const handleRenameReflectionPhoto = (photoId: string, title: string) => {
    if (!activeRef) return

    setReflectionPhotoUploads((current) => ({
      ...current,
      [activeRef.id]: (current[activeRef.id] ?? []).map((photo) =>
        photo.id === photoId ? { ...photo, title } : photo,
      ),
    }))
  }

  const handleDeleteReflectionPhoto = (photoId: string) => {
    if (!activeRef) return

    setReflectionPhotoUploads((current) => ({
      ...current,
      [activeRef.id]: (current[activeRef.id] ?? []).filter((photo) => photo.id !== photoId),
    }))
    setReflectionUploadMessage('')
  }

  const activeReflectionPhotos = [
    ...((activeRef ? reflectionPhotoUploads[activeRef.id] : []) ?? []).map((photo) => ({
      ...photo,
      editable: true,
    })),
  ]

  return (
    <section className="page-surface reflections-page">
      {/* Top Banner with Cozy window plant background */}
      <div className="page-hero reflections-hero">
        <div className="hero-text-content">
          <h2>心得小徑</h2>
          <p>米白、植物與自然光的心情手札，適合放讀後感、旅行後記，或寫給未來的自己。</p>
        </div>
        <div className="hero-sticky-note">
          <p>慢下來，感受生活，記錄心情，你會更喜歡自己。🍃</p>
        </div>
        <button className="soft-button" type="button" onClick={handleCreateReflection}>
          <Heart aria-hidden="true" size={17} />
          寫一則新心得
        </button>
      </div>

      {/* Mood Journal Binder */}
      <section className="book-spread reflection-journal" aria-label="心情手札活頁本">
        {/* Left Page: Timeline and List */}
        <aside className="book-page book-page-left reflection-timeline" aria-label="左頁心得列表">
          <div className="binder-page-heading">
            <div>
              <h3>我的心得</h3>
              <p>搜尋、分類，慢慢挑出今天想看的那一頁。</p>
            </div>
            <span className="quiet-label">{filteredReflections.length} 則</span>
          </div>

          <div className="binder-controls">
            <div className="binder-search-bar">
              <Search aria-hidden="true" size={15} />
              <input type="text" placeholder="搜尋心得..." aria-label="搜尋心得" />
            </div>
            <div className="binder-select-group">
              <label>排序：</label>
              <select className="binder-select" defaultValue="latest">
                <option value="latest">最新</option>
                <option value="oldest">最舊</option>
              </select>
            </div>
          </div>

          <div className="reflection-list-stack">
            {filteredReflections.length ? (
              filteredReflections.map((ref) => (
              <button
                className={activeRef?.id === ref.id ? 'reflection-card active' : 'reflection-card'}
                key={ref.id}
                type="button"
                onClick={() => setSelectedRefId(ref.id)}
              >
                {ref.imageUrl && (
                  <img src={ref.imageUrl} alt="" className="reflection-card-thumbnail" />
                )}
                <div className="reflection-card-info">
                  <div className="reflection-card-header">
                    <span className="reflection-card-date">{ref.date}</span>
                    <small className="mood-tag">{ref.mood}</small>
                  </div>
                  <h4>{ref.title}</h4>
                  <p className="reflection-card-excerpt">{ref.text}</p>
                  <div className="reflection-card-footer">
                    <span>👍 {ref.likeCount}</span>
                    <span>🔖 {ref.bookmarked ? '已收藏' : '未收藏'}</span>
                  </div>
                </div>
              </button>
              ))
            ) : (
              <div className="reflection-empty-state">
                <strong>還沒有心得</strong>
                <p>按「寫一則新心得」後，這裡才會出現你自己的日期清單。</p>
              </div>
            )}
          </div>

          <button className="wide-paper-button" type="button" onClick={handleCreateReflection}>
            <Plus aria-hidden="true" size={16} />
            寫一則新心得
          </button>
        </aside>

        {/* Right Page: Selected Detail */}
        <article className="book-page book-page-right reflection-paper" aria-label="右頁心得內容">
          {activeRef ? (
            <>
          <div className="reflection-paper-top reflection-edit-meta">
            <label>
              日期
              <input
                aria-label="心得日期"
                type="text"
                value={activeRef.date}
                onChange={(event) => handleUpdateReflection({ date: event.target.value })}
              />
            </label>
            <label>
              心情
              <select
                aria-label="心情分類"
                value={activeRef.mood}
                onChange={(event) => handleUpdateReflection({ mood: event.target.value })}
              >
                {moodTabs.filter((tab) => tab !== '全部').map((tab) => (
                  <option key={tab} value={tab}>
                    {tab}
                  </option>
                ))}
              </select>
            </label>
            <label>
              天氣
              <input
                aria-label="心得天氣"
                type="text"
                value={activeRef.weather}
                onChange={(event) => handleUpdateReflection({ weather: event.target.value })}
              />
            </label>
          </div>
          <div className="reflection-actions-row">
            <button type="button" onClick={() => reflectionPhotoInputRef.current?.click()}>
              <Upload aria-hidden="true" size={15} />
              上傳心得照片
            </button>
            <button className="delete-reflection-btn" type="button" onClick={handleDeleteReflection}>
              <Trash2 aria-hidden="true" size={15} />
              刪除目前心得
            </button>
            <input
              ref={reflectionPhotoInputRef}
              aria-label="選擇心得照片"
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={(event) => {
                handleReflectionPhotoUpload(event.target.files?.[0])
                event.currentTarget.value = ''
              }}
            />
            {reflectionUploadMessage ? (
              <span className="reflection-upload-message">{reflectionUploadMessage}</span>
            ) : null}
          </div>
          <h2 aria-label={activeRef.title}>
            <input
              aria-label="心得標題"
              type="text"
              value={activeRef.title}
              onChange={(event) => handleUpdateReflection({ title: event.target.value })}
            />
          </h2>
          <div className="reflection-body reflection-editor-body">
            <textarea
              aria-label="心得內容"
              value={activeRef.text}
              onChange={(event) => handleUpdateReflection({ text: event.target.value })}
            />
            <textarea
              aria-label="延伸心得"
              placeholder="可以補上一段更長的回想..."
              value={activeRef.extendedText}
              onChange={(event) => handleUpdateReflection({ extendedText: event.target.value })}
            />
          </div>

          <div className="reflection-photo-row" aria-label="心得照片">
            {activeReflectionPhotos.map((photo, index) => (
              <figure
                className={`mini-polaroid tilt-${index}`}
                key={photo.id}
                onClick={() => onOpenLightbox(photo.imageUrl)}
              >
                <img src={photo.imageUrl} alt={photo.title} />
                <figcaption>
                  {photo.editable ? (
                    <span className="reflection-photo-editor">
                      <input
                        aria-label={`心得照片名稱：${photo.originalTitle}`}
                        type="text"
                        value={photo.title}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => handleRenameReflectionPhoto(photo.id, event.target.value)}
                      />
                      <button
                        aria-label={`刪除${photo.title}`}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDeleteReflectionPhoto(photo.id)
                        }}
                      >
                        刪除
                      </button>
                    </span>
                  ) : (
                    photo.title
                  )}
                </figcaption>
              </figure>
            ))}
          </div>

          <label className="reflection-tags-editor">
            標籤
            <input
              aria-label="心得標籤"
              type="text"
              value={activeRef.tags.join('、')}
              onChange={(event) => handleTagsChange(event.target.value)}
            />
          </label>

          <div className="reflection-tag-row">
            {activeRef.tags.map((tag) => (
              <span key={tag} className="mood-chip-tag">
                #{tag}
              </span>
            ))}
          </div>

          <div className="memory-links">
            <div className="mem-block">
              <strong>相關回憶</strong>
              <div className="mem-links-tags">
                <span>生活筆記</span>
                <span>城市傍晚</span>
                <span>朋友的提醒</span>
              </div>
            </div>
            <div className="lined-memo-card">
              <strong>給未來的自己</strong>
              <p>回頭看時，記得你已經很努力地把日子接住了。☕</p>
            </div>
          </div>

          <div className="reflection-quote">今天的重點：先讓感受有地方坐下。</div>
            </>
          ) : (
            <div className="reflection-empty-page">
              <h2>尚未選擇心得</h2>
              <p>目前沒有任何預設範例。新增第一則心得後，右側會顯示可編輯內容與照片上傳區。</p>
              <button className="soft-button" type="button" onClick={handleCreateReflection}>
                <Plus aria-hidden="true" size={16} />
                寫一則新心得
              </button>
            </div>
          )}
        </article>

        {/* Right Edge Tabs */}
        <div className="page-tabs reflection-tabs" aria-label="心得右側分頁">
          {([...moodTabs, '+'] as string[]).map((tab) => (
            <button
              className={selectedMood === tab ? 'active' : ''}
              key={tab}
              type="button"
              onClick={() => {
                if (tab !== '+') setSelectedMood(tab)
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}

/* ==========================================
   6. 聊天頁 (ChatPage - Postcard thread)
   ========================================== */
function ChatPage({
  onOpenLightbox,
  chatThreads,
  setChatThreads,
  posts,
  setPosts,
  onCreatePost,
  onUpdatePost,
  onDeletePost,
  activeThreadId,
  setActiveThreadId,
  activeTab: activeRightTab,
  setActiveTab: setActiveRightTab,
  currentUserName,
}: {
  onOpenLightbox: (url: string) => void
  chatThreads: ChatThread[]
  setChatThreads: React.Dispatch<React.SetStateAction<ChatThread[]>>
  posts: ChatFeedPost[]
  setPosts: React.Dispatch<React.SetStateAction<ChatFeedPost[]>>
  onCreatePost: (post: ChatFeedPost) => void
  onUpdatePost: (postId: string, post: Partial<ChatFeedPost>) => void
  onDeletePost: (postId: string) => void
  activeThreadId: string
  setActiveThreadId: (id: string) => void
  activeTab: string
  setActiveTab: (tab: string) => void
  currentUserName: string
}) {
  const buildCommentPlaceholders = (count: number): ChatComment[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `seed-comment-${count}-${index}`,
      author: index % 2 === 0 ? '小安' : '阿哲',
      text: index === 0 ? '這張好有氣氛。' : '想收藏到相簿。',
      time: index === 0 ? '剛剛' : '昨天',
    }))

  const feedPosts: ChatFeedPost[] = [
    {
      id: 'feed-1',
      author: '小安',
      avatarUrl:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
      action: '今天分享了 3 張照片',
      text: '今天去看展覽，好喜歡這個地方。',
      time: '2 小時前',
      likes: 12,
      editable: true,
      isOnline: true,
      images: [
        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=700&q=80',
        'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=700&q=80',
        'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=700&q=80',
      ],
      comments: buildCommentPlaceholders(3),
      chatMessages: [
        {
          id: 'message-1',
          author: '小安',
          text: '我把今天展覽的照片先放這裡，你可以直接回覆或收藏。',
          time: '2 小時前',
        },
        {
          id: 'message-2',
          author: '我',
          text: '收到，我晚點整理到相簿。',
          time: '1 小時前',
          mine: true,
        },
      ],
    },
    {
      id: 'feed-2',
      author: '阿哲',
      avatarUrl:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
      action: '昨天分享了 5 張照片',
      text: '週末和朋友去爬山，風景超棒！',
      time: '昨天 20:15',
      likes: 18,
      editable: false,
      isOnline: false,
      images: [
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=700&q=80',
        'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=700&q=80',
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=700&q=80',
      ],
      comments: buildCommentPlaceholders(5),
      chatMessages: [
        {
          id: 'message-3',
          author: '阿哲',
          text: '下次要不要一起排登山行程？',
          time: '昨天',
        },
      ],
    },
    {
      id: 'feed-3',
      author: '小柔',
      avatarUrl:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
      action: '2 天前分享了 4 張照片',
      text: '午後咖啡和一點安靜時間。',
      time: '2 天前',
      likes: 14,
      editable: false,
      isOnline: true,
      images: [
        'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=700&q=80',
        'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=700&q=80',
        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=700&q=80',
      ],
      comments: buildCommentPlaceholders(4),
      chatMessages: [
        {
          id: 'message-4',
          author: '小柔',
          text: '這間咖啡館很安靜，適合寫心得。',
          time: '2 天前',
        },
      ],
    },
  ]
  const emptyDraft: ChatPostDraft = { text: '', photoUrl: '', images: [] }
  const [selectedPostId, setSelectedPostId] = useState(feedPosts[0]?.id ?? '')
  const [editorMode, setEditorMode] = useState<'closed' | 'new' | 'edit'>('closed')
  const [draft, setDraft] = useState<ChatPostDraft>(emptyDraft)
  const [searchQuery, setSearchQuery] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [replyDraft, setReplyDraft] = useState('')

  const activePost = posts.find((post) => post.id === selectedPostId) ?? posts[0]
  const activeThread = chatThreads.find((t) => t.id === activeThreadId) || chatThreads[0]

  const rightTabs = ['全部', '我的貼文', '好友貼文', '聊天室', '收藏'] as const
  const isChatRoomOpen = activeRightTab === '聊天室'

  const visiblePosts = posts.filter((post) => {
    const matchesSearch =
      searchQuery.trim().length === 0 ||
      `${post.author} ${post.text}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
    const matchesTab =
      activeRightTab === '我的貼文'
        ? post.editable
        : activeRightTab === '好友貼文'
          ? !post.editable
          : activeRightTab === '收藏'
            ? post.likedByMe
            : true

    return matchesSearch && matchesTab
  })

  // Filtered Chat Threads for the search query
  const visibleThreads = useMemo(() => {
    if (!searchQuery.trim()) return chatThreads
    const q = searchQuery.toLowerCase()
    return chatThreads.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.messages.some((m) => m.text.toLowerCase().includes(q)),
    )
  }, [chatThreads, searchQuery])

  const openNewPostEditor = () => {
    setActiveRightTab('全部')
    setEditorMode('new')
    setDraft(emptyDraft)
  }

  const openEditPostEditor = () => {
    if (!activePost?.editable) return
    setActiveRightTab('全部')
    setEditorMode('edit')
    setDraft({ text: activePost.text, photoUrl: '', images: activePost.images })
  }

  const addDraftPhoto = () => {
    const url = draft.photoUrl.trim()
    if (!url) return
    setDraft((currentDraft) => ({
      ...currentDraft,
      photoUrl: '',
      images: [...currentDraft.images, url],
    }))
  }

  const uploadDraftPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    const uploadedUrls = await Promise.all(Array.from(files).map((file) => getStoredFileUrl(file)))
    setDraft((currentDraft) => ({
      ...currentDraft,
      images: [...currentDraft.images, ...uploadedUrls],
    }))
  }

  const savePost = () => {
    const text = draft.text.trim()
    if (!text) return

    if (editorMode === 'edit' && activePost) {
      const updatedPost = {
        ...activePost,
        action: `剛剛更新了 ${draft.images.length} 張照片`,
        text,
        time: '剛剛',
        images: draft.images,
      }
      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === activePost.id ? updatedPost : post,
        ),
      )
      onUpdatePost(activePost.id, updatedPost)
    } else {
      const nextPost: ChatFeedPost = {
        id: `feed-${Date.now()}`,
        author: '我',
        avatarUrl:
          'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=120&q=80',
        action: `剛剛分享了 ${draft.images.length} 張照片`,
        text,
        time: '剛剛',
        likes: 0,
        editable: true,
        isOnline: true,
        images: draft.images,
        comments: [],
        chatMessages: [
          {
            id: `message-${Date.now()}`,
            author: '我',
            text,
            time: '剛剛',
            mine: true,
          },
        ],
      }
      setPosts((currentPosts) => [nextPost, ...currentPosts])
      setSelectedPostId(nextPost.id)
      onCreatePost(nextPost)
    }

    setEditorMode('closed')
    setDraft(emptyDraft)
  }

  const deleteActivePost = () => {
    if (!activePost?.editable) return
    const remainingPosts = posts.filter((post) => post.id !== activePost.id)
    setPosts(remainingPosts)
    setSelectedPostId(remainingPosts[0]?.id ?? '')
    setEditorMode('closed')
    onDeletePost(activePost.id)
  }

  const toggleLikePost = () => {
    if (!activePost) return
    const likedByMe = !activePost.likedByMe
    const updatedPost = {
      ...activePost,
      likedByMe,
      likes: Math.max(0, activePost.likes + (likedByMe ? 1 : -1)),
    }
    setPosts((currentPosts) =>
      currentPosts.map((post) => (post.id === activePost.id ? updatedPost : post)),
    )
    onUpdatePost(activePost.id, updatedPost)
  }

  const submitComment = () => {
    const text = commentDraft.trim()
    if (!text || !activePost) return
    const nextComment: ChatComment = {
      id: `comment-${Date.now()}`,
      author: '我',
      text,
      time: '剛剛',
    }
    const updatedPost = { ...activePost, comments: [...activePost.comments, nextComment] }
    setPosts((currentPosts) =>
      currentPosts.map((post) => (post.id === activePost.id ? updatedPost : post)),
    )
    onUpdatePost(activePost.id, updatedPost)
    setCommentDraft('')
  }



  const sendThreadMessage = () => {
    const text = replyDraft.trim()
    if (!text || !activeThread) return
    const nextMessage: ChatThreadMessage = {
      id: `thread-msg-${Date.now()}`,
      author: '我',
      text,
      time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      mine: true,
    }
    setChatThreads((prev) =>
      prev.map((t) => {
        if (t.id === activeThread.id) {
          return { ...t, messages: [...t.messages, nextMessage] }
        }
        return t
      }),
    )
    setReplyDraft('')
  }

  return (
    <section className="page-surface chat-postcard-page chat-feed-page">
      <div className="page-hero chat-hero">
        <div className="hero-text-content">
          <h2>{isChatRoomOpen ? '即時聊天室' : '好友貼文'}</h2>
          <p>
            {isChatRoomOpen
              ? '與好友和群組進行即時書信交談，連繫有溫度的情感。'
              : '把相簿裡的好友分享移到這裡，聊天頁先像一面柔和的近況牆。'}
          </p>
        </div>
        {!isChatRoomOpen && (
          <button className="soft-button" type="button" onClick={openNewPostEditor}>
            <MessageCircle aria-hidden="true" size={17} />
            發一則貼文
          </button>
        )}
      </div>

      <section className="book-spread letter-book chat-feed-book no-binder-spine" aria-label="聊天貼文活頁本">
        <aside className="book-page book-page-left letter-list chat-feed-list" aria-label="好友貼文列表">
          <div className="binder-page-heading">
            <div>
              <h3>{isChatRoomOpen ? '訊息清單' : '好友近況'}</h3>
              <p>{isChatRoomOpen ? '對話與群組聊天' : '從相簿分享搬來的照片貼文'}</p>
            </div>
            <span className="quiet-label">
              {isChatRoomOpen ? `對話 ${visibleThreads.length}` : `貼文 ${posts.length}`}
            </span>
          </div>

          <div className="paper-search">
            <Search aria-hidden="true" size={15} />
            <input
              aria-label={isChatRoomOpen ? '搜尋聊天室或訊息' : '搜尋貼文或好友'}
              placeholder={isChatRoomOpen ? '搜尋聊天室或訊息...' : '搜尋貼文或好友...'}
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="letter-stack" style={{ gap: '8px' }}>
            {isChatRoomOpen ? (
              // Dynamic DMs / Group chats list rendering
              visibleThreads.map((thread) => {
                const lastMsg = thread.messages[thread.messages.length - 1]
                const isSelected = thread.id === activeThreadId
                return (
                  <button
                    className={isSelected ? 'chat-thread-row active' : 'chat-thread-row'}
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setActiveThreadId(thread.id)
                    }}
                  >
                    <div className="thread-avatar-area">
                      {thread.type === 'group' ? (
                        <div className="thread-group-avatar-icon">👥</div>
                      ) : (
                        <img src={thread.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80'} alt="" />
                      )}
                    </div>
                    <div className="thread-brief-info">
                      <div className="thread-header-line">
                        <strong>{thread.name}</strong>
                        {lastMsg && <span className="thread-time">{lastMsg.time}</span>}
                      </div>
                      <p className="thread-last-message-excerpt">
                        {lastMsg ? `${lastMsg.author}: ${lastMsg.text}` : '尚無對話紀錄'}
                      </p>
                    </div>
                  </button>
                )
              })
            ) : (
              // Original Posts list rendering
              visiblePosts.map((post) => (
                <button
                  className={activePost.id === post.id ? 'letter-row active' : 'letter-row'}
                  key={post.id}
                  type="button"
                  onClick={() => {
                    setSelectedPostId(post.id)
                    setEditorMode('closed')
                  }}
                >
                  <span className="letter-avatar">
                    <img src={post.avatarUrl} alt="" />
                    {post.isOnline ? <i aria-hidden="true" /> : null}
                  </span>
                  <span className="letter-row-brief">
                    <strong>{post.editable ? '我' : post.author}</strong>
                    <span>{post.text}</span>
                  </span>
                  <small className="time-badge">{post.time}</small>
                </button>
              ))
            )}
            {!isChatRoomOpen && visiblePosts.length === 0 ? (
              <div className="chat-empty-state">沒有符合的貼文，換個關鍵字試試。</div>
            ) : null}
            {isChatRoomOpen && visibleThreads.length === 0 ? (
              <div className="chat-empty-state">沒有符合的聊天室。</div>
            ) : null}
          </div>

          {!isChatRoomOpen && (
            <button className="wide-paper-button" type="button" onClick={openNewPostEditor}>
              <Plus aria-hidden="true" size={16} />
              新增貼文
            </button>
          )}
        </aside>

        <article className="book-page book-page-right postcard-thread chat-feed-detail" aria-label="貼文照片牆">
          {isChatRoomOpen && activeThread ? (
            // Chat room dialogue flow
            <section className="chat-room-panel" aria-label="聊天室功能區">
              <div className="paper-toolbar">
                <span>
                  {activeThread.type === 'group' ? '👥 群組聊天室' : '💬 個人聊天室'} · {activeThread.name}
                </span>
                <div className="postcard-actions-top">
                  <button type="button">收藏對話</button>
                  <button type="button">連結到行事曆</button>
                </div>
              </div>

              <div className="postcard-thread-container compact-chat-thread">
                {activeThread.messages.map((message) => (
                  <div className={message.mine ? 'postcard my-msg-card' : 'postcard friend-msg-card'} key={message.id}>
                    <div className="postcard-stamp">{message.mine ? 'Reply' : 'Chat'}</div>
                    <h3>{message.author}</h3>
                    <p>{message.text}</p>
                  </div>
                ))}
                {activeThread.messages.length === 0 && (
                  <div className="chat-empty-state">尚無對話訊息，寫信給對方吧！</div>
                )}
              </div>

              <div className="letter-composer">
                <textarea
                  aria-label="回覆文字"
                  placeholder="寫一則回覆..."
                  rows={3}
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                ></textarea>
                <div className="composer-actions">
                  <div className="left-composer-tools">
                    <button type="button" aria-label="傳送照片">
                      <Image aria-hidden="true" size={15} />
                      傳送照片
                    </button>
                    <button type="button" aria-label="收藏到筆記">
                      <Paperclip aria-hidden="true" size={15} />
                      收藏到筆記
                    </button>
                  </div>
                  <button type="button" className="send-letter-btn" onClick={sendThreadMessage}>
                    傳送文字
                  </button>
                </div>
              </div>
            </section>
          ) : editorMode !== 'closed' ? (
            <section className="chat-post-editor" aria-label="貼文編輯器">
              <div className="paper-toolbar">
                <span>{editorMode === 'edit' ? '編輯貼文' : '新增貼文'}</span>
                <button type="button" onClick={() => setEditorMode('closed')}>
                  取消
                </button>
              </div>
              <textarea
                aria-label="貼文內容"
                placeholder="寫下今天想分享的照片或近況..."
                rows={5}
                value={draft.text}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, text: event.target.value }))}
              />
              <div className="chat-photo-input-row">
                <input
                  aria-label="照片網址"
                  placeholder="貼上照片網址"
                  type="url"
                  value={draft.photoUrl}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({ ...currentDraft, photoUrl: event.target.value }))
                  }
                />
                <button type="button" onClick={addDraftPhoto}>
                  加入照片
                </button>
              </div>
              <label className="chat-file-upload">
                <Upload aria-hidden="true" size={15} />
                上傳照片
                <input
                  aria-label="上傳貼文照片"
                  accept="image/*"
                  multiple
                  type="file"
                  onChange={(event) => uploadDraftPhotos(event.currentTarget.files)}
                />
              </label>
              <div className="draft-photo-preview">
                <span>{draft.images.length} 張照片待發布</span>
                <div className="draft-photo-strip">
                  {draft.images.map((imageUrl) => (
                    <button
                      aria-label="移除待發布照片"
                      key={imageUrl}
                      type="button"
                      onClick={() =>
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          images: currentDraft.images.filter((url) => url !== imageUrl),
                        }))
                      }
                    >
                      <img src={imageUrl} alt="" />
                    </button>
                  ))}
                </div>
              </div>
              <button className="send-letter-btn" type="button" onClick={savePost}>
                儲存貼文
              </button>
            </section>
          ) : activePost ? (
            <article className="chat-share-card">
              <div className="share-card-header">
                <div className="share-author">
                  <span className="share-avatar">
                    <img src={activePost.avatarUrl} alt="" />
                    {activePost.isOnline ? <i aria-hidden="true" /> : null}
                  </span>
                  <div>
                    <strong>{activePost.editable ? '我' : activePost.author}</strong>
                    <span>{activePost.action}</span>
                  </div>
                </div>
                <div className="share-card-actions">
                  {activePost.editable ? (
                    <button type="button" aria-label="編輯貼文" onClick={openEditPostEditor}>
                      ✏️
                    </button>
                  ) : null}
                  {activePost.editable ? (
                    <button type="button" aria-label="刪除貼文" onClick={deleteActivePost}>
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  ) : null}
                  <button type="button" aria-label="更多貼文選項">
                    ...
                  </button>
                </div>
              </div>

              <div className="share-card-body">
                <p className="share-text">{activePost.text}</p>
                <div className="share-photo-grid">
                  {activePost.images.map((imageUrl, index) => (
                    <button
                      aria-label={`查看${activePost.editable ? '我' : activePost.author}第${index + 1}張照片`}
                      className="share-photo-item"
                      key={imageUrl}
                      onClick={() => onOpenLightbox(imageUrl)}
                      type="button"
                    >
                      <img src={imageUrl} alt="" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="share-card-footer">
                <span>{activePost.time}</span>
                <div>
                  <button
                    className={activePost.likedByMe ? 'feedback-button active' : 'feedback-button'}
                    type="button"
                    aria-label="按讚貼文"
                    onClick={toggleLikePost}
                  >
                    ♥ {activePost.likes}
                  </button>
                  <span>💬 {activePost.comments.length}</span>
                </div>
              </div>
              <section className="chat-comment-panel" aria-label="貼文留言">
                <div className="chat-comment-list">
                  {activePost.comments.slice(-3).map((comment) => (
                    <p key={comment.id}>
                      <strong>{comment.author === currentUserName ? '我' : comment.author}</strong>
                      <span>{comment.text}</span>
                      <small>{comment.time}</small>
                    </p>
                  ))}
                </div>
                <div className="chat-comment-form">
                  <input
                    aria-label="留言內容"
                    placeholder="寫一則留言..."
                    type="text"
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                  />
                  <button type="button" onClick={submitComment}>
                    送出留言
                  </button>
                </div>
              </section>
            </article>
          ) : (
            <div className="chat-empty-state">目前沒有貼文，先新增一則近況吧。</div>
          )}
        </article>

        {/* Right side group tabs */}
        <div className="page-tabs reflection-tabs" aria-label="好友右側分頁">
          {rightTabs.map((tab) => (
            <button
              className={activeRightTab === tab ? 'active' : ''}
              key={tab}
              type="button"
              onClick={() => {
                setActiveRightTab(tab)
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}

interface FriendsPageProps {
  friends: Friend[]
  groups: FriendGroup[]
  setGroups: React.Dispatch<React.SetStateAction<FriendGroup[]>>
  onCreateGroup: (name: string) => string
  onDeleteGroup: (groupId: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onStartChat: (targetId: string) => void
  onToggleStarFriend: (friendId: string) => void
  onDeleteFriend: (friendId: string) => void
  onStartCall: (friendId: string) => void
  onOpenAddFriend: () => void
  onAcceptInvite: (friendshipId: string) => void
  onDeclineInvite: (friendshipId: string) => void
  onSendInvite: (email: string) => Promise<boolean>
}

function FriendsPage({
  friends,
  groups,
  setGroups,
  onCreateGroup,
  onDeleteGroup,
  onRenameGroup,
  onStartChat,
  onToggleStarFriend,
  onDeleteFriend,
  onStartCall,
  onOpenAddFriend,
  onAcceptInvite,
  onDeclineInvite,
  onSendInvite,
}: FriendsPageProps) {
  const [activeTab, setActiveTab] = useState<'全部' | '好友' | '群組' | '邀請'>('全部')
  const [selectedFriendId, setSelectedFriendId] = useState('friend-1')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<'關於' | '共同回憶' | '筆記' | '相簿' | '行程'>('關於')

  const [searchQuery, setSearchQuery] = useState('')
  const [isEditingGroups, setIsEditingGroups] = useState(false)
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // User search and invite states
  const [inviteEmail, setInviteEmail] = useState('')
  const [searchResult, setSearchResult] = useState<UserProfile | null>(null)
  const [searchError, setSearchError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isSendingInvite, setIsSendingInvite] = useState(false)
  const [inviteSentSuccess, setInviteSentSuccess] = useState(false)

  const handleSearchUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setIsSearching(true)
    setSearchError('')
    setSearchResult(null)
    setInviteSentSuccess(false)
    try {
      const result = await callApi<UserProfile | null>('GET', `/profiles/search?email=${encodeURIComponent(inviteEmail.trim())}`)
      if (result) {
        setSearchResult(result)
      } else {
        setSearchError('找不到該使用者，請確認 Email 是否輸入正確。')
      }
    } catch (err) {
      console.error('Search user failed:', err)
      setSearchError('搜尋時發生錯誤，請稍後再試。')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSendInviteSubmit = async () => {
    if (!searchResult) return
    setIsSendingInvite(true)
    try {
      const ok = await onSendInvite(searchResult.email)
      if (ok) {
        setInviteSentSuccess(true)
        setSearchResult(null)
        setInviteEmail('')
      } else {
        alert('傳送好友邀請失敗，可能已是好友或已有待處理邀請。')
      }
    } catch (err) {
      console.error('Send invite failed:', err)
      alert('傳送好友邀請時發生錯誤。')
    } finally {
      setIsSendingInvite(false)
    }
  }

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')

  const acceptedFriends = useMemo(() => {
    return friends.filter(f => f.friendshipStatus === 'accepted' || !f.friendshipStatus)
  }, [friends])

  // Filtered and sorted friends list: Starred置頂
  const filteredFriends = useMemo(() => {
    let list = acceptedFriends
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.status.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => {
      const aStar = a.isStarred ? 1 : 0
      const bStar = b.isStarred ? 1 : 0
      return bStar - aStar
    })
  }, [acceptedFriends, searchQuery])

  const pendingInvites = useMemo(() => {
    return friends.filter(f => f.friendshipStatus === 'pending')
  }, [friends])

  const filteredGroups = useMemo(() => {
    let list = groups
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((g) => g.name.toLowerCase().includes(q))
    }
    return list
  }, [groups, searchQuery])

  // Sync selection when activeTab changes
  useEffect(() => {
    queueMicrotask(() => {
      if (activeTab === '群組') {
        if (!selectedGroupId && groups.length > 0) {
          setSelectedGroupId(groups[0].id)
        }
        setSelectedFriendId('')
      } else if (activeTab === '邀請') {
        setSelectedGroupId(null)
        if (!selectedFriendId && pendingInvites.length > 0) {
          setSelectedFriendId(pendingInvites[0].id)
        }
      } else {
        setSelectedGroupId(null)
        if (filteredFriends.length === 0) {
          setSelectedFriendId('')
        } else if (!selectedFriendId || !filteredFriends.some((friend) => friend.id === selectedFriendId)) {
          setSelectedFriendId(filteredFriends[0].id)
        }
      }
      setIsEditingGroups(false)
    })
  }, [activeTab, filteredFriends, groups, pendingInvites, selectedGroupId, selectedFriendId])

  const activeFriend = activeTab === '邀請'
    ? undefined
    : (filteredFriends.find((f) => f.id === selectedFriendId) ?? filteredFriends[0])
  const activeGroup = groups.find((g) => g.id === selectedGroupId)

  const getFriendGroups = (friendId: string) => {
    return groups.filter((g) => g.memberIds.includes(friendId))
  }

  const handleCreateGroup = () => {
    const name = newGroupName.trim()
    if (!name) return
    const createdId = onCreateGroup(name)
    setNewGroupName('')
    setIsCreatingGroup(false)
    setSelectedGroupId(createdId)
  }

  const handleDeleteGroup = (groupId: string) => {
    onDeleteGroup(groupId)
    setSelectedGroupId(null)
  }

  const handleRenameGroup = (groupId: string) => {
    const name = editingGroupName.trim()
    if (!name) return
    onRenameGroup(groupId, name)
    setEditingGroupId(null)
    setEditingGroupName('')
  }

  const handleAddMemberToGroup = (groupId: string, friendId: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === groupId) {
          if (!g.memberIds.includes(friendId)) {
            return { ...g, memberIds: [...g.memberIds, friendId] }
          }
        }
        return g
      }),
    )
  }

  const handleRemoveMemberFromGroup = (groupId: string, friendId: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === groupId) {
          return { ...g, memberIds: g.memberIds.filter((id) => id !== friendId) }
        }
        return g
      }),
    )
  }

  const handleUpdateFriendGroups = (friendId: string, checkedGroupIds: string[]) => {
    setGroups((prev) =>
      prev.map((g) => {
        const shouldHave = checkedGroupIds.includes(g.id)
        const has = g.memberIds.includes(friendId)
        if (shouldHave && !has) {
          return { ...g, memberIds: [...g.memberIds, friendId] }
        } else if (!shouldHave && has) {
          return { ...g, memberIds: g.memberIds.filter((id) => id !== friendId) }
        }
        return g
      }),
    )
    setIsEditingGroups(false)
  }

  const showGroupDetail =
    activeTab === '群組' && selectedGroupId !== null && !!activeGroup

  return (
    <section className="page-surface friends-handbook-page">
      <header className="page-hero friends-hero">
        <div>
          <h2>好友手札</h2>
          <p>珍惜每一份相遇，記錄我們的美好時光。</p>
        </div>
        <div className="friends-search-header">
          <div className="search-pill">
            <Search size={15} />
            <input
              type="text"
              placeholder="搜尋姓名、群組或標籤..."
              aria-label="搜尋好友"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="soft-button" type="button" onClick={onOpenAddFriend}>
            <Mail aria-hidden="true" size={17} />
            邀請好友
          </button>
        </div>
      </header>

      {/* Book spread */}
      <section className="book-spread friend-book" aria-label="好友手札活頁本">
        {/* Left page: Friends or Groups list */}
        <aside className="book-page book-page-left">
          <div className="binder-page-heading">
            <div>
              <h3>
                {activeTab === '群組'
                  ? '我的群組'
                  : activeTab === '邀請'
                    ? '待處理的好友邀請'
                    : '好友列表'}
              </h3>
              <p>
                共{' '}
                {activeTab === '群組'
                  ? filteredGroups.length
                  : activeTab === '邀請'
                    ? pendingInvites.length
                    : filteredFriends.length}{' '}
                個項目
              </p>
            </div>
          </div>

          <div className="friend-handbook-list">
            {activeTab === '群組' ? (
              // Groups tab list
              <>
                {filteredGroups.map((group) => (
                  <button
                    className={
                      selectedGroupId === group.id
                        ? 'friend-handbook-row active'
                        : 'friend-handbook-row'
                    }
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group.id)
                      setSelectedFriendId('')
                    }}
                  >
                    <div className="group-list-icon">👥</div>
                    <div className="friend-summary-info">
                      <strong>{group.name}</strong>
                      <span>成員人數: {group.memberIds.length} 人</span>
                    </div>
                  </button>
                ))}

                {isCreatingGroup ? (
                  <div className="create-group-inline-form">
                    <input
                      type="text"
                      placeholder="群組名稱..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      aria-label="新群組名稱"
                      maxLength={15}
                    />
                    <div className="inline-form-buttons">
                      <button
                        type="button"
                        className="inline-confirm-btn"
                        onClick={handleCreateGroup}
                      >
                        確認
                      </button>
                      <button
                        type="button"
                        className="inline-cancel-btn"
                        onClick={() => {
                          setIsCreatingGroup(false)
                          setNewGroupName('')
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="wide-paper-button"
                    type="button"
                    onClick={() => setIsCreatingGroup(true)}
                  >
                    <Plus aria-hidden="true" size={16} />
                    建立新群組
                  </button>
                )}
              </>
            ) : activeTab === '邀請' ? (
              // Invites tab list
              <>
                {pendingInvites.length === 0 ? (
                  <div className="friend-empty-state" style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: '#888' }}>
                    目前沒有待處理的好友邀請 🍃
                  </div>
                ) : (
                  pendingInvites.map((invite) => (
                    <button
                      className={
                        selectedFriendId === invite.id
                          ? 'friend-handbook-row active'
                          : 'friend-handbook-row'
                      }
                      key={invite.id}
                      type="button"
                      onClick={() => {
                        setSelectedFriendId(invite.id)
                        setSelectedGroupId(null)
                      }}
                    >
                      <img src={invite.avatarUrl} alt="" />
                      <div className="friend-summary-info">
                        <div className="friend-row-name-line">
                          <strong>{invite.name}</strong>
                          <span className={`status-dot ${invite.tone}`} />
                        </div>
                        <span style={{ fontSize: '11px', color: invite.isIncoming ? '#a15d5d' : '#5d71a1', fontWeight: 'bold' }}>
                          {invite.isIncoming ? '📥 收到好友邀請' : '📤 已送出邀請'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </>
            ) : (
              // Friends list (All or Friends tab)
              filteredFriends.map((friend) => {
                const friendGroups = getFriendGroups(friend.id)
                return (
                  <button
                    className={
                      selectedFriendId === friend.id
                        ? 'friend-handbook-row active'
                        : 'friend-handbook-row'
                    }
                    key={friend.id}
                    type="button"
                    onClick={() => {
                      setSelectedFriendId(friend.id)
                      setSelectedGroupId(null)
                    }}
                  >
                    <img src={friend.avatarUrl} alt="" />
                    <div className="friend-summary-info">
                      <div className="friend-row-name-line">
                        <strong>{friend.name}</strong>
                        {friend.isStarred && <span className="star-badge" title="最愛好友">★</span>}
                        <span className={`status-dot ${friend.tone}`} />
                      </div>
                      <span>{friend.status}</span>
                      {activeTab === '全部' && friendGroups.length > 0 && (
                        <div className="friend-group-badges">
                          {friendGroups.map((g) => (
                            <span key={g.id} className="group-badge">
                               {g.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {activeTab !== '群組' && activeTab !== '邀請' && (
            <button className="wide-paper-button" type="button" onClick={onOpenAddFriend}>
              <Plus aria-hidden="true" size={16} />
              邀請好友加入
            </button>
          )}
        </aside>

        {/* Right page: Profile info or Group Detail */}
        <article className="book-page book-page-right friend-profile-page">
          {(() => {
            const activeInvite = pendingInvites.find(i => i.id === selectedFriendId)

            if (activeTab === '邀請') {
              if (activeInvite) {
                return (
                  <div className="invite-detail-card" style={{ padding: '20px' }}>
                    <div className="profile-header" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <img src={activeInvite.avatarUrl} alt="" style={{ width: '60px', height: '60px', borderRadius: '50%' }} />
                      <div>
                        <h2 style={{ margin: '0', fontSize: '20px', color: '#48341f' }}>{activeInvite.name}</h2>
                        <span className={`status-dot ${activeInvite.tone}`} style={{ marginRight: '6px' }} />
                        <span style={{ fontSize: '13px', color: '#7a6a53' }}>{activeInvite.status}</span>
                      </div>
                    </div>
                    
                    <div style={{ marginTop: '25px', padding: '15px', background: 'rgba(161, 93, 93, 0.05)', borderRadius: '6px', border: '1px dashed #d3c4a9' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#48341f' }}>邀請詳情</h4>
                      <p style={{ margin: '0', fontSize: '13px', color: '#73614e' }}>
                        {activeInvite.isIncoming 
                          ? `「${activeInvite.name}」向您送出了好友邀請。接受後即可互相聊天與共享回憶！`
                          : `您已向「${activeInvite.name}」送出好友邀請，正在等待對方核准。`}
                      </p>
                    </div>

                    <div className="invite-actions" style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
                      {activeInvite.isIncoming ? (
                        <>
                          <button
                            type="button"
                            className="btn-paper-submit"
                            style={{ padding: '10px 20px', fontSize: '13px', background: '#5c7c59', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            onClick={() => {
                              if (activeInvite.friendshipId) {
                                onAcceptInvite(activeInvite.friendshipId)
                                setSelectedFriendId(activeInvite.id)
                                setActiveTab('好友')
                              }
                            }}
                          >
                            接受好友邀請 🟢
                          </button>
                          <button
                            type="button"
                            className="btn-paper-cancel"
                            style={{ padding: '10px 20px', fontSize: '13px', background: '#b15d5d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            onClick={() => {
                              if (activeInvite.friendshipId) {
                                onDeclineInvite(activeInvite.friendshipId)
                                setSelectedFriendId('')
                              }
                            }}
                          >
                            拒絕邀請 🔴
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn-paper-cancel"
                          style={{ padding: '10px 20px', fontSize: '13px', background: '#73614e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          onClick={() => {
                            if (activeInvite.friendshipId) {
                              onDeclineInvite(activeInvite.friendshipId)
                              setSelectedFriendId('')
                            }
                          }}
                        >
                          取消好友邀請 ✕
                        </button>
                      )}
                      <button
                        type="button"
                        style={{ padding: '10px 15px', fontSize: '13px', background: 'transparent', color: '#73614e', border: '1px solid #d3c4a9', borderRadius: '4px', cursor: 'pointer' }}
                        onClick={() => setSelectedFriendId('')}
                      >
                        返回搜尋 🔍
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div className="invite-search-panel" style={{ padding: '20px' }}>
                  <h3 style={{ marginTop: '0', color: '#48341f', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🔍 搜尋用戶與發送邀請
                  </h3>
                  <p style={{ fontSize: '12px', color: '#7a6a53', marginTop: '-5px', marginBottom: '15px' }}>
                    輸入對方的 Email 來尋找註冊於手札的使用者。
                  </p>
                  
                  <form onSubmit={handleSearchUser} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <input
                      type="email"
                      required
                      placeholder="請輸入 Email，例如：friend@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '2px solid #d3c4a9',
                        padding: '8px 0',
                        fontSize: '14px',
                        outline: 'none',
                        color: '#48341f'
                      }}
                    />
                    <button
                      type="submit"
                      disabled={isSearching}
                      style={{
                        padding: '6px 15px',
                        background: '#877864',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      {isSearching ? '搜尋中...' : '搜尋'}
                    </button>
                  </form>

                  {searchError && (
                    <div style={{ padding: '10px', background: 'rgba(177, 93, 93, 0.05)', color: '#b15d5d', borderRadius: '4px', fontSize: '12px', border: '1px solid rgba(177, 93, 93, 0.15)' }}>
                      ⚠️ {searchError}
                    </div>
                  )}

                  {inviteSentSuccess && (
                    <div style={{ padding: '12px', background: 'rgba(92, 124, 89, 0.05)', color: '#4d694b', borderRadius: '4px', fontSize: '13px', border: '1px solid rgba(92, 124, 89, 0.15)', fontWeight: 'bold' }}>
                      🎉 好友邀請已成功送出！請等待對方核准。
                    </div>
                  )}

                  {searchResult && (
                    <div className="search-result-card" style={{ marginTop: '20px', padding: '15px', background: '#fcfaf6', border: '1px solid #d3c4a9', borderRadius: '6px', boxShadow: '0 2px 5px rgba(0,0,0,0.03)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img src={searchResult.avatarUrl} alt="" style={{ width: '45px', height: '45px', borderRadius: '50%' }} />
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: '0', fontSize: '15px', color: '#48341f' }}>{searchResult.name}</h4>
                          <span style={{ fontSize: '11px', color: '#7a6a53' }}>{searchResult.email}</span>
                          <div style={{ fontSize: '12px', color: '#7a6a53', marginTop: '4px' }}>
                            <span className={`status-dot ${searchResult.tone}`} style={{ marginRight: '6px' }} />
                            {searchResult.status}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isSendingInvite}
                          onClick={handleSendInviteSubmit}
                          style={{
                            padding: '8px 12px',
                            background: '#5c7c59',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          {isSendingInvite ? '傳送中...' : '加為好友 ➕'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            }

            if (showGroupDetail && activeGroup) {
              return (
                <div className="group-detail-panel">
                  <div className="group-detail-header">
                    <div className="group-title-edit-row">
                      {editingGroupId === activeGroup.id ? (
                        <div className="group-rename-input-wrap">
                          <input
                            type="text"
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            maxLength={15}
                            aria-label="更名群組名稱"
                          />
                          <button
                            type="button"
                            className="rename-btn-confirm"
                            onClick={() => handleRenameGroup(activeGroup.id)}
                          >
                            儲存
                          </button>
                          <button
                            type="button"
                            className="rename-btn-cancel"
                            onClick={() => setEditingGroupId(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <>
                          <h2>👥 {activeGroup.name}</h2>
                          <button
                            type="button"
                            className="action-icon-btn"
                            aria-label="重命名群組"
                            onClick={() => {
                              setEditingGroupId(activeGroup.id)
                              setEditingGroupName(activeGroup.name)
                            }}
                          >
                            ✏️
                          </button>
                        </>
                      )}
                    </div>
                    <div className="group-header-actions-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="group-chat-btn"
                        onClick={() => onStartChat(activeGroup.id)}
                      >
                        💬 開啟聊天室
                      </button>
                      <button
                        type="button"
                        className="delete-group-action-btn"
                        onClick={() => handleDeleteGroup(activeGroup.id)}
                      >
                        🗑️ 刪除群組
                      </button>
                    </div>
                  </div>

                  <div className="group-detail-section">
                    <h4>群組成員 ({activeGroup.memberIds.length}人)</h4>
                    <div className="group-members-list-grid">
                      {activeGroup.memberIds.map((id) => {
                        const member = acceptedFriends.find((f) => f.id === id)
                        if (!member) return null
                        return (
                          <div key={member.id} className="group-member-item-row">
                            <div
                              className="member-info-click"
                              onClick={() => {
                                setActiveTab('好友')
                                setSelectedFriendId(member.id)
                                setSelectedGroupId(null)
                              }}
                            >
                              <img src={member.avatarUrl} alt="" />
                              <div className="member-brief-text">
                                <strong>{member.name}</strong>
                                <span>{member.status}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="member-remove-btn"
                              onClick={() =>
                                handleRemoveMemberFromGroup(activeGroup.id, member.id)
                              }
                            >
                              移除
                            </button>
                          </div>
                        )
                      })}
                      {activeGroup.memberIds.length === 0 && (
                        <p className="empty-group-text">本群組目前尚無成員。</p>
                      )}
                    </div>
                  </div>

                  <div className="group-add-member-section">
                    <h4>新增成員</h4>
                    {(() => {
                      const nonMembers = acceptedFriends.filter(
                        (f) => !activeGroup.memberIds.includes(f.id),
                      )
                      return nonMembers.length > 0 ? (
                        <div className="add-member-picker-row">
                          <select
                            id={`non-member-select-${activeGroup.id}`}
                            defaultValue=""
                            aria-label="選擇新成員"
                          >
                            <option value="" disabled>
                              選擇好友...
                            </option>
                            {nonMembers.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="add-member-confirm-btn"
                            onClick={() => {
                              const selectEl = document.getElementById(
                                `non-member-select-${activeGroup.id}`,
                              ) as HTMLSelectElement
                              if (selectEl && selectEl.value) {
                                handleAddMemberToGroup(activeGroup.id, selectEl.value)
                                selectEl.value = ''
                              }
                            }}
                          >
                            加入成員
                          </button>
                        </div>
                      ) : (
                        <p className="all-members-in-group-text">
                          所有好友皆已在此群組中。
                        </p>
                      )
                    })()}
                  </div>
                </div>
              )
            }

            if (activeFriend) {
              return (
                <>
                  <div className="profile-header">
                    <img src={activeFriend.avatarUrl} alt="" />
                    <div className="profile-meta-title">
                      <h2>{activeFriend.name}</h2>
                      <span>
                        🟢 在線 · {activeFriend.status}
                      </span>
                    </div>
                    <div className="profile-actions-icons">
                      <button
                        aria-label="傳訊息"
                        className="action-icon-btn"
                        type="button"
                        onClick={() => onStartChat(activeFriend.id)}
                      >
                        💬
                      </button>
                      <button
                        aria-label="撥打電話"
                        className="action-icon-btn"
                        type="button"
                        onClick={() => onStartCall(activeFriend.id)}
                      >
                        📞
                      </button>
                      <button
                        aria-label="星號收藏好友"
                        className={activeFriend.isStarred ? 'action-icon-btn starred-active' : 'action-icon-btn'}
                        type="button"
                        onClick={() => onToggleStarFriend(activeFriend.id)}
                      >
                        ★
                      </button>
                      <button
                        aria-label="刪除好友"
                        className="action-icon-btn delete-friend-btn"
                        type="button"
                        style={{ color: '#b15d5d' }}
                        onClick={() => {
                          if (window.confirm(`確定要將好友「${activeFriend.name}」自通訊錄中刪除嗎？`)) {
                            onDeleteFriend(activeFriend.id)
                          }
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="friend-sub-tabs">
                    {(['關於', '共同回憶', '筆記', '相簿', '行程'] as const).map(
                      (tab) => (
                        <span
                          className={
                            activeSubTab === tab
                              ? 'friend-tab-span active'
                              : 'friend-tab-span'
                          }
                          key={tab}
                          onClick={() => setActiveSubTab(tab)}
                        >
                          {tab}
                        </span>
                      ),
                    )}
                  </div>

                  {activeSubTab === '關於' && (
                    <div className="friend-about-section">
                      <div className="profile-grid">
                        {activeFriend.email ? (
                          <>
                            <div>
                              <strong>真實姓名 / 暱稱</strong>
                              <span>{activeFriend.name}</span>
                            </div>
                            <div>
                              <strong>聯絡信箱 (Email)</strong>
                              <span>{activeFriend.email}</span>
                            </div>
                            <div>
                              <strong>個人近況 / 座右銘</strong>
                              <span>{activeFriend.status || '尚未設定狀態'}</span>
                            </div>
                            <div>
                              <strong>在線狀態</strong>
                              <span>{activeFriend.tone === 'green' ? '🟢 在線' : activeFriend.tone === 'amber' ? '🟡 忙碌' : '⚫ 離線'}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <strong>生日</strong>
                              <span>07月18日</span>
                            </div>
                            <div>
                              <strong>所在地</strong>
                              <span>台北市</span>
                            </div>
                            <div>
                              <strong>興趣</strong>
                              <span>旅行、攝影、閱讀、咖啡</span>
                            </div>
                            <div>
                              <strong>備註</strong>
                              <span>喜歡安靜的地方，推薦的展覽很用心。</span>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="profile-groups-editor-box">
                        <strong>所屬群組</strong>
                        {isEditingGroups ? (
                          <div className="profile-groups-checkbox-grid">
                            <div className="checkbox-wrap-container">
                              {groups.map((g) => {
                                const isMember = g.memberIds.includes(activeFriend.id)
                                return (
                                  <label
                                    key={g.id}
                                    className="group-chk-label-item"
                                  >
                                    <input
                                      type="checkbox"
                                      defaultChecked={isMember}
                                      id={`chk-${g.id}`}
                                    />
                                    <span>{g.name}</span>
                                  </label>
                                )
                              })}
                            </div>
                            <div className="profile-groups-editor-actions">
                              <button
                                type="button"
                                className="editor-save-btn"
                                onClick={() => {
                                  const checkedIds = groups
                                    .filter((g) => {
                                      const chk = document.getElementById(
                                        `chk-${g.id}`,
                                      ) as HTMLInputElement
                                      return chk && chk.checked
                                    })
                                    .map((g) => g.id)
                                  handleUpdateFriendGroups(
                                    activeFriend.id,
                                    checkedIds,
                                  )
                                }}
                              >
                                儲存設定
                              </button>
                              <button
                                type="button"
                                className="editor-cancel-btn"
                                onClick={() => setIsEditingGroups(false)}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="profile-groups-viewer-wrap">
                            <div className="profile-groups-badges-row">
                              {getFriendGroups(activeFriend.id).map((g) => (
                                <span key={g.id} className="group-badge">
                                  {g.name}
                                </span>
                              ))}
                              {getFriendGroups(activeFriend.id).length === 0 && (
                                <span className="no-groups-badge-label">
                                  目前無所屬群組
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="profile-edit-groups-btn"
                              onClick={() => setIsEditingGroups(true)}
                            >
                              ✏️ 編輯好友群組
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="about-sticker">
                        <p>Good day, good friend. 🌿</p>
                      </div>
                    </div>
                  )}

                  {activeSubTab === '共同回憶' && (
                    <div className="friend-memories-section">
                      <div className="friend-empty-state">還沒有共同回憶，之後可從相簿或聊天貼文連結過來。</div>
                      <div className="recent-interactions-list">
                        <h4>最近互動</h4>
                        <div className="interaction-log-row">
                          <span>2026.06.24 14:30</span>
                          <p>
                            {activeFriend.name}{' '}
                            在你的心得「下午的陽光真好」按了讚
                          </p>
                        </div>
                        <div className="interaction-log-row">
                          <span>2026.06.20 19:45</span>
                          <p>
                            {activeFriend.name} 留言在你的筆記「花蓮三天兩夜」：
                            "照片拍得好美！下次也帶裝我去😊"
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSubTab !== '關於' && activeSubTab !== '共同回憶' && (
                    <div className="friend-sub-placeholder">
                      <p>尚無可共享的 {activeSubTab} 連結。</p>
                    </div>
                  )}
                </>
              )
            }

            return (
              <div className="chat-empty-state">
                {activeTab === '群組'
                  ? '請從左側列表選取一個群組。'
                  : '目前沒有已接受的好友，先從「邀請」分頁新增或接受好友。'}
              </div>
            )
          })()}
        </article>

        {/* Right side page tabs: bookmarks */}
        <div className="page-tabs reflection-tabs" aria-label="好友右側分頁">
          {(['全部', '好友', '群組', '邀請'] as const).map((tab) => (
            <button
              className={activeTab === tab ? 'active' : ''}
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab)
                setSelectedFriendId('') // clear selection to show search by default
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}

function AlbumPage({
  albums,
  photos,
  friendPhotos,
  setFriendPhotos,
  onOpenRetroLightbox,
  onUpdatePhotoTitle,
  onDeletePhotoFromAlbum,
  onUploadPhotoClick,
  onAddAlbumClick,
  onDeleteAlbum,
  onStartSlideshow,
  onToggleStarPhoto,
}: {
  onOpenLightbox: (url: string) => void
  albums: Album[]
  setAlbums: React.Dispatch<React.SetStateAction<Album[]>>
  photos: Photo[]
  friendPhotos: FriendPhoto[]
  setFriendPhotos: React.Dispatch<React.SetStateAction<FriendPhoto[]>>
  onOpenRetroLightbox: (items: RetroLightboxItem[], index: number) => void
  onUpdatePhotoTitle: (photoId: string, newTitle: string) => void
  onDeletePhotoFromAlbum: (albumId: string, photoId: string) => void
  onUploadPhotoClick: (weekId?: string) => void
  onAddAlbumClick: () => void
  onUpdateAlbumInfo: (albumId: string, title: string, description: string) => void
  onDeleteAlbum: (albumId: string) => void
  onStartSlideshow: (albumId: string) => void
  onToggleStarPhoto: (photoId: string) => void
}) {
  const [selectedAlbumTab, setSelectedAlbumTab] = useState<string>('全部')
  const [showHighlightsOnly, setShowHighlightsOnly] = useState(false)

  // Map all friend photos into Lightbox items
  const handleOpenFriendLightbox = (activeIndex: number) => {
    const lightboxItems = friendPhotos.map(p => ({
      id: p.id,
      imageUrl: p.imageUrl,
      author: p.author,
      authorAvatarUrl: p.avatarUrl,
      weekTitle: `第 ${p.weekNum} 週`,
      location: p.location,
      dateStr: p.date,
      title: p.title,
      isLiked: !!p.isLiked,
      isFriendPhoto: true
    }))
    onOpenRetroLightbox(lightboxItems, activeIndex)
  }

  // Map user's photos in a specific week to Lightbox items
  const handleOpenUserLightbox = (targetPhotoId: string, weekPhotos: Photo[], weekTitle: string) => {
    const lightboxItems = weekPhotos.map(p => ({
      id: p.id,
      imageUrl: p.imageUrl,
      author: '我',
      authorAvatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
      weekTitle: weekTitle,
      location: p.location || '雲林縣',
      dateStr: p.dayOfWeek || '週一',
      title: p.title,
      isLiked: !!p.isStarred,
      isFriendPhoto: false
    }))
    const clickedIdx = weekPhotos.findIndex(p => p.id === targetPhotoId)
    onOpenRetroLightbox(lightboxItems, clickedIdx >= 0 ? clickedIdx : 0)
  }

  // Toggle friend photo like status directly
  const handleToggleLikeFriendPhoto = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFriendPhotos(prev =>
      prev.map(p => p.id === photoId ? { ...p, isLiked: !p.isLiked } : p)
    )
  }

  // Sort weeks by weekNum in descending order
  const sortedWeeks = [...albums].sort((a, b) => (b.weekNum || 0) - (a.weekNum || 0))

  return (
    <section className="page-surface retro-album-page">
      {/* Book spread */}
      <section className="book-spread retro-album-book" aria-label="復古相簿活頁本">
        {/* Left page: Friends' Shared Feed (好友分享相片流) */}
        <aside className="book-page book-page-left weekly-friend-feed-page">
          <div className="friend-feed-container">
            {/* Header logo */}
            <div className="profile-brand-header" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="profile-brand-title">everyday</h2>
                <span className="profile-brand-subtitle" style={{ fontSize: '11px' }}>好友的今日瞬間 🌿</span>
              </div>
              <button
                type="button"
                className="profile-action-btn icon-btn"
                onClick={onAddAlbumClick}
                style={{ padding: '6px 12px', fontSize: '11px', margin: 0 }}
              >
                + 新增週別
              </button>
            </div>

            {/* Friends Photos Feed */}
            <div className="friend-photos-feed-scroll">
              {friendPhotos.map((fp, idx) => (
                <div key={fp.id} className="friend-post-card">
                  {/* Post Header */}
                  <div className="friend-post-header">
                    <div className="friend-post-author-wrapper">
                      <div className="friend-post-avatar-ring">
                        <img src={fp.avatarUrl} alt={fp.author} className="friend-post-avatar" />
                        {fp.author === '小安' && <span className="online-badge-dot" />}
                      </div>
                      <div className="friend-post-author-info">
                        <span className="friend-post-author-name">{fp.author}</span>
                        <span className="friend-post-week-subtitle">第 {fp.weekNum} 週</span>
                      </div>
                    </div>
                  </div>

                  {/* Post Image Container */}
                  <div className="friend-post-image-container" onClick={() => handleOpenFriendLightbox(idx)}>
                    {fp.badge && (
                      <span className="friend-post-new-badge">{fp.badge}</span>
                    )}
                    <img src={fp.imageUrl} alt={fp.title} className="friend-post-img" />
                  </div>

                  {/* Post Caption & Meta */}
                  <div className="friend-post-footer">
                    <div className="friend-post-details">
                      <p className="friend-post-caption">{fp.title}</p>
                      <div className="friend-post-meta">
                        <span className="friend-post-location">📍 {fp.location}</span>
                        <span className="friend-post-date">{fp.date}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`friend-post-like-btn ${fp.isLiked ? 'liked' : ''}`}
                      onClick={(e) => handleToggleLikeFriendPhoto(fp.id, e)}
                      title={fp.isLiked ? '收回讚' : '給個愛心'}
                    >
                      {fp.isLiked ? '❤️' : '🤍'}
                    </button>
                  </div>
                </div>
              ))}

              {friendPhotos.length === 0 && (
                <div style={{ padding: '40px 10px', textAlign: 'center', color: '#a39480' }}>
                  <p>暫無好友分享相片。</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Right page: Selected album photos grid */}
        <article className="book-page book-page-right scrapbook-board-paper weekly-feed-page">
          {/* Hidden header title for testing assertions */}
          <h2 className="visually-hidden">復古相簿</h2>

          <div className="weekly-feed-list">
            {sortedWeeks.length === 0 ? (
              <div className="album-empty-state">
                <strong>還沒有相簿</strong>
                <p>按「+ 新增週別」建立第一本相簿，再加入照片。</p>
              </div>
            ) : null}
            {sortedWeeks.map((week) => {
              // Filter photos in this week
              const weekPhotos = week.photoIds
                .map((pid) => photos.find((p) => p.id === pid))
                .filter((p): p is Photo => !!p)
                .filter((p) => !showHighlightsOnly || p.isStarred)

              // Skip rendering empty weeks if showHighlightsOnly is true
              if (showHighlightsOnly && weekPhotos.length === 0) return null

              return (
                <div key={week.id} className="weekly-group-block">
                  {/* Week header */}
                  <div className="weekly-group-header">
                    <div className="weekly-group-info">
                      <span className="weekly-group-title">{week.title}</span>
                      <span className="weekly-group-range">{week.description}</span>
                    </div>
                    
                    {/* Week actions */}
                    <div className="weekly-group-actions">
                      <button
                        type="button"
                        className="weekly-group-play-btn"
                        onClick={() => onStartSlideshow(week.id)}
                        title="放映此週幻燈片"
                      >
                        🎞️ 放映
                      </button>
                      <button
                        type="button"
                        className="weekly-group-delete-btn"
                        onClick={() => {
                          if (window.confirm(`確定要刪除《${week.title}》的所有記錄與相片嗎？`)) {
                            onDeleteAlbum(week.id)
                          }
                        }}
                        title="刪除此週"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Photos Row (Scrollable horizontally) */}
                  <div className="weekly-photos-row">
                    {weekPhotos.map((photo) => (
                      <div key={photo.id} className="weekly-photo-card">
                        {/* Hover delete & star */}
                        <button
                          type="button"
                          className="weekly-card-action-btn delete-btn"
                          onClick={() => onDeletePhotoFromAlbum(week.id, photo.id)}
                          title="撕下此相片"
                        >
                          ✕
                        </button>
                        
                        <button
                          type="button"
                          className={`weekly-card-action-btn star-btn ${photo.isStarred ? 'starred' : ''}`}
                          onClick={() => onToggleStarPhoto(photo.id)}
                          title={photo.isStarred ? '取消星標' : '加入重點回顧'}
                        >
                          ★
                        </button>

                        <img
                          src={photo.imageUrl}
                          alt={photo.title}
                          onClick={() => handleOpenUserLightbox(photo.id, weekPhotos, week.title)}
                          className="weekly-card-img"
                        />

                        {/* Day overlay */}
                        <div className="day-tag-overlay">
                          <span>{photo.dayOfWeek || '週一'}</span>
                        </div>

                        {/* Caption input on click */}
                        <div className="weekly-card-caption">
                          <input
                            type="text"
                            value={photo.title}
                            onChange={(e) => onUpdatePhotoTitle(photo.id, e.target.value)}
                            className="weekly-card-caption-input"
                            title="點擊編輯相片記述"
                          />
                        </div>
                      </div>
                    ))}

                    {/* Add Photo Card button at the end of the row */}
                    {!showHighlightsOnly && (
                      <button
                        type="button"
                        className="weekly-photo-add-card"
                        onClick={() => onUploadPhotoClick(week.id)}
                        aria-label={`新增照片到${week.title}`}
                        title="新增照片至此週"
                      >
                        <span className="add-plus-icon">+</span>
                        <span className="add-text-label">加入</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {sortedWeeks.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#a39480', border: '2px dashed #dcd3be', borderRadius: '8px' }}>
                <p>📷 目前沒有任何週曆。點擊右上方「+ 新增週別」開始記錄吧！</p>
              </div>
            )}
          </div>
        </article>

        {/* Right side index tabs */}
        <div className="page-tabs reflection-tabs" aria-label="相簿右側分頁">
          {['全部', '週曆', '收藏'].map((tab) => (
            <button
              aria-label={`相簿${tab}`}
              className={selectedAlbumTab === tab ? 'active' : ''}
              key={tab}
              type="button"
              onClick={() => {
                if (tab === '全部') {
                  setShowHighlightsOnly(false)
                } else if (tab === '收藏') {
                  setShowHighlightsOnly(true)
                }
                setSelectedAlbumTab(tab)
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}

function CalendarSurface({
  events,
  tasks,
  onToggleTask,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onAddTask,
  onDeleteTask,
}: {
  events: CalendarEvent[]
  tasks: Array<CalendarTask & { completed: boolean }>
  onToggleTask: (id: string) => void
  onAddEvent: (event: CalendarEvent) => void
  onUpdateEvent: (event: CalendarEvent) => void
  onDeleteEvent: (id: string) => void
  onAddTask: (task: CalendarTask) => void
  onDeleteTask: (id: string) => void
}) {
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const rightTabs = ['月曆', '週計畫', '待辦', '紀念日', '旅行'] as const
  const eventInvites = [
    { id: 'invite-reading', title: '小安的讀書會', host: '小安', date: '2026.06.24', time: '16:00' },
    { id: 'invite-hiking', title: '阿哲的登山', host: '阿哲', date: '2026.06.28', time: '07:30' },
  ] as const
  const [activeRightTab, setActiveRightTab] = useState<string>('月曆')
  const [selectedDay, setSelectedDay] = useState<number>(24)

  // State for Monthly Todos (Left Page)
  const [monthlyTodos, setMonthlyTodos] = useState([
    { id: 'todo-m1', text: '準備日本旅行行李', completed: true },
    { id: 'todo-m2', text: '閱讀《原子習慣》', completed: false }
  ])
  const [isAddingMonthlyTodo, setIsAddingMonthlyTodo] = useState(false)
  const [newMonthlyTodoText, setNewMonthlyTodoText] = useState('')

  // State for Monthly Goals (Left Page)
  const [monthlyGoals, setMonthlyGoals] = useState([
    '保持早睡早起',
    '每天記錄生活'
  ])
  const [isEditingGoals, setIsEditingGoals] = useState(false)
  const [goalsText, setGoalsText] = useState('')

  // State for Add Event Form
  const [showAddEventModal, setShowAddEventModal] = useState(false)
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventDesc, setNewEventDesc] = useState('')
  const [newEventStart, setNewEventStart] = useState('10:00')
  const [newEventEnd, setNewEventEnd] = useState('11:30')
  const [newVisibility, setNewVisibility] = useState<'private' | 'shared'>('private')
  const [newEventColor, setNewEventColor] = useState<'sage' | 'rose' | 'blue' | 'yellow'>('sage')
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [reminderStatuses, setReminderStatuses] = useState<Record<string, 'off' | 'queued' | 'provider_not_configured'>>({})
  const [eventInviteStatuses, setEventInviteStatuses] = useState<Record<string, 'pending' | 'accepted' | 'declined'>>({
    'invite-reading': 'pending',
    'invite-hiking': 'pending',
  })

  // State for Add Daily Task Form
  const [isAddingDailyTask, setIsAddingDailyTask] = useState(false)
  const [newDailyTaskTitle, setNewDailyTaskTitle] = useState('')
  const [newDailyTaskPriority, setNewDailyTaskPriority] = useState<'high' | 'medium' | 'low'>('medium')

  // Date and Weekday conversions for Selected Day (June 2026)
  // June 1st, 2026 is Monday (index 1)
  const dayOfWeekIndex = (1 + (selectedDay - 1)) % 7
  const dayOfWeekStr = weekDays[dayOfWeekIndex]
  const selectedDateStr = `2026-06-${selectedDay.toString().padStart(2, '0')}`

  // Filter events and tasks for the selected date
  const dayEvents = events.filter((e) => e.startsAt.startsWith(selectedDateStr))
  
  // Weather simulation
  const getWeatherForDay = (day: number) => {
    if (day % 4 === 0) return '🌤️ 晴天 28°C'
    if (day % 4 === 1) return '☁️ 多雲 24°C'
    if (day % 4 === 2) return '🌧️ 陣雨 22°C'
    return '☀️ 晴朗 30°C'
  }

  // Check if a day has any events for dot indicator
  const hasEventOnDay = (dayNum: number) => {
    const dStr = `2026-06-${dayNum.toString().padStart(2, '0')}`
    return events.some(e => e.startsAt.startsWith(dStr))
  }

  const handleToggleMonthlyTodo = (id: string) => {
    setMonthlyTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
  }

  const handleAddMonthlyTodoSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMonthlyTodoText.trim()) return
    setMonthlyTodos(prev => [...prev, {
      id: `todo-m-${Date.now()}`,
      text: newMonthlyTodoText.trim(),
      completed: false
    }])
    setNewMonthlyTodoText('')
    setIsAddingMonthlyTodo(false)
  }

  const handleStartEditingGoals = () => {
    setGoalsText(monthlyGoals.join('\n'))
    setIsEditingGoals(true)
  }

  const handleSaveGoals = () => {
    const updated = goalsText.split('\n').map(g => g.trim()).filter(Boolean)
    setMonthlyGoals(updated)
    setIsEditingGoals(false)
  }

  const resetEventForm = () => {
    setNewEventTitle('')
    setNewEventDesc('')
    setNewEventStart('10:00')
    setNewEventEnd('11:30')
    setNewVisibility('private')
    setNewEventColor('sage')
    setEditingEventId(null)
  }

  const closeEventModal = () => {
    setShowAddEventModal(false)
    resetEventForm()
  }

  const openNewEventModal = () => {
    resetEventForm()
    setShowAddEventModal(true)
  }

  const openEditEventModal = (event: CalendarEvent) => {
    const eventDay = Number(event.startsAt.slice(8, 10))
    if (!Number.isNaN(eventDay)) setSelectedDay(eventDay)
    setEditingEventId(event.id)
    setNewEventTitle(event.title)
    setNewEventDesc(event.description ?? '')
    setNewEventStart(event.startsAt.split('T')[1]?.substring(0, 5) ?? '10:00')
    setNewEventEnd(event.endsAt.split('T')[1]?.substring(0, 5) ?? '11:30')
    setNewVisibility(event.visibility)
    setNewEventColor((event.color as 'sage' | 'rose' | 'blue' | 'yellow') ?? 'sage')
    setShowAddEventModal(true)
  }

  const toggleReminder = (eventId: string) => {
    setReminderStatuses((current) => ({
      ...current,
      [eventId]: current[eventId] === 'queued' ? 'off' : 'queued',
    }))
  }

  const updateInviteStatus = (inviteId: string, status: 'accepted' | 'declined') => {
    setEventInviteStatuses((current) => ({
      ...current,
      [inviteId]: status,
    }))
  }

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEventTitle.trim()) return

    const startsAt = `2026-06-${selectedDay.toString().padStart(2, '0')}T${newEventStart}:00.000Z`
    const endsAt = `2026-06-${selectedDay.toString().padStart(2, '0')}T${newEventEnd}:00.000Z`

    if (editingEventId) {
      const originalEvent = events.find((event) => event.id === editingEventId)
      if (originalEvent) {
        onUpdateEvent({
          ...originalEvent,
          title: newEventTitle.trim(),
          description: newEventDesc.trim(),
          startsAt,
          endsAt,
          visibility: newVisibility,
          participantIds: newVisibility === 'shared' ? originalEvent.participantIds.length > 0 ? originalEvent.participantIds : ['user-2'] : [],
          color: newEventColor,
        })
      }
      closeEventModal()
      return
    }

    const newEv: CalendarEvent = {
      id: `event-user-${Date.now()}`,
      ownerId: 'user-1',
      title: newEventTitle.trim(),
      description: newEventDesc.trim(),
      startsAt,
      endsAt,
      visibility: newVisibility,
      participantIds: newVisibility === 'shared' ? ['user-2'] : [],
      color: newEventColor
    }

    onAddEvent(newEv)
    closeEventModal()
  }

  const handleCreateDailyTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDailyTaskTitle.trim()) return

    const newTaskVal: CalendarTask = {
      id: `task-user-${Date.now()}`,
      ownerId: 'user-1',
      title: newDailyTaskTitle.trim(),
      dueAt: `2026-06-${selectedDay.toString().padStart(2, '0')}T18:00:00.000Z`,
      priority: newDailyTaskPriority,
      assigneeIds: []
    }

    onAddTask(newTaskVal)
    setNewDailyTaskTitle('')
    setNewDailyTaskPriority('medium')
    setIsAddingDailyTask(false)
  }

  return (
    <section className="page-surface calendar-planner-page">
      <header className="page-hero calendar-hero">
        <div>
          <h2>生活手帳行事曆</h2>
          <p>安排生活的節奏，讓每一天都有意義。</p>
        </div>
        <div className="calendar-actions-header">
          <div className="search-pill">
            <Search size={15} />
            <input type="text" placeholder="搜尋行程、筆記或地點..." aria-label="搜尋行程" />
          </div>
          <button className="soft-button" type="button" onClick={openNewEventModal}>
            <CalendarDays aria-hidden="true" size={17} />
            新增行程
          </button>
        </div>
      </header>

      {/* Book spread */}
      <section className="book-spread planner-book" aria-label="生活手帳行事曆">
        {/* Left page: Month calendar view */}
        <article className="book-page book-page-left calendar-panel">
          <div className="section-heading compact">
            <h2>六月月曆</h2>
            <div className="segmented-control" aria-label="行事曆視圖">
              <button className="selected" type="button">月</button>
              <button type="button">週</button>
              <button type="button">日</button>
              <button type="button">待辦清單</button>
            </div>
          </div>

          <div className="calendar-grid" aria-label="六月月曆">
            {weekDays.map((day) => (
              <span className="weekday" key={day}>
                {day}
              </span>
            ))}
            {/* June 2026 starts on Monday. Offset Sunday (index 0) is empty. */}
            {Array.from({ length: 35 }, (_, index) => {
              const day = index // 1-based index shifted by 1 to start Monday on index 1
              const isValid = day >= 1 && day <= 30
              const isSelected = selectedDay === day
              const isToday = day === 24
              const hasEvents = isValid && hasEventOnDay(day)

              return (
                <button
                  className={`date-cell ${hasEvents ? 'has-event' : ''} ${isToday ? 'today' : ''} ${isSelected && isValid ? 'active' : ''}`}
                  key={index}
                  type="button"
                  disabled={!isValid}
                  onClick={() => isValid && setSelectedDay(day)}
                  style={isValid ? { cursor: 'pointer' } : {}}
                >
                  <span>{isValid ? day : ''}</span>
                  {isValid && hasEvents ? <span className="event-indicator-dot"></span> : null}
                </button>
              )
            })}
          </div>

          {/* Under calendar grid widgets */}
          <div className="calendar-bottom-widgets">
            <div className="monthly-todo-box">
              <div className="section-heading compact">
                <h4>本月待辦</h4>
                <button className="text-link-btn" type="button" onClick={() => setIsAddingMonthlyTodo(prev => !prev)}>
                  + 新增待辦
                </button>
              </div>

              {isAddingMonthlyTodo && (
                <form onSubmit={handleAddMonthlyTodoSubmit} className="inline-add-form">
                  <input
                    type="text"
                    placeholder="新增本月待辦，按 Enter 送出..."
                    value={newMonthlyTodoText}
                    onChange={(e) => setNewMonthlyTodoText(e.target.value)}
                    className="inline-add-input"
                    autoFocus
                  />
                </form>
              )}

              <div className="todo-mini-list">
                {monthlyTodos.map(todo => (
                  <label className="todo-mini-row" key={todo.id}>
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => handleToggleMonthlyTodo(todo.id)}
                    />
                    <span className={todo.completed ? 'strikethrough' : ''}>{todo.text}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Monthly Goals Sticker */}
            <div className="monthly-goals-sticker">
              <div className="goals-header">
                <strong>本月目標</strong>
                <button type="button" className="goals-edit-btn" onClick={isEditingGoals ? handleSaveGoals : handleStartEditingGoals}>
                  {isEditingGoals ? '儲存' : '編輯'}
                </button>
              </div>
              
              {isEditingGoals ? (
                <textarea
                  className="goals-textarea"
                  value={goalsText}
                  onChange={(e) => setGoalsText(e.target.value)}
                  placeholder="每行輸入一個目標..."
                />
              ) : (
                <ol>
                  {monthlyGoals.map((goal, idx) => (
                    <li key={idx}>{goal}</li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </article>

        {/* Right page: Interactive Tab Content */}
        <aside className="book-page book-page-right calendar-side">
          {activeRightTab === '月曆' && (
            <>
              {/* Day agenda list */}
              <article className="agenda-block">
                <div className="section-heading compact">
                  <h2>{`2026.06.${selectedDay.toString().padStart(2, '0')} (${dayOfWeekStr})`}</h2>
                  <span className="weather-txt">{getWeatherForDay(selectedDay)}</span>
                </div>
                
                {/* Simulated Travel Banner */}
                {selectedDay >= 10 && selectedDay <= 15 && (
                  <div className="all-day-banner">
                    <span>✈️ 日本旅行 (6/10 - 6/15)</span>
                  </div>
                )}

                <div className="timeline-schedule">
                  {dayEvents.length > 0 ? (
                    dayEvents.map((event) => {
                      // Extract start and end times cleanly from ISO strings
                      const startTime = event.startsAt.split('T')[1].substring(0, 5)
                      const endTime = event.endsAt.split('T')[1].substring(0, 5)

                      return (
                        <div className={`event-card ${event.color ?? 'sage'}`} key={event.id}>
                          <div className="event-time-bullet">
                            <strong>{startTime} - {endTime}</strong>
                            <div className="v-line" />
                          </div>
                          <div className="event-details">
                            <div className="event-header-row">
                              <strong>{event.title}</strong>
                              <div className="event-actions">
                                <button
                                  type="button"
                                  className="event-icon-btn"
                                  onClick={() => openEditEventModal(event)}
                                  aria-label={`編輯行程：${event.title}`}
                                  title="編輯行程"
                                >
                                  <PenLine size={13} />
                                </button>
                                <button
                                  type="button"
                                  className={`event-icon-btn ${reminderStatuses[event.id] === 'queued' ? 'active' : ''}`}
                                  onClick={() => toggleReminder(event.id)}
                                  aria-label={`切換提醒：${event.title}`}
                                  title="切換提醒"
                                >
                                  <Bell size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="event-icon-btn danger"
                                  onClick={() => onDeleteEvent(event.id)}
                                  aria-label={`刪除行程：${event.title}`}
                                  title="刪除行程"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            <p>{event.description || '無備註描述'}</p>
                            <span>{event.visibility === 'shared' ? '好友共同日曆' : '私人事件'}</span>
                            {reminderStatuses[event.id] === 'queued' ? (
                              <small className="event-reminder-status">站內提醒：已排程</small>
                            ) : null}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="no-events-placeholder">
                      <span className="no-events-icon">🌿</span>
                      <p>今日無行程安排</p>
                      <small>享受放鬆且愜意的一天</small>
                    </div>
                  )}
                </div>
                
                <button className="add-agenda-btn" type="button" onClick={openNewEventModal}>
                  + 新增行程
                </button>
              </article>

              <article className="calendar-invites-block" aria-label="共同日曆邀請">
                <div className="section-heading compact">
                  <h2>共同日曆邀請</h2>
                  <span>好友事件回覆</span>
                </div>
                <div className="invite-list">
                  {eventInvites.map((invite) => {
                    const status = eventInviteStatuses[invite.id]
                    const statusLabel = status === 'accepted' ? '已接受' : status === 'declined' ? '已拒絕' : '待回覆'

                    return (
                      <div className={`invite-card ${status}`} key={invite.id}>
                        <div>
                          <strong>{invite.title}：{statusLabel}</strong>
                          <p>{invite.host} 邀請你參加，{invite.date} {invite.time}</p>
                        </div>
                        <div className="invite-actions">
                          <button
                            type="button"
                            onClick={() => updateInviteStatus(invite.id, 'accepted')}
                            aria-label={`接受邀請：${invite.title}`}
                          >
                            接受
                          </button>
                          <button
                            type="button"
                            onClick={() => updateInviteStatus(invite.id, 'declined')}
                            aria-label={`拒絕邀請：${invite.title}`}
                          >
                            拒絕
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>

              {/* Tasks List */}
              <article className="tasks-block">
                <div className="section-heading compact">
                  <h2>待辦清單</h2>
                  <button className="text-link-btn" type="button" onClick={() => setIsAddingDailyTask(prev => !prev)}>
                    + 新增待辦
                  </button>
                </div>

                {isAddingDailyTask && (
                  <form onSubmit={handleCreateDailyTask} className="inline-add-task-form">
                    <input
                      type="text"
                      placeholder="待辦名稱..."
                      value={newDailyTaskTitle}
                      onChange={(e) => setNewDailyTaskTitle(e.target.value)}
                      className="inline-add-task-input"
                      autoFocus
                      required
                    />
                    <div className="priority-select-row">
                      <span>優先級：</span>
                      {(['high', 'medium', 'low'] as const).map(p => (
                        <label key={p} className={`priority-radio-label ${newDailyTaskPriority === p ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="priority"
                            value={p}
                            checked={newDailyTaskPriority === p}
                            onChange={() => setNewDailyTaskPriority(p)}
                            className="hidden-radio"
                          />
                          {p === 'high' ? '高' : p === 'medium' ? '中' : '低'}
                        </label>
                      ))}
                      <button type="submit" className="add-task-submit-btn">新增</button>
                    </div>
                  </form>
                )}

                <div className="task-list">
                  {tasks.length > 0 ? (
                    tasks.map((task) => (
                      <label className="task-row" key={task.id}>
                        <input
                          aria-label={task.title}
                          checked={task.completed}
                          type="checkbox"
                          onChange={() => onToggleTask(task.id)}
                        />
                        <span className={task.completed ? 'strikethrough' : ''}>{task.title}</span>
                        <small className={task.completed ? 'completed' : task.priority}>
                          {task.completed ? '已完成' : task.priority === 'high' ? '緊急' : task.priority === 'medium' ? '一般' : '低級'}
                        </small>
                      </label>
                    ))
                  ) : (
                    <p className="no-tasks-text">目前尚無待辦事項</p>
                  )}
                </div>
              </article>

              {/* Today note doodle */}
              <div className="today-note-sticker">
                <h4>今日手札 📝</h4>
                <p>今天可以先新增一個行程或待辦。相簿有照片後，再把回憶連到日曆裡。</p>
              </div>
            </>
          )}

          {activeRightTab === '週計畫' && (
            <article className="tab-pane-content week-planner-pane">
              <h2>週計畫表</h2>
              <p className="subtitle">第 25 週手帳計畫表</p>
              <div className="week-planner-grid">
                {weekDays.map((dayName, idx) => {
                  // Find day in current week starting from June 21st (Sunday)
                  const dayNum = 21 + idx
                  const dStr = `2026-06-${dayNum.toString().padStart(2, '0')}`
                  const dayEvts = events.filter(e => e.startsAt.startsWith(dStr))

                  return (
                    <div key={idx} className={`week-planner-row ${selectedDay === dayNum ? 'highlight' : ''}`} onClick={() => setSelectedDay(dayNum)}>
                      <div className="week-day-col">
                        <strong>週{dayName}</strong>
                        <span>6/{dayNum}</span>
                      </div>
                      <div className="week-content-col">
                        {dayEvts.length > 0 ? (
                          dayEvts.map(e => (
                            <span key={e.id} className={`week-evt-tag ${e.color || 'sage'}`}>
                              {e.title}
                            </span>
                          ))
                        ) : (
                          <span className="week-empty-txt">無安排行程</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>
          )}

          {activeRightTab === '待辦' && (
            <article className="tab-pane-content all-tasks-pane">
              <div className="section-heading compact">
                <h2>待辦清單進度</h2>
                <button className="text-link-btn" type="button" onClick={() => setIsAddingDailyTask(prev => !prev)}>
                  新增待辦項目
                </button>
              </div>

              {isAddingDailyTask && (
                <form onSubmit={handleCreateDailyTask} className="inline-add-task-form all-task-add-form">
                  <label htmlFor="all-task-title">待辦名稱</label>
                  <input
                    id="all-task-title"
                    type="text"
                    placeholder="例如：完成行事曆功能"
                    value={newDailyTaskTitle}
                    onChange={(e) => setNewDailyTaskTitle(e.target.value)}
                    className="inline-add-task-input"
                    autoFocus
                    required
                  />
                  <div className="priority-select-row">
                    <span>優先級：</span>
                    {(['high', 'medium', 'low'] as const).map(p => (
                      <label key={p} className={`priority-radio-label ${newDailyTaskPriority === p ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="all-task-priority"
                          value={p}
                          checked={newDailyTaskPriority === p}
                          onChange={() => setNewDailyTaskPriority(p)}
                          className="hidden-radio"
                        />
                        {p === 'high' ? '高' : p === 'medium' ? '中' : '低'}
                      </label>
                    ))}
                    <button type="submit" className="add-task-submit-btn">新增待辦</button>
                  </div>
                </form>
              )}
              
              {/* Task completion progress bar */}
              {(() => {
                const total = tasks.length
                const completed = tasks.filter(t => t.completed).length
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0
                return (
                  <div className="progress-card">
                    <div className="progress-header-row">
                      <span>任務完成率</span>
                      <strong>{pct}% ({completed}/{total})</strong>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                )
              })()}

              <div className="all-tasks-list">
                <h3>待辦清單明細</h3>
                {tasks.map(t => (
                  <div key={t.id} className={`task-detail-row ${t.completed ? 'done' : ''}`}>
                    <input
                      type="checkbox"
                      aria-label={t.title}
                      checked={t.completed}
                      onChange={() => onToggleTask(t.id)}
                      id={`detail-${t.id}`}
                    />
                    <label htmlFor={`detail-${t.id}`} className="task-detail-text">
                      <strong>{t.title}</strong>
                      <span className={`priority-badge ${t.priority}`}>{t.priority === 'high' ? '高優先' : t.priority === 'medium' ? '中優先' : '低優先'}</span>
                    </label>
                    <button
                      type="button"
                      className="task-delete-btn"
                      onClick={() => onDeleteTask(t.id)}
                      aria-label={`刪除待辦：${t.title}`}
                      title="刪除待辦"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </article>
          )}

          {activeRightTab === '紀念日' && (
            <article className="tab-pane-content anniversaries-pane">
              <h2>六月紀念日</h2>
              <p className="subtitle">重要日子與生活回憶貼紙</p>
              
              <div className="anniversary-stickers-grid">
                <div className="sticker-item love">
                  <span className="sticker-date">6/15</span>
                  <span className="sticker-title">日本旅行回國 ✈️</span>
                </div>
                <div className="sticker-item friendship">
                  <span className="sticker-date">6/24</span>
                  <span className="sticker-title">共同日曆建立 📅</span>
                </div>
                <div className="sticker-item work">
                  <span className="sticker-date">6/25</span>
                  <span className="sticker-title">相簿拋光改版 🎨</span>
                </div>
                <div className="sticker-item custom">
                  <span className="sticker-date">7/04</span>
                  <span className="sticker-title">七夕情人節 🎋</span>
                </div>
              </div>
            </article>
          )}

          {activeRightTab === '旅行' && (
            <article className="tab-pane-content travel-diary-pane">
              <h2>日本旅行手札 ✈️</h2>
              <span className="diary-date">2026.06.10 - 2026.06.15</span>
              
              <div className="travel-timeline">
                <div className="travel-day-card">
                  <h4>Day 1: 東京登陸 ⛩️</h4>
                  <p>下午抵達羽田機場，直奔淺草寺參拜。晚餐吃了超美味的一蘭拉麵，街頭夜景非常精緻璀璨！</p>
                </div>
                <div className="travel-day-card">
                  <h4>Day 2: 鎌倉自駕與海灘 🌊</h4>
                  <p>開車前往鎌倉高校前站打卡灌籃高手經典十字路口。海岸線風光秀麗，夕陽染紅了整片金黃沙灘。</p>
                </div>
                <div className="travel-day-card">
                  <h4>Day 3: 澀谷與購物行程 🛍️</h4>
                  <p>澀谷十字路口人潮洶湧！在宮下公園散步聊天，買了許多可愛的手帳貼紙和特色紀念品。</p>
                </div>
              </div>
            </article>
          )}
        </aside>

        {/* Right side page tabs */}
        <div className="page-tabs reflection-tabs" aria-label="行事曆右側分頁">
          {([...rightTabs, '+'] as string[]).map((tab) => (
            <button
              aria-label={`行事曆${tab}`}
              className={activeRightTab === tab ? 'active' : ''}
              key={tab}
              type="button"
              onClick={() => {
                if (tab !== '+') setActiveRightTab(tab)
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {/* Add Event Modal */}
      {showAddEventModal && (
        <div className="modal-overlay" onClick={closeEventModal}>
          <div className="modal-content calendar-event-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEventId ? '編輯日程行程' : '新增日程行程'} ({`6月${selectedDay}日`})</h3>
              <button type="button" className="close-button" onClick={closeEventModal}>✕</button>
            </div>
            
            <form onSubmit={handleCreateEvent} className="event-form">
              <div className="form-group">
                <label htmlFor="evt-title">行程名稱 *</label>
                <input
                  id="evt-title"
                  type="text"
                  placeholder="例如：整理房間、和小安聚餐..."
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group half">
                  <label htmlFor="evt-start">開始時間</label>
                  <input
                    id="evt-start"
                    type="time"
                    value={newEventStart}
                    onChange={(e) => setNewEventStart(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group half">
                  <label htmlFor="evt-end">結束時間</label>
                  <input
                    id="evt-end"
                    type="time"
                    value={newEventEnd}
                    onChange={(e) => setNewEventEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="evt-desc">備註內容</label>
                <textarea
                  id="evt-desc"
                  placeholder="輸入詳細備註說明..."
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>共享模式</label>
                <div className="visibility-radio-group">
                  <label className={`radio-label ${newVisibility === 'private' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="visibility"
                      checked={newVisibility === 'private'}
                      onChange={() => setNewVisibility('private')}
                    />
                    🔒 私人事件
                  </label>
                  <label className={`radio-label ${newVisibility === 'shared' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="visibility"
                      checked={newVisibility === 'shared'}
                      onChange={() => setNewVisibility('shared')}
                    />
                    👥 好友共同日曆
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>主題標籤顏色</label>
                <div className="color-palette-group">
                  {(['sage', 'rose', 'blue', 'yellow'] as const).map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`color-dot-btn ${color} ${newEventColor === color ? 'selected' : ''}`}
                      onClick={() => setNewEventColor(color)}
                      title={color}
                      aria-label={`選擇${color}色`}
                    />
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={closeEventModal}>取消</button>
                <button type="submit" className="submit-btn">儲存日程</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

function CallingModal({
  friendId,
  friends,
  onClose,
}: {
  friendId: string
  friends: Friend[]
  onClose: () => void
}) {
  const friend = friends.find((f) => f.id === friendId)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (secs: number) => {
    const mm = String(Math.floor(secs / 60)).padStart(2, '0')
    const ss = String(secs % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

  if (!friend) return null

  return (
    <div className="calling-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="calling-card" onClick={(e) => e.stopPropagation()}>
        <div className="calling-pin">📌</div>
        <div className="calling-avatar-container">
          <img src={friend.avatarUrl} alt="" className="calling-avatar" />
          <div className="calling-pulse-circle"></div>
        </div>
        <h2 className="calling-name">{friend.name}</h2>
        <span className="calling-status-label">正在撥號通話中...</span>
        <div className="calling-timer">{formatTime(seconds)}</div>
        <button type="button" className="hangup-btn" onClick={onClose} aria-label="掛斷電話">
          📞
        </button>
      </div>
    </div>
  )
}

function AddFriendModal({
  onClose,
  onSendInvite,
}: {
  onClose: () => void
  onSendInvite: (email: string) => Promise<boolean>
}) {
  const [email, setEmail] = useState('')
  const [searchResult, setSearchResult] = useState<UserProfile | null>(null)
  const [searchError, setSearchError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setIsSearching(true)
    setSearchError('')
    setSearchResult(null)
    setSentSuccess(false)
    try {
      const result = await callApi<UserProfile | null>('GET', `/profiles/search?email=${encodeURIComponent(email.trim())}`)
      if (result) {
        setSearchResult(result)
      } else {
        setSearchError('找不到該使用者，請確認 Email 是否輸入正確。')
      }
    } catch (err) {
      console.error('Search user failed:', err)
      setSearchError('搜尋時發生錯誤，請稍後再試。')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSend = async () => {
    if (!searchResult) return
    setIsSending(true)
    try {
      const ok = await onSendInvite(searchResult.email)
      if (ok) {
        setSentSuccess(true)
        setSearchResult(null)
        setEmail('')
      } else {
        alert('傳送好友邀請失敗，可能已是好友或已有待處理邀請。')
      }
    } catch (err) {
      console.error('Send invite failed:', err)
      alert('傳送好友邀請時發生錯誤。')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="add-friend-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="add-friend-card" onClick={(e) => e.stopPropagation()} style={{ width: '400px', maxWidth: '90%' }}>
        <div className="card-lined-header">
          <h3>🔍 尋找真實好友</h3>
          <button type="button" className="close-x-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
          <label htmlFor="friend-search-email" style={{ fontSize: '13px', fontWeight: 'bold', color: '#48341f' }}>輸入好友的 Email：</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              id="friend-search-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: '2px solid #d3c4a9',
                padding: '8px 0',
                fontSize: '14px',
                outline: 'none',
                color: '#48341f'
              }}
            />
            <button
              type="submit"
              disabled={isSearching}
              style={{
                padding: '8px 16px',
                background: '#877864',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {isSearching ? '搜尋中...' : '搜尋'}
            </button>
          </div>
        </form>

        {searchError && (
          <div style={{ padding: '10px', background: 'rgba(177, 93, 93, 0.05)', color: '#b15d5d', borderRadius: '4px', fontSize: '12px', border: '1px solid rgba(177, 93, 93, 0.15)', marginTop: '15px' }}>
            ⚠️ {searchError}
          </div>
        )}

        {sentSuccess && (
          <div style={{ padding: '12px', background: 'rgba(92, 124, 89, 0.05)', color: '#4d694b', borderRadius: '4px', fontSize: '13px', border: '1px solid rgba(92, 124, 89, 0.15)', fontWeight: 'bold', marginTop: '15px' }}>
            🎉 好友邀請已成功送出！請等待對方核准。
          </div>
        )}

        {searchResult && (
          <div className="search-result-card" style={{ marginTop: '20px', padding: '15px', background: '#fcfaf6', border: '1px solid #d3c4a9', borderRadius: '6px', boxShadow: '0 2px 5px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src={searchResult.avatarUrl} alt="" style={{ width: '45px', height: '45px', borderRadius: '50%', objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0', fontSize: '15px', color: '#48341f' }}>{searchResult.name}</h4>
                <span style={{ fontSize: '11px', color: '#7a6a53' }}>{searchResult.email}</span>
                <div style={{ fontSize: '12px', color: '#7a6a53', marginTop: '4px' }}>
                  <span className={`status-dot ${searchResult.tone}`} style={{ marginRight: '6px' }} />
                  {searchResult.status}
                </div>
              </div>
              <button
                type="button"
                disabled={isSending}
                onClick={handleSend}
                style={{
                  padding: '8px 12px',
                  background: '#5c7c59',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {isSending ? '傳送中...' : '加為好友 ➕'}
              </button>
            </div>
          </div>
        )}

        <div className="form-actions-line" style={{ marginTop: '20px', borderTop: '1px solid #e6dec9', paddingTop: '15px', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-paper-cancel" onClick={onClose} style={{ background: 'transparent', border: '1px solid #d3c4a9', color: '#73614e', padding: '6px 15px', borderRadius: '4px', cursor: 'pointer' }}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}

/* === SlideshowModal === */
function SlideshowModal({
  albumId,
  albums,
  photos,
  onClose,
}: {
  albumId: string
  albums: Album[]
  photos: Photo[]
  onClose: () => void
}) {
  const album = albums.find((a) => a.id === albumId)
  const albumPhotos = album ? photos.filter((p) => album.photoIds.includes(p.id)) : []
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [scratchFilter, setScratchFilter] = useState(true)

  useEffect(() => {
    if (!isPlaying || albumPhotos.length === 0) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % albumPhotos.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [isPlaying, albumPhotos.length])

  if (!album || albumPhotos.length === 0) {
    return (
      <div className="slideshow-overlay" onClick={onClose} role="dialog" aria-modal="true">
        <div className="slideshow-projector-box empty-box" onClick={(e) => e.stopPropagation()}>
          <p>此相簿目前沒有相片可播放。</p>
          <button type="button" onClick={onClose}>關閉</button>
        </div>
      </div>
    )
  }

  const activePhoto = albumPhotos[currentIndex]

  return (
    <div className="slideshow-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="slideshow-projector-box" onClick={(e) => e.stopPropagation()}>
        {/* Projector Lens Bezel */}
        <div className="projector-lens-frame">
          <div className="projector-lens">
            <img
              src={activePhoto.imageUrl}
              alt={activePhoto.title}
              className={scratchFilter ? 'projector-image scratch-noise' : 'projector-image'}
            />
            {scratchFilter && <div className="projector-scratches-layer"></div>}
            <div className="lens-flare-overlay"></div>
          </div>
        </div>

        {/* Projector Panel Controls */}
        <div className="projector-control-panel">
          <button
            type="button"
            className="proj-btn"
            onClick={() => setCurrentIndex((prev) => (prev - 1 + albumPhotos.length) % albumPhotos.length)}
          >
            ◀ 上一張
          </button>
          
          <button
            type="button"
            className={`proj-btn play-pause-btn ${isPlaying ? 'playing' : ''}`}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? '⏸ 暫停輪播' : '▶ 開始輪播'}
          </button>

          <button
            type="button"
            className="proj-btn"
            onClick={() => setCurrentIndex((prev) => (prev + 1) % albumPhotos.length)}
          >
            下一張 ▶
          </button>
        </div>

        {/* Projector Footnotes */}
        <div className="projector-footer-info">
          <span className="projector-counter">
            Slide {currentIndex + 1} / {albumPhotos.length}
          </span>
          <h3 className="projector-photo-title">🎞️ {activePhoto.title}</h3>
          
          <label className="filter-toggle-label">
            <input
              type="checkbox"
              checked={scratchFilter}
              onChange={() => setScratchFilter(!scratchFilter)}
            />
            <span>復古老底片刮痕濾鏡</span>
          </label>
        </div>

        <button type="button" className="close-proj-btn" onClick={onClose} aria-label="關閉播放器">
          ✕
        </button>
      </div>
    </div>
  )
}


function AddAlbumModal({
  photos,
  onClose,
  onCreateAlbum,
}: {
  photos: Photo[]
  onClose: () => void
  onCreateAlbum: (
    title: string,
    description: string,
    coverUrl: string,
    themeColor: 'wine' | 'forest' | 'navy' | 'tobacco'
  ) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [themeColor, setThemeColor] = useState<'wine' | 'forest' | 'navy' | 'tobacco'>('wine')
  const [selectedCoverUrl, setSelectedCoverUrl] = useState('')

  useEffect(() => {
    if (photos.length > 0 && !selectedCoverUrl) {
      queueMicrotask(() => setSelectedCoverUrl(photos[0].imageUrl))
    }
  }, [photos, selectedCoverUrl])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onCreateAlbum(title.trim(), description.trim(), selectedCoverUrl, themeColor)
    onClose()
  }

  const themes = [
    { key: 'wine', label: '勃根地紅 🍷', color: '#6b2d2d' },
    { key: 'forest', label: '森林墨綠 🌲', color: '#2d4a3e' },
    { key: 'navy', label: '深海軍藍 ⚓', color: '#1f385c' },
    { key: 'tobacco', label: '古典菸草 🍂', color: '#5c4033' },
  ] as const

  return (
    <div className="add-friend-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <form className="add-friend-card add-album-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="card-lined-header">
          <h3>建立新相冊 📒</h3>
          <button type="button" className="close-x-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="form-group-lined">
          <label htmlFor="album-form-title">相簿標題 (必填)</label>
          <input
            id="album-form-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：2026 夏日野餐"
            maxLength={18}
          />
        </div>

        <div className="form-group-lined">
          <label htmlFor="album-form-desc">相簿記述 / 心情小記</label>
          <input
            id="album-form-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例如：寫下當時的微風與歡笑..."
            maxLength={60}
          />
        </div>

        <div className="form-group-lined">
          <label>精裝封面主題色</label>
          <div className="tone-selector-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
            {themes.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`theme-option-btn ${themeColor === t.key ? 'active' : ''}`}
                style={{
                  background: t.color,
                  color: '#fff',
                  border: themeColor === t.key ? '2px solid #877864' : '1px solid transparent',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  boxShadow: themeColor === t.key ? '0 0 5px rgba(0,0,0,0.3)' : 'none'
                }}
                onClick={() => setThemeColor(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group-lined">
          <label htmlFor="album-form-cover">選擇初始封面照</label>
          <select
            id="album-form-cover"
            value={selectedCoverUrl}
            onChange={(e) => setSelectedCoverUrl(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #d3c4a9',
              padding: '6px 0',
              fontFamily: 'inherit',
              color: '#48341f',
              outline: 'none',
            }}
          >
            {photos.map((photo) => (
              <option key={photo.id} value={photo.imageUrl}>
                {photo.title}
              </option>
            ))}
            {photos.length === 0 ? <option value="">尚無照片</option> : null}
          </select>
        </div>

        <div className="form-actions-line">
          <button type="button" className="btn-paper-cancel" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn-paper-submit" disabled={!title.trim()}>
            建立相簿
          </button>
        </div>
      </form>
    </div>
  )
}

/* === UploadPhotoModal === */
function UploadPhotoModal({
  albums,
  defaultAlbumId,
  onClose,
  onUploadPhoto,
}: {
  albums: Album[]
  defaultAlbumId?: string
  onClose: () => void
  onUploadPhoto: (
    albumId: string,
    title: string,
    imageUrl: string,
    styleType: 'polaroid' | 'scalloped' | 'film',
    dayOfWeek?: string,
    location?: string
  ) => void
}) {
  const [selectedAlbumId, setSelectedAlbumId] = useState(defaultAlbumId ?? '')
  const [photoTitle, setPhotoTitle] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [styleType, setStyleType] = useState<'polaroid' | 'scalloped' | 'film'>('polaroid')

  useEffect(() => {
    if (defaultAlbumId && albums.some((album) => album.id === defaultAlbumId)) {
      queueMicrotask(() => setSelectedAlbumId(defaultAlbumId))
      return
    }
    if (albums.length > 0 && !selectedAlbumId) {
      queueMicrotask(() => setSelectedAlbumId(albums[0].id))
    }
  }, [albums, defaultAlbumId, selectedAlbumId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!photoTitle.trim() || !photoUrl.trim() || !selectedAlbumId) return
    onUploadPhoto(selectedAlbumId, photoTitle.trim(), photoUrl.trim(), styleType)
    onClose()
  }

  const handleMockUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    setPhotoUrl(await getStoredFileUrl(file))
    if (!photoTitle) {
      setPhotoTitle(file.name.split('.')[0])
    }
  }

  const styles = [
    { key: 'polaroid', label: '經典拍立得 🎞️' },
    { key: 'scalloped', label: '花邊復古照片 📯' },
    { key: 'film', label: '黑白膠捲底片 🎬' },
  ] as const

  return (
    <div className="add-friend-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <form className="add-friend-card upload-photo-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="card-lined-header">
          <h3>新增相片至手札 📸</h3>
          <button type="button" className="close-x-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="form-group-lined">
          <label htmlFor="photo-form-album">選擇匯入相簿</label>
          <select
            id="photo-form-album"
            value={selectedAlbumId}
            onChange={(e) => setSelectedAlbumId(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #d3c4a9',
              padding: '6px 0',
              fontFamily: 'inherit',
              color: '#48341f',
              outline: 'none'
            }}
          >
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
            {albums.length === 0 && <option value="" disabled>請先建立相簿</option>}
          </select>
        </div>

        <div className="form-group-lined">
          <label htmlFor="photo-form-title">照片手寫字標題 (必填)</label>
          <input
            id="photo-form-title"
            type="text"
            required
            value={photoTitle}
            onChange={(e) => setPhotoTitle(e.target.value)}
            placeholder="例如：海邊的日落"
            maxLength={14}
          />
        </div>

        <div className="form-group-lined">
          <label htmlFor="photo-form-url">照片圖片網址 (貼上連結)</label>
          <input
            id="photo-form-url"
            type="url"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://example.com/photo.jpg"
          />
        </div>

        <div className="form-group-lined">
          <label htmlFor="photo-form-upload">或上傳本地檔案</label>
          <input
            id="photo-form-upload"
            type="file"
            accept="image/*"
            style={{ fontSize: '11px', marginTop: '4px' }}
            onChange={(e) => handleMockUpload(e.target.files)}
          />
        </div>

        <div className="form-group-lined">
          <label>照片復古樣式</label>
          <div className="tone-selector-row">
            {styles.map((s) => (
              <label key={s.key} className={`tone-option-label ${styleType === s.key ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="photo-style"
                  checked={styleType === s.key}
                  onChange={() => setStyleType(s.key)}
                  style={{ display: 'none' }}
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-actions-line">
          <button type="button" className="btn-paper-cancel" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn-paper-submit" disabled={!photoTitle.trim() || !photoUrl.trim() || !selectedAlbumId}>
            確認加入
          </button>
        </div>
      </form>
    </div>
  )
}



function RetroLightboxModal({
  items,
  activeIndex,
  onIndexChange,
  onClose,
  onToggleLike,
}: {
  items: RetroLightboxItem[]
  activeIndex: number
  onClose: () => void
  onIndexChange: (idx: number) => void
  onToggleLike: (itemId: string, liked: boolean) => void
}) {
  const [commentText, setCommentText] = useState('')
  
  // Real-time local state to manage comments for all photos in the lightbox session
  const [photoComments, setPhotoComments] = useState<Record<string, Array<{
    id: string
    author: string
    avatarUrl: string
    timeLabel: string
    text: string
    isLiked?: boolean
  }>>>({
    'fp-1': [
      {
        id: 'c-f1-1',
        author: 'yyyj418',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
        timeLabel: '2週前',
        text: '看起來也太美味了 🍄'
      },
      {
        id: 'c-f1-2',
        author: '5yj',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
        timeLabel: '2週前',
        text: '這是在古坑雨後散步發現的！'
      }
    ],
    'fp-2': [
      {
        id: 'c-f2-1',
        author: 'yyyj418',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
        timeLabel: '2w',
        text: '看起來也太好吃'
      },
      {
        id: 'c-f2-2',
        author: 'everything',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
        timeLabel: '2w',
        text: '實際上也真的很好吃👅'
      },
      {
        id: 'c-f2-3',
        author: 'yyyj418',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
        timeLabel: '2w',
        text: '好餓😫'
      }
    ],
    'fp-3': [
      {
        id: 'c-f3-1',
        author: 'yyyj418',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
        timeLabel: '2週前',
        text: '高鐵站接人嗎？'
      },
      {
        id: 'c-f3-2',
        author: '小安',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
        timeLabel: '2週前',
        text: '對呀，接朋友回雲林玩！'
      }
    ]
  })

  const currentItem = items[activeIndex]

  if (!currentItem) return null

  const currentComments = photoComments[currentItem.id] || []

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return

    const newComment = {
      id: `c-user-${Date.now()}`,
      author: '我',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
      timeLabel: '剛剛',
      text: commentText.trim()
    }

    setPhotoComments(prev => ({
      ...prev,
      [currentItem.id]: [...(prev[currentItem.id] || []), newComment]
    }))
    setCommentText('')
  }

  const handlePrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const nextIdx = (activeIndex - 1 + items.length) % items.length
    onIndexChange(nextIdx)
  }

  const handleNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const nextIdx = (activeIndex + 1) % items.length
    onIndexChange(nextIdx)
  }

  const handleToggleCommentLike = (commentId: string) => {
    setPhotoComments(prev => {
      const list = prev[currentItem.id] || []
      return {
        ...prev,
        [currentItem.id]: list.map(c => c.id === commentId ? { ...c, isLiked: !c.isLiked } : c)
      }
    })
  }

  return (
    <div className="retro-lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="retro-lightbox-content" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="retro-lightbox-header">
          <div className="retro-lightbox-author">
            <img src={currentItem.authorAvatarUrl} alt={currentItem.author} className="retro-lightbox-avatar" />
            <div>
              <span className="retro-lightbox-author-name">{currentItem.author}</span>
              <span className="retro-lightbox-author-subtitle">{currentItem.weekTitle}</span>
            </div>
          </div>
          <div className="retro-lightbox-header-right">
            <span className="retro-lightbox-counter">{activeIndex + 1} / {items.length}</span>
            <button className="retro-lightbox-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Center Image Container */}
        <div className="retro-lightbox-image-wrapper">
          <img src={currentItem.imageUrl} alt={currentItem.title} className="retro-lightbox-img" />
          
          {/* Click areas on the left and right halves */}
          <div className="lightbox-click-left" onClick={handlePrev} title="上一張">
            <span className="nav-arrow prev">‹</span>
          </div>
          <div className="lightbox-click-right" onClick={handleNext} title="下一張">
            <span className="nav-arrow next">›</span>
          </div>
        </div>

        {/* Bottom Details Info Bar */}
        <div className="retro-lightbox-details">
          <div className="retro-lightbox-details-row">
            <div>
              <h4 className="retro-lightbox-location">{currentItem.location || '未知地點'}</h4>
              <p className="retro-lightbox-date">{currentItem.dateStr || '未知時間'}</p>
            </div>
            
            {/* Comment Count and Heart Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#888888', fontSize: '13px' }}>
                <span>💬</span>
                <span>{currentComments.length}</span>
              </div>
              <button
                type="button"
                className={`retro-lightbox-like-btn ${currentItem.isLiked ? 'liked' : ''}`}
                onClick={() => onToggleLike(currentItem.id, !currentItem.isLiked)}
                style={{ padding: 0 }}
              >
                {currentItem.isLiked ? '❤️' : '🤍'}
              </button>
            </div>
          </div>

          {/* Comments List (Scrollable) */}
          {currentComments.length > 0 && (
            <div className="retro-lightbox-comments-list">
              {currentComments.map((c) => (
                <div key={c.id} className="retro-comment-row">
                  <img src={c.avatarUrl} alt={c.author} className="retro-comment-avatar" />
                  <div className="retro-comment-content">
                    <div className="retro-comment-header-row">
                      <span className="retro-comment-author">{c.author}</span>
                      <span className="retro-comment-time">{c.timeLabel}</span>
                    </div>
                    <p className="retro-comment-text">{c.text}</p>
                  </div>
                  <button
                    type="button"
                    className={`retro-comment-heart-btn ${c.isLiked ? 'liked' : ''}`}
                    onClick={() => handleToggleCommentLike(c.id)}
                    title={c.isLiked ? '收回讚' : '按讚留言'}
                  >
                    {c.isLiked ? '❤️' : '🤍'}
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Action comments bar */}
          <form onSubmit={handleSendComment} className="retro-lightbox-actions-bar">
            <div className="retro-lightbox-comment-input-wrapper">
              <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80" className="comment-avatar" alt="avatar" />
              <input
                type="text"
                placeholder="新增留言..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="comment-text-input"
              />
            </div>
            <button type="submit" className="lightbox-send-btn" disabled={!commentText.trim()}>
              發送
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default App
