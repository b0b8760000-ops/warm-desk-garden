import { describe, expect, it } from 'vitest'
import { buildFriendshipRequestDocument } from './friendships'

describe('friendship document helpers', () => {
  it('builds friend invites from trusted profile records instead of client payload', () => {
    expect(
      buildFriendshipRequestDocument({
        currentUser: {
          id: 'requester-1',
          email: 'requester@app.test',
          name: 'Requester Auth Name',
        },
        requesterProfile: {
          userId: 'requester-1',
          name: 'Requester Profile',
          email: 'requester-profile@app.test',
          avatarUrl: 'https://example.com/requester.png',
          status: 'Writing notes',
          tone: 'amber',
        },
        addresseeProfile: {
          userId: 'friend-1',
          name: 'Trusted Friend',
          email: 'trusted@app.test',
          avatarUrl: 'https://example.com/friend.png',
          status: 'Reading',
          tone: 'green',
        },
        now: '2026-06-29T00:00:00.000Z',
      }),
    ).toMatchObject({
      requesterId: 'requester-1',
      requesterName: 'Requester Profile',
      requesterEmail: 'requester-profile@app.test',
      requesterAvatarUrl: 'https://example.com/requester.png',
      requesterStatus: 'Writing notes',
      requesterTone: 'amber',
      addresseeId: 'friend-1',
      addresseeName: 'Trusted Friend',
      addresseeEmail: 'trusted@app.test',
      addresseeAvatarUrl: 'https://example.com/friend.png',
      addresseeStatus: 'Reading',
      addresseeTone: 'green',
      friendshipStatus: 'pending',
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
    })
  })

  it('falls back to the authenticated requester when their profile is missing', () => {
    expect(
      buildFriendshipRequestDocument({
        currentUser: {
          id: 'requester-1',
          email: 'requester@app.test',
          name: 'Requester Auth Name',
        },
        requesterProfile: null,
        addresseeProfile: {
          userId: 'friend-1',
          name: 'Trusted Friend',
          email: 'trusted@app.test',
        },
        now: '2026-06-29T00:00:00.000Z',
      }),
    ).toMatchObject({
      requesterName: 'Requester Auth Name',
      requesterEmail: 'requester@app.test',
      addresseeName: 'Trusted Friend',
      addresseeEmail: 'trusted@app.test',
    })
  })
})
