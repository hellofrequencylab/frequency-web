import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { campaignFingerprint, canonicalJson, compareFingerprint, type FingerprintInput } from './approval-fingerprint'

const base: FingerprintInput = {
  subject: 'Two weeks left in the free beta',
  preheader: 'What stays free',
  block_json: { rows: [{ id: 'r2', cells: [[{ type: 'button', content: { url: 'https://frequencylocal.com/offer', label: 'Go' } }]] }] },
  segment: 'members',
  audience_filter: null,
  from_name: 'Daniel Tyack',
  from_address: null,
  reply_mode: 'conversation',
}

describe('EMAIL-086 approval fingerprint', () => {
  it('is stable across key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }))
    expect(campaignFingerprint(base)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('matches the row it was taken from', () => {
    expect(compareFingerprint(campaignFingerprint(base), base)).toBe('match')
  })

  it('refuses a changed subject, link or audience', () => {
    const stored = campaignFingerprint(base)
    expect(compareFingerprint(stored, { ...base, subject: 'Changed' })).toBe('mismatch')
    expect(compareFingerprint(stored, { ...base, segment: 'all_contacts' })).toBe('mismatch')
    const relinked = JSON.parse(JSON.stringify(base.block_json))
    relinked.rows[0].cells[0][0].content.url = 'https://example.com'
    expect(compareFingerprint(stored, { ...base, block_json: relinked })).toBe('mismatch')
  })

  it('leaves a campaign with no stored fingerprint unlocked', () => {
    expect(compareFingerprint(null, base)).toBe('unlocked')
  })
})
