import { describe, it, expect } from 'vitest'
import { unionRosterIds } from './crm-roster'

// Message Circle roster mapping (CRM Everywhere plan 4.3 / ADR-827): pin the pure union of a
// circle's active-member ids with its host id — order kept, host appended when not already a
// member, junk dropped, duplicates collapsed. The IO around it is fail-safe by construction and
// tested at the pipeline level (rosterFromProfileIds).

describe('unionRosterIds', () => {
  it('keeps member order and appends the host when the host is not a member', () => {
    expect(unionRosterIds(['a', 'b'], 'h')).toEqual(['a', 'b', 'h'])
  })

  it('does not duplicate a host who is also an active member', () => {
    expect(unionRosterIds(['a', 'h', 'b'], 'h')).toEqual(['a', 'h', 'b'])
  })

  it('collapses duplicate membership rows', () => {
    expect(unionRosterIds(['a', 'a', 'b'], null)).toEqual(['a', 'b'])
  })

  it('drops non-string and blank ids and tolerates a missing host', () => {
    expect(unionRosterIds(['a', null, undefined, 7, ''], null)).toEqual(['a'])
    expect(unionRosterIds([], undefined)).toEqual([])
    expect(unionRosterIds([], 'h')).toEqual(['h'])
  })
})
