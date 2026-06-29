import { describe, expect, it } from 'vitest'
import { getAcceptedFriendIds, getAcceptedFriends, isAcceptedFriend } from './friends'
import type { Friend } from './types'

const friend = (overrides: Partial<Friend>): Friend => ({
  id: 'friend-1',
  name: 'Friend',
  status: '',
  avatarUrl: '',
  tone: 'green',
  ...overrides,
})

describe('accepted friend helpers', () => {
  it('only treats explicit accepted friendships as real friends', () => {
    expect(isAcceptedFriend(friend({ friendshipStatus: 'accepted' }))).toBe(true)
    expect(isAcceptedFriend(friend({ friendshipStatus: 'pending' }))).toBe(false)
    expect(isAcceptedFriend(friend({}))).toBe(false)

    expect(
      getAcceptedFriends([
        friend({ id: 'accepted', friendshipStatus: 'accepted' }),
        friend({ id: 'pending', friendshipStatus: 'pending' }),
        friend({ id: 'legacy' }),
      ]).map((item) => item.id),
    ).toEqual(['accepted'])
  })

  it('deduplicates accepted friend ids for sharing', () => {
    expect(
      getAcceptedFriendIds([
        friend({ id: 'friend-1', friendshipStatus: 'accepted' }),
        friend({ id: 'friend-1', friendshipStatus: 'accepted' }),
        friend({ id: 'pending-friend', friendshipStatus: 'pending' }),
        friend({ id: 'legacy-friend' }),
      ]),
    ).toEqual(['friend-1'])
  })
})
