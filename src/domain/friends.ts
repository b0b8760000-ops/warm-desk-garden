import type { Friend } from './types'

type FriendshipStatusOnly = Pick<Friend, 'friendshipStatus'>

export function isAcceptedFriend(friend: FriendshipStatusOnly) {
  return friend.friendshipStatus === 'accepted'
}

export function getAcceptedFriends<T extends FriendshipStatusOnly>(friends: T[]) {
  return friends.filter(isAcceptedFriend)
}

export function getAcceptedFriendIds<T extends Pick<Friend, 'id' | 'friendshipStatus'>>(
  friends: T[],
) {
  return [...new Set(getAcceptedFriends(friends).map((friend) => friend.id).filter(Boolean))]
}
