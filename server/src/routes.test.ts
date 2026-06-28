import { describe, expect, it } from 'vitest'
import { matchRoute, normalizePath } from './routes'

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
})
