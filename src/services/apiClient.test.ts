import { afterEach, describe, expect, it, vi } from 'vitest'

const appwriteMocks = vi.hoisted(() => ({
  createAppwriteJwt: vi.fn(),
}))

vi.mock('./appwriteClient', () => ({
  createAppwriteJwt: appwriteMocks.createAppwriteJwt,
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('api client file uploads', () => {
  it('uses same-origin API paths when no Render URL override is configured', async () => {
    vi.stubEnv('VITE_RENDER_API_URL', '')
    appwriteMocks.createAppwriteJwt.mockResolvedValue({ jwt: 'jwt-token' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'friend-1', name: '好友' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { callApi } = await import('./apiClient')

    await expect(
      callApi('GET', '/profiles/search?email=friend@example.com'),
    ).resolves.toEqual({ id: 'friend-1', name: '好友' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profiles/search?email=friend@example.com',
      expect.objectContaining({
        method: 'GET',
        headers: {
          authorization: 'Bearer jwt-token',
          'content-type': 'application/json',
        },
      }),
    )
  })

  it('explains browser-level backend connection failures', async () => {
    vi.stubEnv('VITE_RENDER_API_URL', 'https://render.example.com')
    appwriteMocks.createAppwriteJwt.mockResolvedValue({ jwt: 'jwt-token' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const { callApi } = await import('./apiClient')

    await expect(callApi('GET', '/profiles/search?email=friend@example.com')).rejects.toThrow(
      '無法連線到後端 API，請確認 Render 服務與 CORS 設定。',
    )
  })

  it('uploads files through the Render API instead of browser Appwrite Storage', async () => {
    vi.stubEnv('VITE_RENDER_API_URL', 'https://render.example.com')
    appwriteMocks.createAppwriteJwt.mockResolvedValue({ jwt: 'jwt-token' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://files.example.com/photo.png' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { uploadFile, uploadFileForDisplay } = await import('./apiClient')
    const file = new File(['photo'], 'photo.png', { type: 'image/png' })

    await expect(uploadFileForDisplay(file, ['friend-1'], 'chat')).resolves.toBe(
      'https://files.example.com/photo.png',
    )
    await expect(uploadFile(file, ['friend-1'], 'chat')).resolves.toEqual({
      url: 'https://files.example.com/photo.png',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://render.example.com/api/files',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer jwt-token',
        },
        body: expect.any(FormData),
      }),
    )

    const formData = fetchMock.mock.calls[0][1].body as FormData
    expect(formData.get('file')).toBe(file)
    expect(formData.get('readUserIds')).toBe('["friend-1"]')
    expect(formData.get('category')).toBe('chat')
  })
})
