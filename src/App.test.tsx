import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

type MockApiPayload = Record<string, unknown> | undefined

const apiMocks = vi.hoisted(() => {
  return {
    callApi: vi.fn(),
  }
})

vi.mock('./services/apiClient', () => ({
  callApi: apiMocks.callApi,
  isApiConfigured: true,
}))

const authMocks = vi.hoisted(() => {
  const defaultUser = { id: 'user-1', email: 'garden@example.com', name: '學良' }

  return {
    defaultUser,
    getCurrentUser: vi.fn(),
    signInWithEmail: vi.fn(),
    registerWithEmail: vi.fn(),
    signOut: vi.fn(),
    uploadUserFileForDisplay: vi.fn(),
  }
})

vi.mock('./services/appwriteClient', () => ({
  isAppwriteConfigured: true,
  getCurrentUser: authMocks.getCurrentUser,
  signInWithEmail: authMocks.signInWithEmail,
  registerWithEmail: authMocks.registerWithEmail,
  signOut: authMocks.signOut,
  uploadUserFileForDisplay: authMocks.uploadUserFileForDisplay,
}))

beforeEach(() => {
  authMocks.getCurrentUser.mockReset()
  authMocks.signInWithEmail.mockReset()
  authMocks.registerWithEmail.mockReset()
  authMocks.signOut.mockReset()
  authMocks.uploadUserFileForDisplay.mockReset()
  apiMocks.callApi.mockReset()

  authMocks.getCurrentUser.mockResolvedValue(authMocks.defaultUser)
  authMocks.signInWithEmail.mockResolvedValue(authMocks.defaultUser)
  authMocks.registerWithEmail.mockResolvedValue(authMocks.defaultUser)
  authMocks.signOut.mockResolvedValue(undefined)
  authMocks.uploadUserFileForDisplay.mockRejectedValue(new Error('Storage unavailable in tests.'))

  apiMocks.callApi.mockImplementation(() => {
    return Promise.resolve(null)
  })
})

async function renderAuthenticatedApp() {
  const result = render(<App />)
  await screen.findByRole('button', { name: '首頁' })
  return result
}

async function createFolder(user: ReturnType<typeof userEvent.setup>, name = '生活') {
  await user.click(screen.getByRole('button', { name: '資料夾' }))
  await user.click(screen.getByRole('button', { name: '新增資料夾' }))
  await user.clear(screen.getByLabelText('新資料夾名稱'))
  await user.type(screen.getByLabelText('新資料夾名稱'), name)
  await user.click(screen.getByRole('button', { name: '建立資料夾' }))
}

async function createFolderAndOpen(user: ReturnType<typeof userEvent.setup>, name = '生活') {
  await createFolder(user, name)
  await user.click(screen.getByRole('button', { name: `管理${name}資料夾` }))
}

async function createFriend(user: ReturnType<typeof userEvent.setup>, name = '聊天朋友') {
  apiMocks.callApi.mockImplementation((method: string, path: string) => {
    if (method === 'GET' && path.startsWith('/profiles/search')) {
      return Promise.resolve({
        id: 'friend-12345',
        name: name,
        email: 'friend@example.com',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150',
        status: '最近在練習早起',
        tone: 'green'
      })
    }
    if (method === 'POST' && path === '/friends') {
      return Promise.resolve({
        id: 'friendship-12345',
        requesterId: 'user-123',
        addresseeId: 'friend-12345',
        friendshipStatus: 'accepted'
      })
    }
    return Promise.resolve(null)
  })

  await user.click(screen.getByRole('button', { name: '好友' }))
  await user.click(screen.getAllByRole('button', { name: '邀請好友' })[0])
  await user.type(screen.getByPlaceholderText('friend@example.com'), 'friend@example.com')
  await user.click(screen.getByRole('button', { name: '搜尋' }))
  await user.click(screen.getByRole('button', { name: '加為好友 ➕' }))
  await user.click(screen.getByRole('button', { name: '關閉' }))
}

function mockWorkspaceSnapshot(options?: { friends?: unknown[] }) {
  apiMocks.callApi.mockImplementation((method: string, path: string, payload?: MockApiPayload) => {
    if (method === 'GET' && path === '/friends') {
      return Promise.resolve(options?.friends ?? [])
    }
    if (method === 'GET' && path.startsWith('/profiles/search')) {
      return Promise.resolve(null)
    }
    if (method === 'GET') {
      return Promise.resolve([])
    }
    if (method === 'PATCH') {
      return Promise.resolve({ id: path.split('/').pop(), ...(payload ?? {}) })
    }
    if (method === 'DELETE') {
      return Promise.resolve({ ok: true })
    }
    return Promise.resolve(null)
  })
}

