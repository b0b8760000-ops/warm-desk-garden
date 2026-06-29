# Shared Friend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make accepted friendships the single source of truth for chat sharing, album/photo visibility, and shared calendar participants.

**Architecture:** Add small domain helpers for accepted-friend filtering and friendship projection, then use those helpers from the React shell. Tighten Render API rules so only the addressee can accept an invite, friend invite creation reads trusted profile data from MongoDB, and calendar event participant patches are filtered to accepted friends.

**Tech Stack:** React, TypeScript, Express, MongoDB, Appwrite Auth/Storage, Vitest.

---

### Task 1: Accepted Friends Helper

**Files:**
- Create: `src/domain/friends.ts`
- Create: `src/domain/friends.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { getAcceptedFriends, getAcceptedFriendIds } from './friends'
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
      ]),
    ).toEqual(['friend-1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/friends.test.ts`

Expected: FAIL because `src/domain/friends.ts` does not exist.

- [ ] **Step 3: Implement helper**

```ts
import type { Friend } from './types'

export function isAcceptedFriend(friend: Pick<Friend, 'friendshipStatus'>) {
  return friend.friendshipStatus === 'accepted'
}

export function getAcceptedFriends<T extends Pick<Friend, 'friendshipStatus'>>(friends: T[]) {
  return friends.filter(isAcceptedFriend)
}

export function getAcceptedFriendIds<T extends Pick<Friend, 'id' | 'friendshipStatus'>>(friends: T[]) {
  return [...new Set(getAcceptedFriends(friends).map((friend) => friend.id).filter(Boolean))]
}
```

- [ ] **Step 4: Replace all `friendshipStatus === 'accepted' || !friendshipStatus` checks**

Use `getAcceptedFriends()` and `getAcceptedFriendIds()` in `src/App.tsx`.

- [ ] **Step 5: Verify**

Run: `npx vitest run src/domain/friends.test.ts src/App.test.tsx`

Expected: PASS.

### Task 2: Backend Friendship Trust Boundaries

**Files:**
- Modify: `server/src/security.ts`
- Modify: `server/src/security.test.ts`
- Modify: `server/src/api.ts`

- [ ] **Step 1: Write failing backend security tests**

Add tests that prove friendship PATCH cannot set owner fields and calendar patches can allow only accepted participant ids.

- [ ] **Step 2: Run red tests**

Run: `npx vitest run server/src/security.test.ts`

Expected: FAIL until `sanitizeCalendarEventPatch` accepts allowed participant ids.

- [ ] **Step 3: Implement sanitizer updates**

Allow `participantIds` only when the caller passes accepted friend ids. Keep default behavior unchanged.

- [ ] **Step 4: Tighten API route behavior**

For `POST /friends`, look up `profiles.userId = addresseeId` and build friendship fields from the trusted profile. For `PATCH /friends/:id`, only allow `{ friendshipStatus: 'accepted' }` when `addresseeId === currentUser.id`.

- [ ] **Step 5: Verify**

Run: `npx vitest run server/src/security.test.ts server/src/routes.test.ts`.

Expected: PASS.

### Task 3: Calendar Participant Persistence

**Files:**
- Modify: `server/src/api.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add failing test for shared event participant ids**

Use accepted and pending friendship fixtures. Creating or updating a shared event must send/persist only accepted friend ids.

- [ ] **Step 2: Run red tests**

Run: `npx vitest run src/App.test.tsx server/src/security.test.ts`

Expected: FAIL if pending/legacy friends leak into participants or if patches drop participant ids.

- [ ] **Step 3: Implement participant filtering**

Frontend uses `getAcceptedFriendIds()`. Backend filters participant ids through `getAcceptedFriendIds(user.id)` on create and update.

- [ ] **Step 4: Verify**

Run: `npm test`.

Expected: PASS.

### Task 4: Build and Deployment Check

**Files:**
- Modify only files touched above.

- [ ] **Step 1: Full verification**

Run:

```powershell
npm test
npm run build
npm run server:build
```

- [ ] **Step 2: Commit and push**

Run:

```powershell
git add .
git commit -m "fix: unify accepted friend sharing"
git push origin main
```

- [ ] **Step 3: Confirm deployment**

Check GitHub Actions for `main` and verify the GitHub Pages URL after deploy.
