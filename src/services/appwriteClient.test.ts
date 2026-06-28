import { Permission, Role } from 'appwrite'
import { describe, expect, it } from 'vitest'
import { buildOwnerFilePermissions } from './appwriteClient'

describe('appwrite file permissions', () => {
  it('scopes uploaded files to the current owner', () => {
    expect(buildOwnerFilePermissions('user-1')).toEqual([
      Permission.read(Role.user('user-1')),
      Permission.update(Role.user('user-1')),
      Permission.delete(Role.user('user-1')),
    ])
  })
})
