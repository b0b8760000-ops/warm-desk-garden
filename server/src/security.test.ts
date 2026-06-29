import { describe, expect, it } from 'vitest'
import { collections } from './collections'
import {
  chatPostRooms,
  sanitizeCalendarEventCreate,
  sanitizeCalendarEventPatch,
  sanitizeCalendarTaskCreate,
  sanitizeCalendarTaskPatch,
  sanitizeFriendshipPatch,
  sanitizeWorkspacePatch,
} from './security'

describe('backend security helpers', () => {
  it('keeps generic PATCH payloads from changing ownership or system fields', () => {
    expect(
      sanitizeWorkspacePatch(collections.notes, {
        title: 'Updated title',
        ownerId: 'attacker',
        requesterId: 'attacker',
        createdAt: '2020-01-01T00:00:00.000Z',
        _id: 'mongo-id',
        id: 'client-id',
      }),
    ).toEqual({ title: 'Updated title' })
  })

  it('allows file metadata fields without allowing ownership changes', () => {
    expect(
      sanitizeWorkspacePatch(collections.noteAttachments, {
        noteId: 'note-1',
        fileId: 'file-1',
        bucketId: 'warm-desk-garden-files',
        storagePath: 'notes/user-1/file-1/note.png',
        category: 'notes',
        url: 'https://files.example.com/note.png',
        ownerId: 'attacker',
      }),
    ).toEqual({
      noteId: 'note-1',
      fileId: 'file-1',
      bucketId: 'warm-desk-garden-files',
      storagePath: 'notes/user-1/file-1/note.png',
      category: 'notes',
      url: 'https://files.example.com/note.png',
    })
  })

  it('allows shared visibility on folders, notes, and note attachments only for accepted friends', () => {
    expect(
      sanitizeWorkspacePatch(
        collections.folders,
        {
          name: 'Shared shelf',
          visibility: 'shared',
          visibleToUserIds: ['friend-1', 'stranger', 'friend-1'],
        },
        ['friend-1'],
      ),
    ).toEqual({
      name: 'Shared shelf',
      visibility: 'shared',
      visibleToUserIds: ['friend-1'],
    })

    expect(
      sanitizeWorkspacePatch(
        collections.notes,
        {
          folderId: 'folder-1',
          title: 'Shared note',
          visibility: 'shared',
          visibleToUserIds: ['friend-1'],
        },
        ['friend-1'],
      ),
    ).toEqual({
      folderId: 'folder-1',
      title: 'Shared note',
      visibility: 'shared',
      visibleToUserIds: ['friend-1'],
    })

    expect(
      sanitizeWorkspacePatch(
        collections.noteAttachments,
        {
          noteId: 'note-1',
          name: 'photo.png',
          visibility: 'private',
          visibleToUserIds: ['friend-1'],
        },
        ['friend-1'],
      ),
    ).toEqual({
      noteId: 'note-1',
      name: 'photo.png',
      visibility: 'private',
      visibleToUserIds: [],
    })
  })

  it('does not trust client-provided participants when creating shared calendar events', () => {
    expect(
      sanitizeCalendarEventCreate(
        {
          title: 'Shared plan',
          startsAt: '2026-06-28T10:00:00.000Z',
          endsAt: '2026-06-28T11:00:00.000Z',
          ownerId: 'attacker',
          participantIds: ['friend-1'],
        },
        'owner-1',
        '2026-06-28T09:00:00.000Z',
      ),
    ).toMatchObject({
      title: 'Shared plan',
      ownerId: 'owner-1',
      participantIds: [],
      createdAt: '2026-06-28T09:00:00.000Z',
      updatedAt: '2026-06-28T09:00:00.000Z',
    })
  })

  it('does not trust client-provided assignees when creating tasks', () => {
    expect(
      sanitizeCalendarTaskCreate(
        {
          title: 'Private task',
          dueAt: '2026-06-28T12:00:00.000Z',
          priority: 'high',
          ownerId: 'attacker',
          assigneeIds: ['friend-1'],
          completedAt: '2020-01-01T00:00:00.000Z',
        },
        'owner-1',
        '2026-06-28T09:00:00.000Z',
      ),
    ).toMatchObject({
      ownerId: 'owner-1',
      assigneeIds: [],
      completedAt: null,
    })
  })

  it('lets task assignees update only completion state', () => {
    expect(
      sanitizeCalendarTaskPatch(
        {
          title: 'Taken over',
          ownerId: 'attacker',
          completedAt: '2026-06-28T12:00:00.000Z',
        },
        'assignee',
      ),
    ).toEqual({ completedAt: '2026-06-28T12:00:00.000Z' })
  })

  it('keeps calendar event patches on editable fields only', () => {
    expect(
      sanitizeCalendarEventPatch({
        title: 'Updated event',
        ownerId: 'attacker',
        participantIds: ['friend-2'],
        createdAt: '2020-01-01T00:00:00.000Z',
      }),
    ).toEqual({ title: 'Updated event' })
  })

  it('lets event owners update only accepted friend participants', () => {
    expect(
      sanitizeCalendarEventPatch(
        {
          title: 'Updated shared event',
          participantIds: ['friend-1', 'friend-1', 'stranger'],
        },
        ['friend-1'],
      ),
    ).toEqual({
      title: 'Updated shared event',
      participantIds: ['friend-1'],
    })
  })

  it('only lets the addressee accept a friendship invite', () => {
    const friendship = {
      requesterId: 'sender-1',
      addresseeId: 'receiver-1',
      friendshipStatus: 'pending',
    }

    expect(
      sanitizeFriendshipPatch(
        { friendshipStatus: 'accepted', requesterId: 'attacker' },
        friendship,
        'receiver-1',
      ),
    ).toEqual({ friendshipStatus: 'accepted' })

    expect(
      sanitizeFriendshipPatch({ friendshipStatus: 'accepted' }, friendship, 'sender-1'),
    ).toEqual({})
  })

  it('allows friendship status transitions without exposing relationship ownership', () => {
    expect(
      sanitizeWorkspacePatch(collections.friendships, {
        friendshipStatus: 'accepted',
        requesterId: 'attacker',
        addresseeId: 'other-user',
        createdAt: '2020-01-01T00:00:00.000Z',
      }),
    ).toEqual({ friendshipStatus: 'accepted' })
  })

  it('targets chat realtime delivery to the owner and explicitly visible users only', () => {
    expect(
      chatPostRooms({
        ownerId: 'owner-1',
        visibleToUserIds: ['friend-1', 'friend-1', 'friend-2'],
      }),
    ).toEqual(['user:owner-1', 'user:friend-1', 'user:friend-2'])
  })
})
