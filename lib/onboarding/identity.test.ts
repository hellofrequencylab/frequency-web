import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { identityIsChosen, mintedHandleFor, sanitizeHandleBase } from './identity'

const TRIGGER = 'supabase/migrations/20261013000000_reconcile_signup_trigger.sql'
const AUTH = '42a829aa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('sanitizeHandleBase — the trigger alphabet', () => {
  it('drops non-alphanumerics and lowercases, matching regexp_replace(..., [^a-z0-9])', () => {
    expect(sanitizeHandleBase('Taylor.Smith')).toBe('taylorsmith')
    expect(sanitizeHandleBase('Live-Now Love')).toBe('livenowlove')
    expect(sanitizeHandleBase('')).toBe('')
  })
})

describe('mintedHandleFor — the trigger first try', () => {
  it('uses the first 6 hex of the auth id (dashes stripped)', () => {
    expect(mintedHandleFor(AUTH, 'taylor')).toBe('taylor_42a829')
  })
  it('maps the empty-email placeholder to member_, not newmember_', () => {
    expect(mintedHandleFor(AUTH, 'New Member')).toBe('member_42a829')
  })
})

describe('identityIsChosen', () => {
  it('is false for the minted email-local + generated handle (LIVE-349)', () => {
    expect(
      identityIsChosen({ displayName: 'taylor', handle: 'taylor_42a829', authUserId: AUTH }),
    ).toBe(false)
  })
  it('is false for New Member / member_<authhex>', () => {
    expect(
      identityIsChosen({ displayName: 'New Member', handle: 'member_42a829', authUserId: AUTH }),
    ).toBe(false)
  })
  it('is true once the display name is a chosen name (established members)', () => {
    expect(
      identityIsChosen({ displayName: 'Taylor Smith', handle: 'taylor_42a829', authUserId: AUTH }),
    ).toBe(true)
  })
  it('is true once the handle is chosen', () => {
    expect(
      identityIsChosen({ displayName: 'taylor', handle: 'taylor', authUserId: AUTH }),
    ).toBe(true)
  })
  it('is false when name or handle is missing', () => {
    expect(identityIsChosen({ displayName: '', handle: 'taylor', authUserId: AUTH })).toBe(false)
    expect(identityIsChosen({ displayName: 'taylor', handle: null, authUserId: AUTH })).toBe(false)
  })
  it('is true when there is no auth id to reconstruct a mint from', () => {
    expect(identityIsChosen({ displayName: 'Vera', handle: 'moderation', authUserId: null })).toBe(true)
  })
})

describe('the rule stays pinned to the trigger (LIVE-349)', () => {
  it('the signup trigger still mints local-part + first 6 hex of auth id', () => {
    const sql = readFileSync(TRIGGER, 'utf8')
    expect(sql).toContain("coalesce(nullif(local_part, ''), 'New Member')")
    expect(sql).toContain("base_handle := 'member'")
    expect(sql).toContain("final_handle := base_handle || '_' || substr(replace(new.id::text, '-', ''), 1, 6)")
  })

  // LIVE-450: the conversion door reconstructs the same mint in SQL before it spends a lead's name
  // onto a profile. If the trigger's formula ever moves, this pin and the one above fail together,
  // which is the point: three copies of one formula (trigger, identity.ts, conversion) must agree,
  // or a real member's chosen name could be read as the mint and overwritten.
  it('the conversion door mirrors the same mint in SQL before spending a lead name (LIVE-450)', () => {
    const sql = readFileSync(
      'supabase/migrations/20270345008700_conversion_spends_the_lead_name.sql',
      'utf8',
    )
    expect(sql).toContain("when p.display_name = 'New Member' then 'member'")
    expect(sql).toContain("lower(regexp_replace(p.display_name, '[^a-z0-9]', '', 'g'))")
    expect(sql).toContain("|| '_' || substr(replace(auth.uid()::text, '-', ''), 1, 6)")
    // The spend is gated on the stamp landing THIS call and on the lead carrying a name.
    expect(sql).toContain("if v_n > 0 and v_lead_name is not null")
  })
})
