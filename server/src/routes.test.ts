import { describe, expect, it } from 'vitest'
import { collections } from './collections'
import {
  friendshipPairQuery,
  matchRoute,
  normalizePath,
  ownerScopedQuery,
  shouldAcceptReciprocalFriendship,
} from './routes'

describe('Render API routes', () => {
  it('normalizes missing leading slash', () => {
    expect(normalizePath('folders')).toBe('/folders')
  })

  it('matches collection routes with optional ids', () => {
    expect(matchRoute('/chat-posts/post-1')).toEqual({
      collection: 'chatPosts',
      id: 'post-1',
      resource: 'chat-posts',
    })
  })

  it('matches expanded workspace collections', () => {
    expect(matchRoute('/note-attachments/attachment-1')).toEqual({
      collection: 'noteAttachments',
      id: 'attachment-1',
      resource: 'note-attachments',
    })
    expect(matchRoute('/reflections')).toEqual({
      collection: 'reflections',
      id: undefined,
      resource: 'reflections',
    })
    expect(matchRoute('/chat-messages/message-1')).toEqual({
      collection: 'chatMessages',
      id: 'message-1',
      resource: 'chat-messages',
    })
    expect(matchRoute('/friend-groups/group-1')).toEqual({
      collection: 'friendGroups',
      id: 'group-1',
      resource: 'friend-groups',
    })
  })

  it('rejects unknown collection routes', () => {
    expect(matchRoute('/unknown')).toBeNull()
  })

  it('targets an existing friendship pair in either direction', () => {
    expect(friendshipPairQuery('user-a', 'user-b')).toEqual({
      $or: [
        { requesterId: 'user-a', addresseeId: 'user-b' },
        { requesterId: 'user-b', addresseeId: 'user-a' },
      ],
    })
  })

  it('accepts a reciprocal pending invite instead of creating a second request', () => {
    expect(
      shouldAcceptReciprocalFriendship(
        {
          requesterId: 'user-b',
          addresseeId: 'user-a',
          friendshipStatus: 'pending',
        },
        'user-a',
      ),
    ).toBe(true)

    expect(
      shouldAcceptReciprocalFriendship(
        {
          requesterId: 'user-a',
          addresseeId: 'user-b',
          friendshipStatus: 'pending',
        },
        'user-a',
      ),
    ).toBe(false)
  })

  it('lets friends read shared album and photo records', () => {
    expect(ownerScopedQuery(collections.albums, 'friend-1')).toEqual({
      $or: [{ ownerId: 'friend-1' }, { visibleToUserIds: 'friend-1' }],
    })
    expect(ownerScopedQuery(collections.photos, 'friend-1')).toEqual({
      $or: [{ ownerId: 'friend-1' }, { visibleToUserIds: 'friend-1' }],
    })
    expect(ownerScopedQuery(collections.chatThreads, 'friend-1')).toEqual({
      $or: [{ ownerId: 'friend-1' }, { visibleToUserIds: 'friend-1' }],
    })
  })

  it('lets friends read shared folders, notes, and note attachments', () => {
    expect(ownerScopedQuery(collections.folders, 'friend-1')).toEqual({
      $or: [{ ownerId: 'friend-1' }, { visibleToUserIds: 'friend-1' }],
    })
    expect(ownerScopedQuery(collections.notes, 'friend-1')).toEqual({
      $or: [{ ownerId: 'friend-1' }, { visibleToUserIds: 'friend-1' }],
    })
    expect(ownerScopedQuery(collections.noteAttachments, 'user-1')).toEqual({
      $or: [{ ownerId: 'user-1' }, { visibleToUserIds: 'user-1' }],
    })
  })
})
