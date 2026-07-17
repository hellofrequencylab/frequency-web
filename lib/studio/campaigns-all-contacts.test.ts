import { describe, it, expect, vi } from 'vitest'

// resolveSegment('all_contacts') — the "entire contact list" audience (owner directive: warm up an
// owned, imported list as ordinary opt-out subscribers). Locks that this ONE built-in:
//   • INCLUDES profile-less IMPORTED leads (source='import') — held out of every other built-in,
//   • EXCLUDES profile-less CAPTURE leads (source='event'/'scan_invite'/etc. at consent_state='unknown')
//     that never confirmed an email — the ADR-154 consent invariant (they must not be blasted),
//   • still drops unsubscribed contacts,
//   • is SCOPED to the root space (null space_id or the root id), never another tenant Space's contacts,
//   • returns profileId=null for the profile-less rows (so the send path takes its suppression-only branch).

const ROOT = 'root-space'

const contacts = [
  { id: 'k1', email: 'a@x.com', profile_id: 'p1', consent_state: 'subscribed', space_id: ROOT, source: 'signup' },
  { id: 'k2', email: 'b@x.com', profile_id: 'p2', consent_state: 'unknown', space_id: null, source: 'signup' },
  // Imported, no account — the whole point: this one is INCLUDED here (held out of every other built-in).
  { id: 'k3', email: 'c@x.com', profile_id: null, consent_state: 'unknown', space_id: ROOT, source: 'import' },
  // Unsubscribed — excluded everywhere.
  { id: 'k4', email: 'd@x.com', profile_id: 'p4', consent_state: 'unsubscribed', space_id: ROOT, source: 'signup' },
  // Another tenant Space's contact — must NOT leak into the root-space entire-list.
  { id: 'k5', email: 'e@x.com', profile_id: null, consent_state: 'unknown', space_id: 'other-space', source: 'import' },
  // Profile-less CAPTURE leads (scan-invite + event RSVP) at consent_state='unknown' — never confirmed an
  // email, so they must be EXCLUDED even though they sit in the root space (the ADR-154 consent invariant).
  { id: 'k6', email: 'f@x.com', profile_id: null, consent_state: 'unknown', space_id: ROOT, source: 'scan_invite' },
  { id: 'k7', email: 'g@x.com', profile_id: null, consent_state: 'unknown', space_id: null, source: 'event' },
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
    is(col: string, val: null) {
      if (col === 'space_id' && val === null) preds.push((c) => c.space_id == null)
      return api
    },
    or(expr: string) {
      // The all_contacts root-space scope: space_id.is.null,space_id.eq.<root>
      if (expr === `space_id.is.null,space_id.eq.${ROOT}`) {
        preds.push((c) => c.space_id == null || c.space_id === ROOT)
      }
      // The consent guard: (has an account) OR (is the owned imported list).
      if (expr === 'profile_id.not.is.null,source.eq.import') {
        preds.push((c) => c.profile_id != null || c.source === 'import')
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

vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: () => Promise.resolve(ROOT),
}))

import { resolveSegment } from './campaigns'

const ids = (rs: { contactId: string }[]) => rs.map((r) => r.contactId).sort()

describe("resolveSegment('all_contacts')", () => {
  it('includes members + profile-less imported leads, drops unsubscribed, other tenants, and capture leads', async () => {
    const rs = await resolveSegment('all_contacts')
    // k1 member, k2 null-space member, k3 imported/no-profile INCLUDED; k4 unsubscribed out; k5 other-space out;
    // k6 scan_invite + k7 event captures OUT (profile-less, non-import, never confirmed — the consent invariant).
    expect(ids(rs)).toEqual(['k1', 'k2', 'k3'])
  })

  it('excludes every profile-less capture lead (source != import) even in the root space', async () => {
    const rs = await resolveSegment('all_contacts')
    expect(rs.find((r) => r.contactId === 'k6')).toBeUndefined() // scan_invite
    expect(rs.find((r) => r.contactId === 'k7')).toBeUndefined() // event RSVP
  })

  it('returns a null profileId for the profile-less imported lead (drives the suppression-only send branch)', async () => {
    const rs = await resolveSegment('all_contacts')
    expect(rs.find((r) => r.contactId === 'k3')?.profileId).toBeNull()
    expect(rs.find((r) => r.contactId === 'k1')?.profileId).toBe('p1')
  })
})
