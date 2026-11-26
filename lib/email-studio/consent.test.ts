import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { CONSENT_WORDING, contactConsentRow, filterConsented } from './consent'

describe('EMAIL-085 permission records', () => {
  it('keeps account holders and drops account-less contacts with no record', () => {
    const recipients = [
      { contactId: 'm1', email: 'a@x.co', profileId: 'p1' },
      { contactId: 'i1', email: 'b@x.co', profileId: null },
      { contactId: 'i2', email: 'c@x.co', profileId: null },
    ]
    expect(filterConsented(recipients, new Set(['i2'])).map((r) => r.contactId)).toEqual(['m1', 'i2'])
  })

  it('drops every account-less contact when none has a record', () => {
    expect(filterConsented([{ contactId: 'i1', email: 'b@x.co', profileId: null }], new Set())).toEqual([])
  })

  it('stores the wording the page showed, falling back to the stock words', () => {
    const row = contactConsentRow({ contactId: 'c', spaceId: 's', source: 'subscribe_confirm', capturedAt: '2026-11-25T00:00:00Z' })
    expect(row).toMatchObject({ contact_id: 'c', space_id: 's', source: 'subscribe_confirm', wording: CONSENT_WORDING.subscribe_confirm })
    expect(contactConsentRow({ contactId: 'c', spaceId: null, source: 'import_attestation', wording: 'custom' }).wording).toBe('custom')
  })
})
