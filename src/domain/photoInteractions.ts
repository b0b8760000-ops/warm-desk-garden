import type { Photo, PhotoComment, UserId } from './types'

export function isPhotoLikedBy(photo: Pick<Photo, 'likedByUserIds' | 'isStarred'>, userId: UserId) {
  return photo.likedByUserIds?.includes(userId) ?? !!photo.isStarred
}

export function togglePhotoLikeForUser(photo: Photo, userId: UserId): Photo {
  const current = photo.likedByUserIds ?? []
  const isLiked = current.includes(userId)
  const likedByUserIds = isLiked
    ? current.filter((id) => id !== userId)
    : [...new Set([...current, userId])]

  return {
    ...photo,
    likedByUserIds,
    isStarred: likedByUserIds.length > 0,
  }
}

export function addPhotoComment(photo: Photo, comment: PhotoComment): Photo {
  return {
    ...photo,
    comments: [...(photo.comments ?? []), comment],
  }
}
