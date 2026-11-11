// FH-024: the keys, the narrowed answers and the fail-closed send check, plus a source guard on the
// migration so a later edit cannot drop the append-only trigger, the stale rule, the global suppression
// or the browser-role revoke. The behaviour itself is proved under pgTAP by supabase/tests/hunt_consent.test.sql.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canSend, consentEventKey, contactHash, latestConsent, recordConsent, requestPrivacy } from './consent'

const base = { profileId: 'p1', spaceId: 's1', event: 'grant' as const, version: 'v1', source: 'hunt_reward' as const }

describe('keys and hashes', () => {
  it('hashes a contact the same way whatever its case or padding, and never returns it', () => {
    expect(contactHash(' Daniel@Example.com ')).toBe(contactHash('daniel@example.com'))
    expect(contactHash('a@b.co')).toMatch(/^[0-9a-f]{64}$/)
    expect(contactHash('a@b.co')).not.toContain('a@b.co')
  })
  it('keeps one key per tap and a different key for a different tap, Space or event', () => {
    const k = consentEventKey({ profileId: 'p', spaceId: 's', event: 'grant', tapId: 't1' })
    expect(consentEventKey({ profileId: 'p', spaceId: 's', event: 'grant', tapId: 't1' })).toBe(k)
    for (const other of [{ tapId: 't2' }, { spaceId: 's2' }, { event: 'withdraw' as const }]) {
      expect(consentEventKey({ profileId: 'p', spaceId: 's', event: 'grant', tapId: 't1', ...other })).not.toBe(k)
    }
    expect(k.length).toBeGreaterThanOrEqual(8)
  })
})

describe('recordConsent', () => {
  it('passes the named Space and narrows the answer', async () => {
    let seen: Record<string, unknown> = {}
    const out = await recordConsent(async (_f, a) => { seen = a; return { data: { result: 'recorded' }, error: null } }, { ...base, eventKey: 'evt-00000001' })
    expect(out).toBe('recorded')
    expect(seen).toMatchObject({ p_space: 's1', p_event: 'grant', p_version: 'v1', p_source: 'hunt_reward', p_hunt: null })
  })
  it('throws on a database error and on an answer it does not know', async () => {
    await expect(recordConsent(async () => ({ data: null, error: { message: 'boom' } }), { ...base, eventKey: 'evt-00000001' })).rejects.toThrow('boom')
    await expect(recordConsent(async () => ({ data: { result: 'maybe' }, error: null }), { ...base, eventKey: 'evt-00000001' })).rejects.toThrow('does not know')
  })
})

describe('canSend', () => {
  it('sends the hash, not the address, and marks essential mail', async () => {
    let seen: Record<string, unknown> = {}
    const out = await canSend(async (_f, a) => { seen = a; return { data: { allowed: true, reason: 'essential' }, error: null } }, { profileId: 'p', spaceId: 's', essential: true, contact: 'A@b.co' })
    expect(out).toEqual({ allowed: true, reason: 'essential' })
    expect(seen.p_essential).toBe(true)
    expect(seen.p_contact_hash).toBe(contactHash('a@b.co'))
    expect(JSON.stringify(seen)).not.toContain('b.co')
  })
  it('fails closed on an answer it does not know', async () => {
    expect(await canSend(async () => ({ data: { allowed: true, reason: '???' }, error: null }), { profileId: 'p', spaceId: 's' })).toEqual({ allowed: false, reason: 'no_consent' })
  })
  it('never reads allowed from a known reason that says no', async () => {
    expect((await canSend(async () => ({ data: { allowed: false, reason: 'withdrawn' }, error: null }), { profileId: 'p', spaceId: 's' })).allowed).toBe(false)
  })
})

describe('requestPrivacy', () => {
  it('needs the contact for erase and do-not-contact, not for export', async () => {
    const rpc = async () => ({ data: { result: 'recorded' }, error: null })
    await expect(requestPrivacy(rpc, { profileId: 'p', kind: 'erase', requestKey: 'req-00000001' })).rejects.toThrow('contact')
    expect(await requestPrivacy(rpc, { profileId: 'p', kind: 'export', requestKey: 'req-00000001' })).toBe('recorded')
    expect(await requestPrivacy(rpc, { profileId: 'p', kind: 'do_not_contact', requestKey: 'req-00000002', contact: 'a@b.co' })).toBe('recorded')
  })
})

describe('latestConsent', () => {
  const ev = (spaceId: string, event: 'grant' | 'withdraw', occurredAt: string) => ({ spaceId, event, occurredAt })
  it('reads the newest event for one Space and ignores the others', () => {
    const events = [ev('a', 'grant', '2026-11-01T00:00:00Z'), ev('a', 'withdraw', '2026-11-02T00:00:00Z'), ev('b', 'grant', '2026-11-03T00:00:00Z')]
    expect(latestConsent(events, 'a')).toBe('withdrawn')
    expect(latestConsent(events, 'b')).toBe('opted_in')
    expect(latestConsent(events, 'c')).toBe('none')
    expect(latestConsent([ev('a', 'withdraw', '2026-11-02T00:00:00Z'), ev('a', 'grant', '2026-11-01T00:00:00Z')], 'a')).toBe('withdrawn')
  })
})

describe('the migration', () => {
  const code = readFileSync(join('supabase', 'migrations', '20270346044000_hunt_consent.sql'), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
  it('keeps the ledger append-only and refuses a stale or suppressed grant', () => {
    expect(code).toContain('create trigger hunt_consent_events_append_only')
    expect(code).toContain("'the consent ledger is append-only'")
    expect(code).toContain("'stale'")
    expect(code).toContain("'suppressed'")
    expect(code).toContain('event_key text not null unique')
  })
  it('suppresses before it moves the lead on a withdrawal', () => {
    const suppress = code.indexOf("values (p_profile, p_space, p_channel, 'withdrawn')")
    const lead = code.indexOf("values (p_space, p_profile, 'withdrawn'")
    expect(suppress).toBeGreaterThan(-1)
    expect(lead).toBeGreaterThan(suppress)
  })
  it('limits every table and function to the service role', () => {
    for (const t of ['hunt_consent_events', 'hunt_contact_suppressions', 'hunt_leads', 'hunt_privacy_requests']) {
      expect(code).toContain(`alter table public.${t} enable row level security`)
    }
    for (const fn of ['hunt_consent_record', 'hunt_consent_can_send', 'hunt_consent_roster', 'hunt_privacy_request']) {
      expect(code).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`))
      expect(code).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`))
    }
  })
})
