import type {
  CalendarEvent,
  CalendarTask,
  ChatPost,
  Folder,
  Friend,
  FriendGroup,
  Note,
  Photo,
} from '../domain/types'

export const folders: Folder[] = [
  { id: 'life', name: '生活', count: 12, color: 'sage' },
  { id: 'study', name: '學習', count: 28, color: 'sand' },
  { id: 'travel', name: '旅行', count: 16, color: 'blue' },
  { id: 'ideas', name: '想法', count: 9, color: 'rose' },
  { id: 'daily', name: '日常碎片', count: 7, color: 'cream' },
  { id: 'saved', name: '收藏夾', count: 21, color: 'brown' },
  { id: 'reading', name: '閱讀', count: 14, color: 'lilac' },
  { id: 'health', name: '健康', count: 6, color: 'mint' },
  { id: 'work', name: '工作', count: 18, color: 'clay' },
  { id: 'spark', name: '靈感', count: 11, color: 'olive' },
]

export const notes: Note[] = [
  {
    id: 'note-1',
    title: '早晨的自己',
    excerpt: '今天很早起床，窗外的光很溫柔。決定把一些雜念寫下來...',
    folder: '生活',
    date: '2026.05.20',
    imageUrl:
      'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=240&q=80',
    photoCount: 5,
    likeCount: 1,
    fileCount: 0,
  },
  {
    id: 'note-2',
    title: '墾丁旅行記',
    excerpt: '這趟旅行很放鬆，天氣、海、咖啡、日落，都剛剛好。',
    folder: '旅行',
    date: '2026.06.18',
    imageUrl:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=240&q=80',
    photoCount: 8,
    likeCount: 2,
    fileCount: 1,
    isStarred: true,
  },
  {
    id: 'note-2-a',
    title: '花蓮三天兩夜',
    excerpt: '山林芬多精讓人心情平靜。太魯閣與七星潭的美麗讓人流連忘返。',
    folder: '旅行',
    date: '2026.06.12',
    imageUrl:
      'https://images.unsplash.com/photo-1528164344705-47542687000d?auto=format&fit=crop&w=240&q=80',
    photoCount: 15,
    likeCount: 1,
    fileCount: 2,
  },
  {
    id: 'note-2-b',
    title: '日本東京自由行',
    excerpt: '漫步在澀谷街頭，感受繁華都市的節奏。淺草寺的古意也非常動人。',
    folder: '旅行',
    date: '2026.05.28',
    imageUrl:
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=240&q=80',
    photoCount: 23,
    likeCount: 3,
    fileCount: 1,
  },
  {
    id: 'note-2-c',
    title: '台東微旅行',
    excerpt: '騎著單車在伯朗大道上，兩旁是金黃的稻穗，微風吹拂，無比愜意。',
    folder: '旅行',
    date: '2026.05.10',
    imageUrl:
      'https://images.unsplash.com/photo-1516690561799-46d8f74f9abf?auto=format&fit=crop&w=240&q=80',
    photoCount: 12,
    likeCount: 1,
    fileCount: 1,
  },
  {
    id: 'note-3',
    title: '種下一些小小的習慣',
    excerpt: '最近在練習每天喝水、每天走路、每天記錄三件小事...',
    folder: '想法',
    date: '2026.05.16',
    imageUrl:
      'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=240&q=80',
    photoCount: 3,
    likeCount: 4,
    fileCount: 0,
  },
  {
    id: 'note-4',
    title: '閱讀標記',
    excerpt: '把今天覺得被照亮的一段話先拍下來，之後再慢慢補心得。',
    folder: '閱讀',
    date: '2026.05.12',
    imageUrl:
      'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=240&q=80',
    photoCount: 2,
    likeCount: 1,
    fileCount: 1,
  },
]

export const chatPosts: ChatPost[] = [
  {
    id: 'chat-1',
    author: '小安',
    text: '明天一起去看展覽嗎？',
    time: '10:30',
    unread: 2,
    avatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
  },
  {
    id: 'chat-2',
    author: '阿哲',
    text: '我把照片傳給你了～',
    time: '昨天',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
  },
  {
    id: 'chat-3',
    author: '小柔',
    text: '週末要不要去咖啡館？',
    time: '昨天',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
  },
]

export const friends: Friend[] = [
  {
    id: 'friend-1',
    name: '小安',
    status: '最近在練習早起',
    tone: 'green',
    avatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
  },
  {
    id: 'friend-2',
    name: '阿哲',
    status: '下午要去打球！',
    tone: 'amber',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
  },
  {
    id: 'friend-3',
    name: '小柔',
    status: '週末要去海邊～',
    tone: 'green',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
  },
  {
    id: 'friend-4',
    name: '大明',
    status: '專注工作中',
    tone: 'gray',
    avatarUrl:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80',
  },
]

