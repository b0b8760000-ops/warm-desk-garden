import type { CurrentUser } from './auth.js'

export type ProfileRecord = {
  userId?: string
  name?: string
  email?: string
  avatarUrl?: string
  status?: string
  tone?: 'green' | 'amber' | 'gray'
}

type BuildFriendshipRequestInput = {
  currentUser: CurrentUser
  requesterProfile: ProfileRecord | null
  addresseeProfile: ProfileRecord
  now: string
}

function profileName(profile: ProfileRecord | null, fallback = '') {
  return profile?.name || fallback
}

function profileEmail(profile: ProfileRecord | null, fallback = '') {
  return profile?.email || fallback
}

function profileTone(profile: ProfileRecord | null) {
  return profile?.tone || 'green'
}

export function buildFriendshipRequestDocument({
  currentUser,
  requesterProfile,
  addresseeProfile,
  now,
}: BuildFriendshipRequestInput) {
  return {
    requesterId: currentUser.id,
    requesterName: profileName(requesterProfile, currentUser.name || currentUser.email),
    requesterEmail: profileEmail(requesterProfile, currentUser.email),
    requesterAvatarUrl: requesterProfile?.avatarUrl,
    requesterStatus: requesterProfile?.status || '',
    requesterTone: profileTone(requesterProfile),
    addresseeId: addresseeProfile.userId,
    addresseeName: profileName(addresseeProfile, addresseeProfile.email),
    addresseeEmail: profileEmail(addresseeProfile),
    addresseeAvatarUrl: addresseeProfile.avatarUrl,
    addresseeStatus: addresseeProfile.status || '',
    addresseeTone: profileTone(addresseeProfile),
    friendshipStatus: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  }
}
