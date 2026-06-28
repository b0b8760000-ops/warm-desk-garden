import { describe, expect, it } from 'vitest'
import { friendshipPairQuery, matchRoute, normalizePath, shouldAcceptReciprocalFriendship } from './routes'

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
})
