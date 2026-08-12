import { describe, it, expect } from 'vitest'
import {
  ASSIGNABLE_CIRCLE_ROLES,
  CIRCLE_ROLE_LABEL,
  CIRCLE_ROLE_STORED_VALUE,
  CIRCLE_ROLE_SUMMARY,
  circleRoleFromStoredValue,
  isAssignableCircleRole,
  type CircleRole,
} from './circle-roles'

// The circle role ladder's pure half (ADR-1014): the value ⇄ rung mapping, and the fail-closed
// promise. Everything that can grant a capability starts here, so the negative cases matter more
// than the positive ones.

describe('circleRoleFromStoredValue', () => {
  it('maps the two stored values to their rungs', () => {
    expect(circleRoleFromStoredValue('guide')).toBe('admin')
    expect(circleRoleFromStoredValue('host')).toBe('moderator')
  })

  it('reads a plain member from null, undefined, and the explicit value', () => {
    expect(circleRoleFromStoredValue(null)).toBe('member')
    expect(circleRoleFromStoredValue(undefined)).toBe('member')
    expect(circleRoleFromStoredValue('member')).toBe('member')
  })

  it('FAILS CLOSED on every community_role value the ladder does not use', () => {
    // 'crew' is the retired rung the demo generator still writes (lib/demo/engine.ts);
    // 'mentor' outranks 'guide' on the global ladder, and would be the natural escalation
    // if this read were a `>=` comparison rather than an explicit allowlist.
    for (const value of ['crew', 'mentor', 'admin', 'janitor']) {
      expect(circleRoleFromStoredValue(value)).toBe('member')
    }
  })

  it('FAILS CLOSED on junk, casing, whitespace, and a future enum value', () => {
    for (const value of ['Guide', 'GUIDE', ' guide', 'guide ', 'owner', 'superadmin', '', 'null']) {
      expect(circleRoleFromStoredValue(value)).toBe('member')
    }
  })
})

describe('isAssignableCircleRole', () => {
  it('accepts exactly the three assignable rungs', () => {
    expect(ASSIGNABLE_CIRCLE_ROLES.every(isAssignableCircleRole)).toBe(true)
  })

  it('REFUSES host — ownership is circles.host_id, never an assignment', () => {
    expect(isAssignableCircleRole('host')).toBe(false)
  })

  it('refuses everything else a client could send', () => {
    for (const value of ['guide', 'owner', 'Admin', '', null, undefined, 0, {}, []]) {
      expect(isAssignableCircleRole(value)).toBe(false)
    }
  })
})

describe('the mapping is a round trip', () => {
  it('every assignable rung stores a value that reads back as itself', () => {
    for (const rung of ASSIGNABLE_CIRCLE_ROLES) {
      expect(circleRoleFromStoredValue(CIRCLE_ROLE_STORED_VALUE[rung])).toBe(rung)
    }
  })

  it('a plain Member stores NULL (what "null = regular member" has always meant)', () => {
    expect(CIRCLE_ROLE_STORED_VALUE.member).toBeNull()
  })

  it('Admin stores the value that OUTRANKS Moderator in the Postgres enum', () => {
    // Order is member < crew < host < guide < mentor. Admin must sit above Moderator so the
    // stored ladder and the capability ladder never disagree about who is senior.
    expect(CIRCLE_ROLE_STORED_VALUE.admin).toBe('guide')
    expect(CIRCLE_ROLE_STORED_VALUE.moderator).toBe('host')
  })
})

describe('member-facing copy (docs/CONTENT-VOICE.md)', () => {
  const RUNGS: CircleRole[] = ['host', 'admin', 'moderator', 'member']

  it('names and summarises all four rungs', () => {
    for (const rung of RUNGS) {
      expect(CIRCLE_ROLE_LABEL[rung]).toBeTruthy()
      expect(CIRCLE_ROLE_SUMMARY[rung]).toBeTruthy()
    }
  })

  it('carries no em dash (CONTENT-VOICE §5e, hard rule)', () => {
    for (const rung of RUNGS) {
      expect(CIRCLE_ROLE_SUMMARY[rung]).not.toContain('—')
      expect(CIRCLE_ROLE_LABEL[rung]).not.toContain('—')
    }
  })

  it('says Dispatch, never the retired member-facing noun "broadcast" (NAMING.md §Dispatch)', () => {
    const all = Object.values(CIRCLE_ROLE_SUMMARY).join(' ')
    expect(all).toMatch(/Dispatch/)
    expect(all.toLowerCase()).not.toMatch(/broadcast/)
  })
})
