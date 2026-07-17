import { describe, it, expect, vi } from 'vitest'

// resolveSegment for the GLOBAL marketing built-in audiences ('members', 'site_signups'). Locks the
// marketing opt-in gate: email_marketing is opt-IN (lib/consent/scopes.ts defaultGranted:false) and the
// double-opt-in funnel stamps consent_state='subscribed' when it grants the scope, so a broadcast may
// reach ONLY 'subscribed' contacts — mirroring the per-Space path (lib/spaces/email.ts, marketing
// consent). A member whose consent_state is 'unknown' (never opted in) is NOT in the audience; a
// 'subscribed' member IS. ('subscribed_members' was already strict; the send-gate re-checks
// email_marketing per recipient at send time as the backstop.)

// In-memory contacts spanning the consent states that matter for the gate.
const contacts = [
  { id: 'k1', email: 'a@x.com', profile_id: 'p1', consent_state: 'subscribed', source: 'signup' },
  // Never opted into marketing — must be HELD OUT of a marketing broadcast now.
  { id: 'k2', email: 'b@x.com', profile_id: 'p2', consent_state: 'unknown', source: 'signup' },
  // Unsubscribed — held out.
  { id: 'k3', email: 'c@x.com', profile_id: 'p3', consent_state: 'unsubscribed', source: 'signup' },
  // Subscribed but no profile — held out (no profile-based unsubscribe).
  { id: 'k4', email: 'd@x.com', profile_id: null, consent_state: 'subscribed', source: 'signup' },
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

describe("resolveSegment — marketing opt-in gate on built-in audiences", () => {
  it("'members' reaches only 'subscribed' contacts (unknown/never-opted-in held out)", async () => {
    // k1 subscribed IN; k2 unknown OUT (never opted in); k3 unsubscribed OUT; k4 no-profile OUT.
    expect(ids(await resolveSegment('members'))).toEqual(['k1'])
  })

  it("'site_signups' also requires 'subscribed' (unknown held out)", async () => {
    expect(ids(await resolveSegment('site_signups'))).toEqual(['k1'])
  })
})
