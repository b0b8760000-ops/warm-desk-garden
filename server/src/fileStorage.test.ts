import { describe, expect, it } from 'vitest'
import {
  buildAppwriteFileViewUrl,
  buildFilePermissions,
  filterAcceptedReadUserIds,
  parseFileCategory,
  parseReadUserIds,
} from './fileStorage'

describe('file storage helpers', () => {
  it('parses requested reader ids from multipart form values', () => {
    expect(parseReadUserIds('["friend-1","friend-1","friend-2"]')).toEqual([
      'friend-1',
      'friend-2',
    ])
    expect(parseReadUserIds('friend-3, friend-4')).toEqual(['friend-3', 'friend-4'])
    expect(parseReadUserIds(undefined)).toEqual([])
  })

  it('keeps Appwrite read permissions limited to accepted friends', () => {
    expect(
      filterAcceptedReadUserIds(
        ['friend-1', 'pending-friend', 'friend-1'],
        ['friend-1', 'friend-2'],
      ),
    ).toEqual(['friend-1'])
  })

  it('builds owner permissions on the backend instead of the browser', () => {
    expect(buildFilePermissions('owner-1', ['friend-1', 'friend-1'])).toEqual([
      'read("user:owner-1")',
      'read("user:friend-1")',
      'update("user:owner-1")',
      'delete("user:owner-1")',
    ])
  })

  it('builds an Appwrite view URL from backend environment values', () => {
    expect(
      buildAppwriteFileViewUrl('file 1', {
        APPWRITE_ENDPOINT: 'https://sgp.cloud.appwrite.io/v1/',
        APPWRITE_PROJECT_ID: 'project-1',
        APPWRITE_BUCKET_ID: 'warm-desk-garden-files',
      }),
    ).toBe(
      'https://sgp.cloud.appwrite.io/v1/storage/buckets/warm-desk-garden-files/files/file%201/view?project=project-1',
    )
  })

  it('keeps file categories limited to the current bucket taxonomy', () => {
    expect(parseFileCategory('avatars')).toBe('avatars')
    expect(parseFileCategory('chat')).toBe('chat')
    expect(parseFileCategory('unknown-area')).toBe('notes')
  })
})
