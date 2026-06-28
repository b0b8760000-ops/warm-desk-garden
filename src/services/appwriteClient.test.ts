import { Permission, Role } from 'appwrite'
import { describe, expect, it } from 'vitest'
import { buildFileViewUrl, buildOwnerFilePermissions } from './appwriteClient'

describe('appwrite file permissions', () => {
  it('scopes uploaded files to the current owner', () => {
    expect(buildOwnerFilePermissions('user-1')).toEqual([
      Permission.read(Role.user('user-1')),
      Permission.update(Role.user('user-1')),
      Permission.delete(Role.user('user-1')),
    ])
  })

  it('builds authenticated Appwrite file view URLs without exposing secrets', () => {
    expect(
      buildFileViewUrl('file 1', {
        endpoint: 'https://sgp.cloud.appwrite.io/v1/',
        projectId: 'project-1',
        bucketId: 'warm-desk-garden-files',
      }),
    ).toBe(
      'https://sgp.cloud.appwrite.io/v1/storage/buckets/warm-desk-garden-files/files/file%201/view?project=project-1',
    )
  })
})
