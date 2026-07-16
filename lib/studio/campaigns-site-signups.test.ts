import { describe, it, expect, vi } from 'vitest'

// resolveSegment('site_signups') — the "blast site users, not the imported list" audience.
// Locks that the built-in holds out the imported list BY SOURCE (source='import'), keeps organic
// sign-ups (source='signup'/'backfill') AND null-source members, and still drops unsubscribed +
// profile-less rows. The hold-out survives an imported contact signing up (their row keeps
// source='import', which no signup path overwrites), which the profile-based rules alone miss.

// In-memory contacts spanning every case that matters for the hold-out.
const contacts = [
  { id: 'k1', email: 'a@x.com', profile_id: 'p1', consent_state: 'subscribed', source: 'signup' },
  { id: 'k2', email: 'b@x.com', profile_id: 'p2', consent_state: 'subscribed', source: 'backfill' },
  { id: 'k3', email: 'c@x.com', profile_id: 'p3', consent_state: 'subscribed', source: null },
  // Imported list, later joined (has a profile now) — must STILL be held out by source.
  { id: 'k4', email: 'd@x.com', profile_id: 'p4', consent_state: 'subscribed', source: 'import' },
  // Imported, not joined — no profile, excluded by the profile rule too.
  { id: 'k5', email: 'e@x.com', profile_id: null, consent_state: 'unknown', source: 'import' },
  // Unsubscribed organic — excluded.
  { id: 'k6', email: 'f@x.com', profile_id: 'p6', consent_state: 'unsubscribed', source: 'signup' },
]

type Pred = (c: (typeof contacts)[number]) => boolean

// A tiny PostgREST-shaped builder: accumulates predicates, resolves on await (thenable).
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
      // Only the site_signups hold-out is exercised here: source.is.null,source.neq.import
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

import { resolveSegment } from './campaigns'

const ids = (rs: { contactId: string }[]) => rs.map((r) => r.contactId).sort()

describe("resolveSegment('site_signups')", () => {
  it('keeps organic + null-source members, holds out the imported list by source', async () => {
    // k1/k2 organic in, k3 null-source in, k4 imported-then-joined HELD OUT,
    // k5 imported/no-profile out (profile rule), k6 unsubscribed out.
    expect(ids(await resolveSegment('site_signups'))).toEqual(['k1', 'k2', 'k3'])
  })
})
