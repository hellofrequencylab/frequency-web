import { describe, it, expect } from 'vitest'
import { resolveVisibilityChange } from './visibility'

// resolveVisibilityChange (ADR-778) — the pure decision behind setVisibility. Locks the 'shared'
// tier rules: allowed ONLY with a scope the caller operates; every unauthorized/unscoped/downgrade
// path clears shared_space_id and never over-shares.

describe('resolveVisibilityChange', () => {
  it('network → network, scope cleared', () => {
    expect(resolveVisibilityChange({ requested: 'network', sharedSpaceId: 's1', operatesTargetSpace: true }))
      .toEqual({ visibility: 'network', sharedSpaceId: null })
  })

  it('private → private, scope cleared', () => {
    expect(resolveVisibilityChange({ requested: 'private', sharedSpaceId: 's1', operatesTargetSpace: true }))
      .toEqual({ visibility: 'private', sharedSpaceId: null })
  })

  it('shared WITH a space the caller operates → shared, scope set', () => {
    expect(resolveVisibilityChange({ requested: 'shared', sharedSpaceId: 's1', operatesTargetSpace: true }))
      .toEqual({ visibility: 'shared', sharedSpaceId: 's1' })
  })

  it('shared but caller does NOT operate the space → coerced to private', () => {
    expect(resolveVisibilityChange({ requested: 'shared', sharedSpaceId: 's1', operatesTargetSpace: false }))
      .toEqual({ visibility: 'private', sharedSpaceId: null })
  })

  it('shared with NO space id → coerced to private', () => {
    expect(resolveVisibilityChange({ requested: 'shared', sharedSpaceId: null, operatesTargetSpace: true }))
      .toEqual({ visibility: 'private', sharedSpaceId: null })
    expect(resolveVisibilityChange({ requested: 'shared', sharedSpaceId: '   ', operatesTargetSpace: true }))
      .toEqual({ visibility: 'private', sharedSpaceId: null })
  })

  it('a forged/invalid tier → private', () => {
    expect(resolveVisibilityChange({ requested: 'bogus' as never, operatesTargetSpace: true }))
      .toEqual({ visibility: 'private', sharedSpaceId: null })
  })

  it('trims the space id before persisting', () => {
    expect(resolveVisibilityChange({ requested: 'shared', sharedSpaceId: '  s2 ', operatesTargetSpace: true }))
      .toEqual({ visibility: 'shared', sharedSpaceId: 's2' })
  })
})