export const photos: Photo[] = [
  {
    id: 'w26-p1',
    title: '週一電腦',
    imageUrl: 'https://images.unsplash.com/photo-1587620962725-abab7fe55159?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週一',
    location: '廉使里, 雲林縣',
    isStarred: false
  },
  {
    id: 'w26-p2',
    title: '週一藍枕',
    imageUrl: 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週一',
    location: '廉使里, 雲林縣',
    isStarred: false
  },
  {
    id: 'w25-p1',
    title: '週一黑狗站姿',
    imageUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週一',
    location: '虎尾鎮, 雲林縣',
    isStarred: false
  },
  {
    id: 'w25-p2',
    title: '週一黑狗坐姿',
    imageUrl: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週一',
    location: '虎尾鎮, 雲林縣',
    isStarred: false
  },
  {
    id: 'w25-p3',
    title: '週日綠廊',
    imageUrl: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週日',
    location: '古坑鄉, 雲林縣',
    isStarred: false
  },
  {
    id: 'w25-p4',
    title: '週日線球',
    imageUrl: 'https://images.unsplash.com/photo-1513829096999-4978602294fc?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週日',
    location: '古坑鄉, 雲林縣',
    isStarred: true
  },
  {
    id: 'w25-p5',
    title: '週二綠葉',
    imageUrl: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週二',
    location: '斗六市, 雲林縣',
    isStarred: false
  },
  {
    id: 'w24-p1',
    title: '週四書桌',
    imageUrl: 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週四',
    location: '斗六市, 雲林縣',
    isStarred: false
  },
  {
    id: 'w24-p2',
    title: '週四火鍋',
    imageUrl: 'https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週四',
    location: '斗六市, 雲林縣',
    isStarred: false
  },
  {
    id: 'w24-p3',
    title: '週日街景',
    imageUrl: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週日',
    location: '斗六市, 雲林縣',
    isStarred: false
  },
  {
    id: 'w24-p4',
    title: '週日火鍋特寫',
    imageUrl: 'https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週日',
    location: '斗六市, 雲林縣',
    isStarred: true
  },
  {
    id: 'w24-p5',
    title: '週三高鐵',
    imageUrl: 'https://images.unsplash.com/photo-1541417904950-b855846fe074?auto=format&fit=crop&w=260&q=80',
    dayOfWeek: '週三',
    location: '虎尾高鐵站, 雲林縣',
    isStarred: false
  }
]

export const calendarEvents: CalendarEvent[] = [
  {
    id: 'event-1',
    ownerId: 'user-1',
    title: '小組共同日曆',
    description: '和小安、小柔確認週末看展時間。',
    startsAt: '2026-06-24T10:00:00.000Z',
    endsAt: '2026-06-24T11:00:00.000Z',
    visibility: 'shared',
    participantIds: ['user-2', 'user-3'],
    linkedResource: { type: 'note', id: 'note-1', title: '資料庫筆記' },
    color: 'sage',
  },
  {
    id: 'event-2',
    ownerId: 'user-1',
    title: '整理相簿回憶',
    startsAt: '2026-06-25T13:00:00.000Z',
    endsAt: '2026-06-25T14:00:00.000Z',
    visibility: 'private',
    participantIds: [],
    linkedResource: { type: 'photo', id: 'photo-2', title: '朋友合照' },
    color: 'rose',
  },
]

export const calendarTasks: CalendarTask[] = [
  {
    id: 'task-1',
    ownerId: 'user-1',
    title: '寄出心得草稿',
    dueAt: '2026-06-25T15:30:00.000Z',
    priority: 'high',
    assigneeIds: ['user-2'],
    eventId: 'event-1',
  },
  {
    id: 'task-2',
    ownerId: 'user-1',
    title: '整理旅行照片',
    dueAt: '2026-06-26T03:00:00.000Z',
    priority: 'medium',
    assigneeIds: [],
  },
]

export const initialGroups: FriendGroup[] = [
  { id: 'group-1', name: '家人', memberIds: ['friend-4'] },
  { id: 'group-2', name: '墾丁旅行團', memberIds: ['friend-1', 'friend-2', 'friend-3'] },
  { id: 'group-3', name: '讀書會', memberIds: ['friend-1', 'friend-3'] },
]
