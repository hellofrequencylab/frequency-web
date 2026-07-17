import { describe, it, expect, vi } from 'vitest'

// resolveSegment audience-consent TIERS + sendCategoryForSegment. `members` and `site_signups` are the
// operator's own account-holders → every not-unsubscribed member, sent under the opt-OUT `lifecycle`
// category (a member newsletter each member can unsubscribe from). ONLY `subscribed_members` is the strict
// opt-IN marketing audience (`consent_state='subscribed'`). The imported cold list is excluded from all of
// them by the `.not('profile_id')` filter (no profile). The send-gate re-checks the audience's category per
// recipient at send time.

const contacts = [
  { id: 'k1', email: 'a@x.com', profile_id: 'p1', consent_state: 'subscribed', source: 'signup' },
  // Never explicitly opted into marketing — still a member, so IN the member newsletter, OUT of subscribed-only.
  { id: 'k2', email: 'b@x.com', profile_id: 'p2', consent_state: 'unknown', source: 'signup' },
  // Unsubscribed — held out of everything.
  { id: 'k3', email: 'c@x.com', profile_id: 'p3', consent_state: 'unsubscribed', source: 'signup' },
  // No profile (e.g. imported lead) — held out (no profile-based unsubscribe).
  { id: 'k4', email: 'd@x.com', profile_id: null, consent_state: 'subscribed', source: 'signup' },
]

type Pred = (c: (typeof contacts)[number]) => boolean

function contactsBuilder() {
  const preds: Pred[] = []
  const api = {
    select() {
      return api
    },
    not(col: string, _op: string, _val: null) {
      if (col === 'profile_id') preds.push((c) => c.profile_id != null)
      return api
    },
    neq(col: string, val: string) {
      preds.push((c) => (c as Record<string, unknown>)[col] !== val)
      return api
    },
    eq(col: string, val: string) {
      preds.push((c) => (c as Record<string, unknown>)[col] === val)
      return api
    },
    or(expr: string) {
      if (expr === 'source.is.null,source.neq.import') {
        preds.push((c) => c.source == null || c.source !== 'import')
      }
      return api
    },
    then(resolve: (r: { data: typeof contacts; error: null }) => void) {
      const rows = contacts.filter((c) => preds.every((p) => p(c)))
      resolve({ data: rows, error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'contacts') return contactsBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { resolveSegment, sendCategoryForSegment } from './campaigns'

const ids = (rs: { contactId: string }[]) => rs.map((r) => r.contactId).sort()

describe('resolveSegment — audience consent tiers', () => {
  it("'members' reaches every not-unsubscribed member (subscribed + unknown), profile-less excluded", async () => {
    // k1 subscribed IN; k2 unknown IN (still a member); k3 unsubscribed OUT; k4 no-profile OUT.
    expect(ids(await resolveSegment('members'))).toEqual(['k1', 'k2'])
  })

  it("'site_signups' also reaches all not-unsubscribed members (organic), profile-less excluded", async () => {
    expect(ids(await resolveSegment('site_signups'))).toEqual(['k1', 'k2'])
  })

  it("'subscribed_members' is the strict opt-in audience (subscribed only)", async () => {
    expect(ids(await resolveSegment('subscribed_members'))).toEqual(['k1'])
  })
})

describe('sendCategoryForSegment', () => {
  it('only subscribed_members sends as marketing; everything else is lifecycle', () => {
    expect(sendCategoryForSegment('subscribed_members')).toBe('marketing')
    expect(sendCategoryForSegment('members')).toBe('lifecycle')
    expect(sendCategoryForSegment('site_signups')).toBe('lifecycle')
    expect(sendCategoryForSegment('beta_waitlist')).toBe('lifecycle')
    expect(sendCategoryForSegment('seg:some-trait')).toBe('lifecycle')
    expect(sendCategoryForSegment('profile:p1')).toBe('lifecycle')
  })
})
