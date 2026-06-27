import { describe, expect, it } from 'vitest'
import { normalizeApiRecord } from './workspaceApi'

describe('workspaceApi', () => {
  it('normalizes MongoDB ids to frontend ids without losing fields', () => {
    expect(
      normalizeApiRecord({
        _id: { $oid: 'mongo-id' },
        title: '資料夾',
        ownerId: 'user-1',
      }),
    ).toEqual({
      id: 'mongo-id',
      title: '資料夾',
      ownerId: 'user-1',
    })
  })

  it('keeps local ids when the API already returns id', () => {
    expect(normalizeApiRecord({ id: 'local-id', name: '筆記' })).toEqual({
      id: 'local-id',
      name: '筆記',
    })
  })
})
