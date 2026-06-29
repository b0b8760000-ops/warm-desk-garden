import { describe, expect, it } from 'vitest'
import { addPhotoComment, isPhotoLikedBy, togglePhotoLikeForUser } from './photoInteractions'
import type { Photo } from './types'

const photo = (overrides: Partial<Photo> = {}): Photo => ({
  id: 'photo-1',
  title: 'Photo',
  imageUrl: 'https://example.com/photo.jpg',
  ...overrides,
})

describe('photo interactions', () => {
  it('toggles photo likes per signed-in user', () => {
    const liked = togglePhotoLikeForUser(photo(), 'user-1')

    expect(liked.likedByUserIds).toEqual(['user-1'])
    expect(liked.isStarred).toBe(true)
    expect(isPhotoLikedBy(liked, 'user-1')).toBe(true)

    const unliked = togglePhotoLikeForUser(liked, 'user-1')

    expect(unliked.likedByUserIds).toEqual([])
    expect(unliked.isStarred).toBe(false)
  })

  it('adds comments without dropping existing comments', () => {
    const updated = addPhotoComment(
      photo({
        comments: [
          {
            id: 'comment-1',
            authorId: 'friend-1',
            author: 'Friend',
            avatarUrl: '',
            timeLabel: '剛剛',
            text: 'First',
          },
        ],
      }),
      {
        id: 'comment-2',
        authorId: 'user-1',
        author: '我',
        avatarUrl: '',
        timeLabel: '剛剛',
        text: 'Second',
      },
    )

    expect(updated.comments?.map((comment) => comment.text)).toEqual(['First', 'Second'])
  })
})
