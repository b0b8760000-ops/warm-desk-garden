import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appwriteAccount,
  registerWithEmail,
  signInWithEmail,
} from './appwriteClient'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('appwrite auth client', () => {
  it('signs in and returns the normalized current user', async () => {
    const createSession = vi
      .spyOn(appwriteAccount, 'createEmailPasswordSession')
      .mockResolvedValue({} as Awaited<ReturnType<typeof appwriteAccount.createEmailPasswordSession>>)
    vi.spyOn(appwriteAccount, 'get').mockResolvedValue({
      $id: 'user-1',
      email: 'garden@example.com',
      name: '學良',
    } as Awaited<ReturnType<typeof appwriteAccount.get>>)

    await expect(signInWithEmail('garden@example.com', 'password123')).resolves.toEqual({
      id: 'user-1',
      email: 'garden@example.com',
      name: '學良',
    })
    expect(createSession).toHaveBeenCalledWith('garden@example.com', 'password123')
  })

  it('registers an account before opening an email password session', async () => {
    const createUser = vi
      .spyOn(appwriteAccount, 'create')
      .mockResolvedValue({} as Awaited<ReturnType<typeof appwriteAccount.create>>)
    const createSession = vi
      .spyOn(appwriteAccount, 'createEmailPasswordSession')
      .mockResolvedValue({} as Awaited<ReturnType<typeof appwriteAccount.createEmailPasswordSession>>)
    vi.spyOn(appwriteAccount, 'get').mockResolvedValue({
      $id: 'user-2',
      email: 'new-garden@example.com',
      name: '新朋友',
    } as Awaited<ReturnType<typeof appwriteAccount.get>>)

    await expect(registerWithEmail('new-garden@example.com', 'password123', '新朋友')).resolves.toEqual({
      id: 'user-2',
      email: 'new-garden@example.com',
      name: '新朋友',
    })
    expect(createUser).toHaveBeenCalledWith(
      expect.any(String),
      'new-garden@example.com',
      'password123',
      '新朋友',
    )
    expect(createSession).toHaveBeenCalledWith('new-garden@example.com', 'password123')
  })
})