describe('Warm Desk Garden app shell', () => {
  it('shows the auth entrance when no Appwrite session exists', async () => {
    authMocks.getCurrentUser.mockRejectedValueOnce(new Error('No active session'))

    render(<App />)

    expect(await screen.findByRole('heading', { name: '登入我的資料花園' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('密碼')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '資料夾' })).not.toBeInTheDocument()
  })

  it('registers a new Appwrite account and opens the workspace', async () => {
    const user = userEvent.setup()
    authMocks.getCurrentUser.mockRejectedValueOnce(new Error('No active session'))
    authMocks.registerWithEmail.mockResolvedValueOnce({
      id: 'user-2',
      email: 'new-garden@example.com',
      name: '新朋友',
    })

    render(<App />)

    await user.click(await screen.findByRole('button', { name: '註冊' }))
    await user.type(screen.getByLabelText('暱稱'), '新朋友')
    await user.type(screen.getByLabelText('Email'), 'new-garden@example.com')
    await user.type(screen.getByLabelText('密碼'), 'password123')
    await user.type(screen.getByLabelText('確認密碼'), 'password123')
    await user.click(screen.getByRole('button', { name: '建立帳號並進入' }))

    expect(authMocks.registerWithEmail).toHaveBeenCalledWith(
      'new-garden@example.com',
      'password123',
      '新朋友',
    )
    expect(await screen.findByRole('button', { name: '資料夾' })).toBeInTheDocument()
    expect(screen.getByText('我的資料花園')).toBeInTheDocument()
  })

  it('waits for profile sync before opening the workspace after registration', async () => {
    const user = userEvent.setup()
    let resolveProfileSync: (value: unknown) => void = () => {}
    const profileSync = new Promise((resolve) => {
      resolveProfileSync = resolve
    })

    authMocks.getCurrentUser.mockRejectedValueOnce(new Error('No active session'))
    authMocks.registerWithEmail.mockResolvedValueOnce({
      id: 'user-4',
      email: 'searchable-friend@example.com',
      name: '可搜尋朋友',
    })
    apiMocks.callApi.mockImplementation((method: string, path: string) => {
      if (method === 'POST' && path === '/profiles') {
        return profileSync
      }
      if (method === 'GET') {
        return Promise.resolve([])
      }
      return Promise.resolve(null)
    })

    render(<App />)

    await user.click(await screen.findByRole('button', { name: '註冊' }))
    await user.type(screen.getByLabelText('暱稱'), '可搜尋朋友')
    await user.type(screen.getByLabelText('Email'), 'searchable-friend@example.com')
    await user.type(screen.getByLabelText('密碼'), 'password123')
    await user.type(screen.getByLabelText('確認密碼'), 'password123')
    await user.click(screen.getByRole('button', { name: '建立帳號並進入' }))

    expect(apiMocks.callApi).toHaveBeenCalledWith('POST', '/profiles', { name: '可搜尋朋友' })
    expect(screen.queryByRole('button', { name: '資料夾' })).not.toBeInTheDocument()

    resolveProfileSync(null)

    expect(await screen.findByRole('button', { name: '資料夾' })).toBeInTheDocument()
  })

  it('signs in with Appwrite and signs out back to the auth entrance', async () => {
    const user = userEvent.setup()
    authMocks.getCurrentUser.mockRejectedValueOnce(new Error('No active session'))
    authMocks.signInWithEmail.mockResolvedValueOnce({
      id: 'user-3',
      email: 'garden@example.com',
      name: '學良',
    })

    render(<App />)

    await user.type(await screen.findByLabelText('Email'), 'garden@example.com')
    await user.type(screen.getByLabelText('密碼'), 'password123')
    await user.click(screen.getByRole('button', { name: '登入並同步資料' }))
    expect(authMocks.signInWithEmail).toHaveBeenCalledWith('garden@example.com', 'password123')

    await user.click(await screen.findByRole('button', { name: '登出' }))

    expect(authMocks.signOut).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: '登入我的資料花園' })).toBeInTheDocument()
  })

  it('uses the approved Chinese navigation and avoids Thread or Retro labels', async () => {
    await renderAuthenticatedApp()

    for (const label of ['首頁', '資料夾', '心得', '聊天', '好友', '相簿', '行事曆', '設定', '登出']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }

    expect(screen.queryByRole('button', { name: '筆記' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Thread/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Retro/i)).not.toBeInTheDocument()
  })

  it('opens the calendar surface and lets a task be completed locally', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '行事曆' }))
    expect(screen.getByRole('heading', { name: '行事曆' })).toBeInTheDocument()
    expect(screen.getByLabelText('生活手帳行事曆')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '行事曆待辦' }))
    await user.click(screen.getByRole('button', { name: '新增待辦項目' }))
    await user.type(screen.getByLabelText('待辦名稱'), '本地待辦')
    await user.click(screen.getByRole('button', { name: '新增待辦' }))

    const task = screen.getByRole('checkbox', { name: '本地待辦' })
    expect(task).not.toBeChecked()
    await user.click(task)
    expect(task).toBeChecked()
  })

  it('supports complete local calendar event, task, invite, and reminder interactions', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '行事曆' }))

    await user.click(screen.getByRole('button', { name: '新增行程' }))
    await user.type(screen.getByLabelText('行程名稱 *'), '專題討論')
    await user.clear(screen.getByLabelText('開始時間'))
    await user.type(screen.getByLabelText('開始時間'), '09:30')
    await user.clear(screen.getByLabelText('結束時間'))
    await user.type(screen.getByLabelText('結束時間'), '10:30')
    await user.click(screen.getByRole('radio', { name: '👥 好友共同日曆' }))
    await user.click(screen.getByRole('button', { name: '儲存日程' }))

    expect(screen.getByText('專題討論')).toBeInTheDocument()
    expect(screen.getAllByText('好友共同日曆').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '編輯行程：專題討論' }))
    await user.clear(screen.getByLabelText('行程名稱 *'))
    await user.type(screen.getByLabelText('行程名稱 *'), '專題討論更新')
    await user.click(screen.getByRole('button', { name: '儲存日程' }))
    expect(screen.getByText('專題討論更新')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '切換提醒：專題討論更新' }))
    expect(screen.getByText('站內提醒：已排程')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '行事曆待辦' }))
    await user.click(screen.getByRole('button', { name: '新增待辦項目' }))
    await user.type(screen.getByLabelText('待辦名稱'), '完成行事曆功能')
    await user.click(screen.getByRole('button', { name: '新增待辦' }))
    const newTask = screen.getByRole('checkbox', { name: '完成行事曆功能' })
    await user.click(newTask)
    expect(newTask).toBeChecked()
    await user.click(screen.getByRole('button', { name: '刪除待辦：完成行事曆功能' }))
    expect(screen.queryByText('完成行事曆功能')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '行事曆月曆' }))
    await user.click(screen.getByRole('button', { name: '刪除行程：專題討論更新' }))
    expect(screen.queryByText('專題討論更新')).not.toBeInTheDocument()
  })

  it('shows a complete mock page for every primary section', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    const pages = [
      ['資料夾', '資料夾書櫃'],
      ['心得', '心得小徑'],
      ['聊天', '好友貼文'],
      ['好友', '好友手札'],
      ['相簿', '復古相簿'],
      ['行事曆', '生活手帳行事曆'],
    ] as const

    for (const [navLabel, pageHeading] of pages) {
      await user.click(screen.getByRole('button', { name: navLabel }))
      expect(
        screen.getByRole('heading', { name: pageHeading }),
      ).toBeInTheDocument()
    }
  })

  it('keeps the right rail only on the desk overview', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    expect(screen.getByLabelText('右側好友與相簿')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '心得' }))
    expect(screen.queryByLabelText('右側好友與相簿')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '首頁' }))
    expect(screen.getByLabelText('右側好友與相簿')).toBeInTheDocument()
  })

  it('uses the reference bookshelf folder page without seeded books', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    expect(screen.queryByLabelText('書桌裝飾圖')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '資料夾' }))
    expect(screen.getByLabelText('真實木質書櫃')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '管理生活資料夾' })).not.toBeInTheDocument()
    expect(screen.getAllByText('還沒有資料夾').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '新增資料夾' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '建立資料書' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新增一本資料書' })).not.toBeInTheDocument()
    expect(screen.queryByText('滑鼠靠近書本會微微放大並顯示名稱')).not.toBeInTheDocument()
    expect(screen.queryByText('書櫃互動概念')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '資料夾長相方向' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新增資料夾' }))
    await user.clear(screen.getByLabelText('新資料夾名稱'))
    await user.type(screen.getByLabelText('新資料夾名稱'), '生活')
    await user.click(screen.getByRole('button', { name: '建立資料夾' }))
    expect(screen.getByRole('button', { name: '管理生活資料夾' })).toBeInTheDocument()
  })

  it('structures the bookshelf as bottom-aligned realistic compartments', async () => {
    const user = userEvent.setup()
    const { container } = await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '資料夾' }))

    expect(screen.getByLabelText('上層書格')).toBeInTheDocument()
    expect(screen.getByLabelText('下層書格')).toBeInTheDocument()
    expect(screen.getByLabelText('下層裝飾格')).toBeInTheDocument()

    const shelfRows = container.querySelectorAll('.shelf-row')
    expect(shelfRows.length).toBeGreaterThanOrEqual(2)
    shelfRows.forEach((row) => {
      expect(row).toHaveAttribute('data-align', 'bottom')
    })
  })

  it('keeps bookshelf hover to scaling only without floating name labels or shelf add buttons', async () => {
    const user = userEvent.setup()
    const { container } = await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '資料夾' }))

    expect(container.querySelector('.folder-bookshelf-page .book-tooltip')).not.toBeInTheDocument()
    expect(container.querySelector('.folder-bookshelf-page .folder-book.add-book')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '把新資料夾放上書櫃' })).not.toBeInTheDocument()
  })

  it('places recent organization on the left and the realistic bookshelf on the right', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '資料夾' }))

    const layout = screen.getByLabelText('資料夾頁雙欄配置')
    const recent = screen.getByLabelText('最近整理欄')
    const shelf = screen.getByLabelText('真實木質書櫃')

    expect(layout).toContainElement(recent)
    expect(layout).toContainElement(shelf)
    expect(
      recent.compareDocumentPosition(shelf) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('renders the notes page as a folder-internal binder notebook', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFolderAndOpen(user, '生活')

    expect(screen.getByLabelText('資料夾內活頁筆記本')).toBeInTheDocument()
    expect(screen.getByLabelText('左頁筆記列表')).toBeInTheDocument()
    expect(screen.getByLabelText('右頁附件內容')).toBeInTheDocument()
    for (const tab of ['全部', '照片', 'PDF', '附件']) {
      expect(screen.getByRole('button', { name: tab })).toBeInTheDocument()
    }
    expect(screen.getByText('拖曳照片或 PDF 到這裡')).toBeInTheDocument()
  })

  it('opens the matching notes notebook from a bookshelf book', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFolderAndOpen(user, '生活')

    expect(screen.getByRole('heading', { name: '筆記' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '生活筆記' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '生活 12 已選取' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('資料夾內活頁筆記本')).toHaveTextContent('生活')
  })

  it('limits note uploads to photos and PDF files', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFolderAndOpen(user, '生活')
    await user.click(screen.getByRole('button', { name: '新增筆記內容' }))

    expect(screen.getByText('只允許照片與 PDF')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上傳照片' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上傳 PDF' })).toBeInTheDocument()
  })

  it('adds a named folder as a new bookshelf book and opens its empty notebook', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '資料夾' }))
    await user.click(screen.getByRole('button', { name: '新增資料夾' }))
    await user.clear(screen.getByLabelText('新資料夾名稱'))
    await user.type(screen.getByLabelText('新資料夾名稱'), '研究整理')
    await user.click(screen.getByRole('button', { name: '建立資料夾' }))

    const newFolderBook = screen.getByRole('button', { name: '管理研究整理資料夾' })
    expect(newFolderBook).toBeInTheDocument()
    expect(screen.getByLabelText('最近整理欄').querySelector('.folder-line strong')?.textContent).toBe('研究整理')

    await user.click(newFolderBook)

    expect(screen.getByRole('heading', { name: '研究整理筆記' })).toBeInTheDocument()
    expect(screen.getByText('研究整理還沒有筆記')).toBeInTheDocument()
  })

  it('creates a new note inside the selected folder', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFolderAndOpen(user, '生活')
    await user.click(screen.getByRole('button', { name: '新增筆記內容' }))

    expect(screen.getByRole('button', { name: /生活新筆記/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /生活新筆記/ })).toBeInTheDocument()
  })

  it('lets the selected note title and memo be edited directly', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFolderAndOpen(user, '生活')
    await user.click(screen.getByRole('button', { name: '新增筆記內容' }))

    await user.clear(screen.getByLabelText('筆記標題'))
    await user.type(screen.getByLabelText('筆記標題'), '午後整理')
    await user.clear(screen.getByLabelText('筆記備註'))
    await user.type(screen.getByLabelText('筆記備註'), '今天先整理兩張照片和一份 PDF。')

    expect(screen.getByRole('button', { name: /午後整理/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '午後整理' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('今天先整理兩張照片和一份 PDF。')).toBeInTheDocument()
  })

  it('makes the visible right-page header, photo labels, and PDF names editable', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFolderAndOpen(user, '旅行')
    await user.click(screen.getByRole('button', { name: '新增筆記內容' }))

    const titleInput = screen.getByLabelText('筆記標題')
    const dateInput = screen.getByLabelText('筆記日期')
    expect(titleInput.closest('.selected-note-title-wrap')).toBeInTheDocument()
    expect(dateInput.closest('.selected-note-title-wrap')).toBeInTheDocument()

    await user.clear(titleInput)
    await user.type(titleInput, '右頁直接編輯')
    await user.clear(dateInput)
    await user.type(dateInput, '2026.06.30')
    await user.upload(
      screen.getByLabelText('選擇照片檔案'),
      new File(['photo'], '旅行照片.png', { type: 'image/png' }),
    )
    const photoNameInput = await screen.findByLabelText('照片名稱：旅行照片.png')
    await user.clear(photoNameInput)
    await user.type(photoNameInput, '封面照片')

    await user.upload(
      screen.getByLabelText('選擇 PDF 檔案'),
      new File(['pdf'], '旅行行程.pdf', { type: 'application/pdf' }),
    )

    const pdfNameInput = await screen.findByLabelText('PDF名稱：旅行行程.pdf')
    await user.clear(pdfNameInput)
    await user.type(pdfNameInput, '整理資料.pdf')
    await user.click(screen.getByRole('button', { name: '全部' }))

    expect(screen.getByRole('heading', { name: '右頁直接編輯' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026.06.30')).toBeInTheDocument()
    expect(screen.getByDisplayValue('封面照片')).toBeInTheDocument()
    expect(screen.getByDisplayValue('整理資料.pdf')).toBeInTheDocument()
  })

  it('deletes the selected note and returns to the next note in the folder', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFolderAndOpen(user, '生活')
    await user.click(screen.getByRole('button', { name: '新增筆記內容' }))
    await user.click(screen.getByRole('button', { name: '新增筆記內容' }))
    const createdNote = screen.getByRole('heading', { name: /生活新筆記/ }).textContent ?? ''

    await user.click(screen.getByRole('button', { name: '刪除目前筆記' }))

    expect(screen.queryByRole('button', { name: createdNote })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /生活新筆記/ })).toBeInTheDocument()
  })

  it('attaches uploaded photos and PDFs while rejecting other file types', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFolderAndOpen(user, '生活')
    await user.click(screen.getByRole('button', { name: '新增筆記內容' }))

    await user.upload(
      screen.getByLabelText('選擇照片檔案'),
      new File(['photo'], '桌面照片.png', { type: 'image/png' }),
    )
    expect(await screen.findByDisplayValue('桌面照片.png')).toBeInTheDocument()

    await user.upload(
      screen.getByLabelText('選擇 PDF 檔案'),
      new File(['pdf'], '閱讀資料.pdf', { type: 'application/pdf' }),
    )
    expect(await screen.findByDisplayValue('閱讀資料.pdf')).toBeInTheDocument()

    await user.upload(
      screen.getByLabelText('選擇照片檔案'),
      new File(['text'], '不能放文字.txt', { type: 'text/plain' }),
    )
    expect(screen.getByText('目前只接受照片與 PDF 檔案。')).toBeInTheDocument()
  })

  it('renders reflections as a mood journal binder with side tabs', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '心得' }))

    expect(screen.getByLabelText('心情手札活頁本')).toBeInTheDocument()
    expect(screen.getByLabelText('左頁心得列表')).toBeInTheDocument()
    expect(screen.getByLabelText('右頁心得內容')).toBeInTheDocument()
    expect(screen.getByLabelText('心得右側分頁')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '寫一則新心得' }).length).toBeGreaterThan(0)
    for (const tab of ['全部', '快樂', '平靜', '思考', '感恩', '難過', '+']) {
      expect(screen.getByRole('button', { name: tab })).toBeInTheDocument()
    }
  })

  it('starts the reflections page without sample reflections or sample photos', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '心得' }))

    expect(screen.getByText('還沒有心得')).toBeInTheDocument()
    expect(screen.queryByText('陽光小徑')).not.toBeInTheDocument()
    expect(screen.queryByText('朋友合照')).not.toBeInTheDocument()
    expect(screen.queryByText('海邊')).not.toBeInTheDocument()
    expect(screen.queryByText('午後花')).not.toBeInTheDocument()
  })

  it('adds new reflections to the dated left list and shows the selected content on the right', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '心得' }))
    await user.click(screen.getAllByRole('button', { name: '寫一則新心得' })[0])

    const titleInput = screen.getByLabelText('心得標題')
    const dateInput = screen.getByLabelText('心得日期')
    const contentInput = screen.getByLabelText('心得內容')

    await user.clear(titleInput)
    await user.type(titleInput, '今天的練習')
    await user.clear(dateInput)
    await user.type(dateInput, '2026.06.26')
    await user.clear(contentInput)
    await user.type(contentInput, '把資料夾先放一邊，今天專心把心得整理成左清單右內容。')

    const list = screen.getByLabelText('左頁心得列表')
    const rightPage = screen.getByLabelText('右頁心得內容')
    expect(list.querySelector('.reflection-card h4')?.textContent).toBe('今天的練習')
    expect(within(rightPage).getByRole('heading', { name: '今天的練習' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('把資料夾先放一邊，今天專心把心得整理成左清單右內容。')).toBeInTheDocument()
  })

  it('deletes the selected reflection and returns to the next dated entry', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '心得' }))
    await user.click(screen.getAllByRole('button', { name: '寫一則新心得' })[0])
    await user.clear(screen.getByLabelText('心得標題'))
    await user.type(screen.getByLabelText('心得標題'), '要刪除的心得')

    await user.click(screen.getByRole('button', { name: '刪除目前心得' }))

    expect(screen.queryByRole('button', { name: /要刪除的心得/ })).not.toBeInTheDocument()
    expect(screen.getByText('還沒有心得')).toBeInTheDocument()
  })

  it('uploads photos to the selected reflection', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '心得' }))
    await user.click(screen.getAllByRole('button', { name: '寫一則新心得' })[0])
    await user.upload(
      screen.getByLabelText('選擇心得照片'),
      new File(['photo'], '心得照片.png', { type: 'image/png' }),
    )

    expect(await screen.findByDisplayValue('心得照片.png')).toBeInTheDocument()
  })

  it('edits and deletes uploaded reflection photos', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '心得' }))
    await user.click(screen.getAllByRole('button', { name: '寫一則新心得' })[0])
    await user.upload(
      screen.getByLabelText('選擇心得照片'),
      new File(['photo'], '心得照片.png', { type: 'image/png' }),
    )

    const photoNameInput = await screen.findByLabelText('心得照片名稱：心得照片.png')
    await user.clear(photoNameInput)
    await user.type(photoNameInput, '整理後的照片')

    expect(screen.getByDisplayValue('整理後的照片')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '刪除整理後的照片' }))

    expect(screen.queryByDisplayValue('整理後的照片')).not.toBeInTheDocument()
  })

  it('gives chat, friends, album, and calendar their reference notebook layouts', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFriend(user, '聊天朋友')
    await user.click(screen.getByRole('button', { name: '聊天' }))
    expect(screen.getByLabelText('聊天貼文活頁本')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '好友' }))
    expect(screen.getByLabelText('好友手札活頁本')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '相簿' }))
    expect(screen.getByLabelText('復古相簿活頁本')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '行事曆' }))
    expect(screen.getByLabelText('生活手帳行事曆')).toBeInTheDocument()
  })

  it('moves friend photo sharing into chat posts and keeps chat room in a side tab', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFriend(user, '聊天朋友')
    await user.click(screen.getByRole('button', { name: '聊天' }))

    expect(screen.getByRole('heading', { name: '好友貼文' })).toBeInTheDocument()
    expect(screen.getByLabelText('聊天貼文活頁本')).toHaveClass('no-binder-spine')
    expect(screen.getByLabelText('好友貼文列表')).toBeInTheDocument()
    const photoWall = screen.getByLabelText('貼文照片牆')
    expect(photoWall).toBeInTheDocument()
    expect(screen.getByText('目前沒有貼文，先新增一則近況吧。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '發一則貼文' }))
    await user.type(screen.getByLabelText('貼文內容'), '今天去看展覽，好喜歡這個地方。')
    await user.type(screen.getByLabelText('照片網址'), 'https://example.com/exhibit.jpg')
    await user.click(screen.getByRole('button', { name: '加入照片' }))
    await user.click(screen.getByRole('button', { name: '儲存貼文' }))

    expect(within(photoWall).getByText('我')).toBeInTheDocument()
    expect(within(photoWall).getByText('今天去看展覽，好喜歡這個地方。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '聊天室' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '聊天室' }))

    expect(screen.getByLabelText('聊天室功能區')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('寫一則回覆...')).toBeInTheDocument()
  })

  it('removes friend sharing from the album section after moving it to chat', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '相簿' }))

    expect(screen.queryByRole('button', { name: '相簿好友分享' })).not.toBeInTheDocument()
    expect(screen.queryByText('看看好友最近分享了哪些生活點滴 ✨')).not.toBeInTheDocument()
  })

  it('supports complete local chat post interactions before backend wiring', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await createFriend(user, '聊天室朋友')
    await user.click(screen.getByRole('button', { name: '聊天' }))
    await user.click(screen.getByRole('button', { name: '發一則貼文' }))

    expect(screen.getByLabelText('貼文編輯器')).toBeInTheDocument()
    await user.type(screen.getByLabelText('貼文內容'), '今天完成聊天頁互動')
    await user.type(screen.getByLabelText('照片網址'), 'https://example.com/chat-photo.jpg')
    await user.click(screen.getByRole('button', { name: '加入照片' }))
    expect(screen.getByText('1 張照片待發布')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '儲存貼文' }))
    const photoWall = screen.getByLabelText('貼文照片牆')
    expect(within(photoWall).getByText('今天完成聊天頁互動')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '我今天完成聊天頁互動剛剛' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '按讚貼文' }))
    expect(within(photoWall).getByText('♥ 1')).toBeInTheDocument()

    await user.type(screen.getByLabelText('留言內容'), '這則可以留言')
    await user.click(screen.getByRole('button', { name: '送出留言' }))
    expect(within(photoWall).getByText('這則可以留言')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '編輯貼文' }))
    await user.clear(screen.getByLabelText('貼文內容'))
    await user.type(screen.getByLabelText('貼文內容'), '改成可編輯的聊天貼文')
    await user.click(screen.getByRole('button', { name: '儲存貼文' }))
    expect(within(photoWall).getByText('改成可編輯的聊天貼文')).toBeInTheDocument()
    expect(screen.queryByText('今天完成聊天頁互動')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '聊天室' }))
    await user.type(screen.getByLabelText('回覆文字'), '聊天室訊息也會留下')
    await user.click(screen.getByRole('button', { name: '傳送文字' }))
    expect(screen.getByText('聊天室訊息也會留下')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '全部' }))
    await user.click(screen.getByRole('button', { name: '刪除貼文' }))
    expect(screen.queryByText('改成可編輯的聊天貼文')).not.toBeInTheDocument()
  })

  it('starts with no demo content while keeping creation paths available', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '資料夾' }))
    expect(screen.queryByRole('button', { name: '管理生活資料夾' })).not.toBeInTheDocument()
    expect(screen.getAllByText('還沒有資料夾').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '新增資料夾' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '聊天' }))
    expect(screen.queryByText('今天去看展覽，好喜歡這個地方。')).not.toBeInTheDocument()
    expect(screen.getByText('目前沒有貼文，先新增一則近況吧。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '行事曆' }))
    expect(screen.queryByText('寄出心得草稿')).not.toBeInTheDocument()
    expect(screen.getByText('今日無行程安排')).toBeInTheDocument()
  })

  it('does not expose a restore-demo-data action in settings', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '設定' }))

    expect(screen.getByRole('button', { name: /清空所有數據/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /還原預設範例/ })).not.toBeInTheDocument()
  })

  it('opens the add-friend modal from the header invite button', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    apiMocks.callApi.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && path.startsWith('/profiles/search')) {
        return Promise.resolve({
          id: 'friend-456',
          name: '新朋友',
          email: 'newfriend@example.com',
          avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150',
          status: '最近在練習早起',
          tone: 'green'
        })
      }
      if (method === 'POST' && path === '/friends') {
        return Promise.resolve({
          id: 'friendship-789',
          requesterId: 'user-123',
          addresseeId: 'friend-456',
          friendshipStatus: 'accepted'
        })
      }
      return Promise.resolve(null)
    })

    await user.click(screen.getByRole('button', { name: '好友' }))
    await user.click(screen.getAllByRole('button', { name: '邀請好友' })[0])

    expect(screen.getByText('🔍 尋找真實好友')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('friend@example.com'), 'newfriend@example.com')
    await user.click(screen.getByRole('button', { name: '搜尋' }))
    
    expect(screen.getByText('新朋友')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '加為好友 ➕' }))
    await user.click(screen.getByRole('button', { name: '關閉' }))
  })

  it('accepts an existing incoming invite when adding that user from search', async () => {
    const user = userEvent.setup()

    apiMocks.callApi.mockImplementation((method: string, path: string, payload?: MockApiPayload) => {
      if (method === 'GET' && path === '/friends') {
        return Promise.resolve([
          {
            id: 'friendship-incoming-search',
            requesterId: 'friend-456',
            requesterName: '已邀請我的人',
            requesterEmail: 'friend456@example.com',
            requesterStatus: '等你接受邀請',
            requesterTone: 'green',
            addresseeId: 'user-1',
            addresseeName: '學良',
            addresseeEmail: 'garden@example.com',
            friendshipStatus: 'pending',
          },
        ])
      }
      if (method === 'GET' && path.startsWith('/profiles/search')) {
        return Promise.resolve({
          id: 'friend-456',
          name: '已邀請我的人',
          email: 'friend456@example.com',
          avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150',
          status: '等你接受邀請',
          tone: 'green',
        })
      }
      if (method === 'PATCH' && path === '/friends/friendship-incoming-search') {
        return Promise.resolve({ id: 'friendship-incoming-search', ...(payload ?? {}) })
      }
      if (method === 'GET') {
        return Promise.resolve([])
      }
      return Promise.resolve(null)
    })

    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '好友' }))
    await user.click(screen.getAllByRole('button', { name: '邀請好友' })[0])
    await user.type(screen.getByPlaceholderText('friend@example.com'), 'friend456@example.com')
    await user.click(screen.getByRole('button', { name: '搜尋' }))
    await user.click(await screen.findByRole('button', { name: '加為好友 ➕' }))

    await waitFor(() => {
      expect(apiMocks.callApi).toHaveBeenCalledWith(
        'PATCH',
        '/friends/friendship-incoming-search',
        { friendshipStatus: 'accepted' },
      )
    })
    expect(screen.getByText(/你們已經成為好友/)).toBeInTheDocument()
  })

  it('opens a chat room from an accepted friend loaded from the backend', async () => {
    const user = userEvent.setup()
    mockWorkspaceSnapshot({
      friends: [
        {
          id: 'friendship-accepted',
          requesterId: 'user-1',
          requesterName: '學良',
          requesterEmail: 'garden@example.com',
          addresseeId: 'friend-accepted',
          addresseeName: '真實好友',
          addresseeEmail: 'accepted@example.com',
          addresseeAvatarUrl: 'https://example.com/avatar.jpg',
          addresseeStatus: '正在整理相簿',
          addresseeTone: 'green',
          friendshipStatus: 'accepted',
        },
      ],
    })
    await renderAuthenticatedApp()

    await user.click(within(screen.getByLabelText('紙質側邊導覽')).getByRole('button', { name: '好友' }))
    expect(await screen.findByRole('button', { name: /真實好友/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '傳訊息' }))

    expect(await screen.findByLabelText('聊天室功能區')).toBeInTheDocument()
    expect(screen.getByText(/個人聊天室 · 真實好友/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('回覆文字'), '這是好友頁開啟的訊息')
    await user.click(screen.getByRole('button', { name: '傳送文字' }))
    expect(screen.getByText('這是好友頁開啟的訊息')).toBeInTheDocument()
  })

  it('deletes the friendship record rather than the profile id', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderAuthenticatedApp()

    await createFriend(user, '可刪除好友')
    await user.click(within(screen.getByLabelText('紙質側邊導覽')).getByRole('button', { name: '好友' }))
    expect(await screen.findByRole('button', { name: /可刪除好友/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '刪除好友' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(apiMocks.callApi).toHaveBeenCalledWith('DELETE', '/friends/friendship-12345')
    confirmSpy.mockRestore()
  })

  it('accepts an incoming invite and links the accepted friend to chat', async () => {
    const user = userEvent.setup()
    mockWorkspaceSnapshot({
      friends: [
        {
          id: 'friendship-incoming',
          requesterId: 'friend-incoming',
          requesterName: '邀請好友',
          requesterEmail: 'invite@example.com',
          requesterAvatarUrl: 'https://example.com/invite.jpg',
          requesterStatus: '等你一起寫筆記',
          requesterTone: 'green',
          addresseeId: 'user-1',
          addresseeName: '學良',
          addresseeEmail: 'garden@example.com',
          friendshipStatus: 'pending',
        },
      ],
    })
    await renderAuthenticatedApp()

    await user.click(within(screen.getByLabelText('紙質側邊導覽')).getByRole('button', { name: '好友' }))
    await user.click(screen.getByRole('button', { name: '邀請' }))
    await user.click(await screen.findByRole('button', { name: /收到好友邀請/ }))
    await user.click(screen.getByRole('button', { name: /接受好友邀請/ }))

    expect(apiMocks.callApi).toHaveBeenCalledWith(
      'PATCH',
      '/friends/friendship-incoming',
      { friendshipStatus: 'accepted' },
    )
    expect(await screen.findByRole('button', { name: /等你一起寫筆記/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '傳訊息' }))
    expect(await screen.findByLabelText('聊天室功能區')).toBeInTheDocument()
    expect(screen.getByText(/個人聊天室 · 邀請好友/)).toBeInTheDocument()
  })

  it('does not show pending relationships as real friends in the friend detail pane', async () => {
    const user = userEvent.setup()
    mockWorkspaceSnapshot({
      friends: [
        {
          id: 'friendship-pending',
          requesterId: 'user-1',
          requesterName: '學良',
          requesterEmail: 'garden@example.com',
          addresseeId: 'pending-friend',
          addresseeName: '尚未接受的人',
          addresseeEmail: 'pending@example.com',
          addresseeStatus: '還沒接受邀請',
          addresseeTone: 'green',
          friendshipStatus: 'pending',
        },
      ],
    })
    await renderAuthenticatedApp()

    await user.click(within(screen.getByLabelText('紙質側邊導覽')).getByRole('button', { name: '好友' }))
    const friendBook = await screen.findByLabelText('好友手札活頁本')

    expect(within(friendBook).getByText('共 0 個項目')).toBeInTheDocument()
    expect(within(friendBook).queryByRole('heading', { name: '尚未接受的人' })).not.toBeInTheDocument()
    expect(within(friendBook).getByText('目前沒有已接受的好友，先從「邀請」分頁新增或接受好友。')).toBeInTheDocument()
  })

  it('shares new chat posts with accepted friends only', async () => {
    const user = userEvent.setup()
    mockWorkspaceSnapshot({
      friends: [
        {
          id: 'friendship-accepted',
          requesterId: 'user-1',
          requesterName: '學良',
          requesterEmail: 'garden@example.com',
          addresseeId: 'accepted-friend',
          addresseeName: '已接受好友',
          addresseeEmail: 'accepted@example.com',
          addresseeStatus: '可以看到貼文',
          addresseeTone: 'green',
          friendshipStatus: 'accepted',
        },
        {
          id: 'friendship-pending',
          requesterId: 'user-1',
          requesterName: '學良',
          requesterEmail: 'garden@example.com',
          addresseeId: 'pending-friend',
          addresseeName: '待接受好友',
          addresseeEmail: 'pending@example.com',
          addresseeStatus: '還沒接受',
          addresseeTone: 'amber',
          friendshipStatus: 'pending',
        },
      ],
    })
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '聊天' }))
    await user.click(screen.getByRole('button', { name: '發一則貼文' }))
    await user.type(screen.getByLabelText('貼文內容'), '給真正好友看的近況')
    await user.click(screen.getByRole('button', { name: '儲存貼文' }))

    await waitFor(() => {
      expect(apiMocks.callApi).toHaveBeenCalledWith(
        'POST',
        '/chat-posts',
        expect.objectContaining({
          text: '給真正好友看的近況',
          visibleToUserIds: ['accepted-friend'],
        }),
      )
    })
  })

  it('refreshes accepted friends before sharing when chat opens before friends finish loading', async () => {
    const user = userEvent.setup()
    let friendFetches = 0

    apiMocks.callApi.mockImplementation((method: string, path: string, payload?: MockApiPayload) => {
      if (method === 'GET' && path === '/friends') {
        friendFetches += 1
        return Promise.resolve(
          friendFetches === 1
            ? []
            : [
                {
                  id: 'friendship-refreshed',
                  requesterId: 'user-1',
                  requesterName: '學良',
                  requesterEmail: 'garden@example.com',
                  addresseeId: 'accepted-after-refresh',
                  addresseeName: '載入後好友',
                  addresseeEmail: 'after-refresh@example.com',
                  friendshipStatus: 'accepted',
                },
              ],
        )
      }
      if (method === 'GET' && path.startsWith('/profiles/search')) {
        return Promise.resolve(null)
      }
      if (method === 'GET') {
        return Promise.resolve([])
      }
      if (method === 'POST' && path === '/chat-posts') {
        return Promise.resolve({ id: 'post-after-refresh', ...(payload ?? {}) })
      }
      return Promise.resolve(null)
    })

    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '聊天' }))
    await user.click(screen.getByRole('button', { name: '發一則貼文' }))
    await user.type(screen.getByLabelText('貼文內容'), '剛登入也要分享給好友')
    await user.click(screen.getByRole('button', { name: '儲存貼文' }))

    await waitFor(() => {
      expect(apiMocks.callApi).toHaveBeenCalledWith(
        'POST',
        '/chat-posts',
        expect.objectContaining({
          text: '剛登入也要分享給好友',
          visibleToUserIds: ['accepted-after-refresh'],
        }),
      )
    })
    expect(friendFetches).toBeGreaterThanOrEqual(2)
  })

  it('gives album photo upload a clear per-album entry point', async () => {
    const user = userEvent.setup()
    await renderAuthenticatedApp()

    await user.click(screen.getByRole('button', { name: '相簿' }))
    await user.click(screen.getByRole('button', { name: '+ 新增週別' }))
    await user.type(screen.getByLabelText('相簿標題 (必填)'), '第一本相簿')
    await user.click(screen.getByRole('button', { name: '建立相簿' }))

    await user.click(screen.getByRole('button', { name: '新增照片到第一本相簿' }))
    await user.type(screen.getByLabelText('照片手寫字標題 (必填)'), '第一張照片')
    await user.type(screen.getByLabelText('照片圖片網址 (貼上連結)'), 'https://example.com/photo.jpg')
    await user.click(screen.getByRole('button', { name: '確認加入' }))

    expect(screen.getByDisplayValue('第一張照片')).toBeInTheDocument()
  })
})

