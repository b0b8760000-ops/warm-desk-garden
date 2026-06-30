import { describe, expect, it } from 'vitest'
import { buildAllowedOrigins, isCorsOriginAllowed } from './corsPolicy'

describe('backend CORS policy', () => {
  it('keeps local Vite origins allowed even when production origins are configured', () => {
    const origins = buildAllowedOrigins('https://warm-desk-garden.onrender.com')

    expect(isCorsOriginAllowed('http://localhost:5173', origins)).toBe(true)
    expect(isCorsOriginAllowed('http://127.0.0.1:5173', origins)).toBe(true)
    expect(isCorsOriginAllowed('https://warm-desk-garden.onrender.com', origins)).toBe(true)
  })

  it('rejects unrelated browser origins when an Origin header is present', () => {
    const origins = buildAllowedOrigins('https://warm-desk-garden.onrender.com')

    expect(isCorsOriginAllowed('https://example.com', origins)).toBe(false)
  })
})
