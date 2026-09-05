import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ADR-959 — the signup_leads write path, pinned as SQL text with no live database.
//
// signup_leads holds an email address for every visitor who started an induction, whether or not
// they finished. anon must be able to write to it (the funnel runs signed out) and must never be
// able to read from it. That asymmetry is the whole design, and it rests on three things a reviewer
// cannot eyeball:
//
//   (A) the table is RLS-on-with-NO-policy, and no policy is ever added for anon/authenticated;
//   (B) 🔴 capture_signup_lead returns an ID AND NOTHING ELSE, identically for an address that is
//       already here and one that is not. If it ever returned the row, or a created/updated flag,
//       or raised on a duplicate, the endpoint in front of it becomes an address oracle: POST a
//       list of emails, read back which ones belong to Frequency members. `returns uuid` plus an
//       ON CONFLICT DO UPDATE (never DO NOTHING, never a bare insert that would raise 23505) is
//       what makes the two cases indistinguishable;
//   (C) each function is a real DEFINER with a pinned search_path, EXECUTE is revoked from public
//       first, and only the conversion function — the one that writes a profile id — is withheld
//       from anon and checks ownership through auth.uid().
//
// Archetype: test/contract/public-events-rpc-gate.test.ts (ADR-903), whose definitionBlock() and
// bodyBlock() helpers are reused verbatim.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

const SQL = readFileSync(join(ROOT, 'supabase/migrations/20270215000000_signup_leads.sql'), 'utf8')

/** The function DEFINITION block only — from `create ... function public.<fn>(` to the `as $$` body
 *  marker — so the SECURITY DEFINER / search_path assertions match the real CLAUSE, never a comment
 *  that merely mentions "security definer" elsewhere in the migration. */
function definitionBlock(sql: string, fn: string): string {
  const lower = sql.toLowerCase()
  const start = lower.indexOf(`function public.${fn}(`)
  if (start === -1) return ''
  const body = lower.indexOf('as $$', start)
  return lower.slice(start, body === -1 ? undefined : body)
}

/** The executable BODY of one function — between its `as $$` and the closing `$$;`. */
function bodyBlock(sql: string, fn: string): string {
  const lower = sql.toLowerCase()
  const start = lower.indexOf(`function public.${fn}(`)
  if (start === -1) return ''
  const open = lower.indexOf('as $$', start)
  const close = lower.indexOf('$$;', open + 5)
  return lower.slice(open + 5, close === -1 ? undefined : close)
}

const FUNCTIONS = ['capture_signup_lead', 'update_signup_lead', 'mark_signup_lead_converted'] as const

describe('(A) signup_leads is fail-closed: RLS on, and no policy for any caller role', () => {
  it('enables row level security on the table', () => {
    expect(SQL).toMatch(/alter table public\.signup_leads enable row level security/)
  })

  it('creates NO policy at all — a select policy here would expose every captured address', () => {
    expect(SQL.toLowerCase()).not.toMatch(/create policy/)
  })

  it('grants no table privileges to anon or authenticated (functions are the only door)', () => {
    expect(SQL.toLowerCase()).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*on\s+table/)
  })

  it('is listed in the deny-all allowlist, so check:rls records the posture as deliberate', () => {
    const deny = readFileSync(join(ROOT, 'scripts/rls-deny-all.txt'), 'utf8')
    expect(deny.split('\n').map((l) => l.trim())).toContain('signup_leads')
  })
})

describe('(B) 🔴 capture_signup_lead cannot be used to test whether an address is registered', () => {
  const def = definitionBlock(SQL, 'capture_signup_lead')
  const body = bodyBlock(SQL, 'capture_signup_lead')

  // 2026-09-05 (scan2 L7-6, ADR-1210): this pins the ORIGINAL 20270215000000 text. Migration 20270345000610 replaced
  // the function so it returns {id, claim_token} and update/convert take the token; the original body is the
  // superseded definition this contract test still reads, so its prose below describes that version.
  it('returns a bare uuid — never the row, never a record, never a flag', () => {
    expect(def, 'capture_signup_lead definition not found').not.toBe('')
    expect(def).toMatch(/\)\s*returns uuid\b/)
    expect(def).not.toMatch(/returns\s+(setof|table|record|public\.signup_leads)/)
  })

  it('returns the SAME shape for a new and an existing email: one upsert, one exit', () => {
    // ON CONFLICT DO UPDATE, not DO NOTHING (which would return null only for a known address) and
    // not a bare insert (which would raise 23505 only for a known address). Either alternative
    // makes "already a member" observable from the outside.
    expect(body).toMatch(/on conflict \(\(lower\(email\)\)\) do update set/)
    expect(body).not.toMatch(/do nothing/)
    // Exactly two returns: the invalid-email guard, and the single success exit.
    expect(body.match(/\breturn\b/g) ?? []).toHaveLength(2)
    // The success exit hands back the id it just captured into, and nothing is selected out of the
    // existing row beyond that.
    expect(body).toMatch(/returning l\.id into v_id/)
    expect(body).toMatch(/return v_id;/)
  })

  it('never reads a column of the existing row back to the caller', () => {
    for (const leaked of ['converted_at', 'converted_profile_id', 'l.email', 'l.created_at']) {
      expect(body.includes(`select ${leaked}`), `${leaked} must not be selected out`).toBe(false)
    }
    // The only `raise` allowed is none: an exception message is itself a channel, and a duplicate
    // must not produce one.
    expect(body).not.toMatch(/\braise\b/)
  })

  it('normalises + bounds its input, so an anon-callable function is not free storage', () => {
    expect(body).toMatch(/lower\(btrim\(coalesce\(p_email/)
    expect(body).toMatch(/length\(v_email\) > 254/)
    expect(body).toMatch(/pg_column_size/)
  })

  it('the unique index it upserts against is on lower(email), so one person is one row', () => {
    expect(SQL).toMatch(/create unique index[^;]*on public\.signup_leads \(lower\(email\)\)/)
  })
})

describe('(C) every function is a pinned DEFINER, and only the right roles hold EXECUTE', () => {
  for (const fn of FUNCTIONS) {
    it(`${fn} is SECURITY DEFINER with a pinned search_path`, () => {
      const def = definitionBlock(SQL, fn)
      expect(def, `${fn} definition not found in the migration`).not.toBe('')
      expect(def, `${fn} must be SECURITY DEFINER`).toMatch(/\bsecurity definer\b/)
      expect(def, `${fn} must pin search_path`).toMatch(/set search_path\s*=\s*public,\s*pg_temp/)
      expect(def, `${fn} must not be SECURITY INVOKER`).not.toContain('security invoker')
    })

    it(`${fn} revokes EXECUTE from public before granting anything`, () => {
      const lower = SQL.toLowerCase()
      const revoke = lower.indexOf(`revoke execute on function public.${fn}(`)
      const grant = lower.indexOf(`grant execute on function public.${fn}(`)
      expect(revoke, `${fn} must revoke EXECUTE from public`).toBeGreaterThan(-1)
      expect(grant, `${fn} must grant EXECUTE explicitly`).toBeGreaterThan(-1)
      expect(revoke, `${fn}: the revoke must precede the grant`).toBeLessThan(grant)
    })
  }

  it('the two funnel functions are anon-callable (the induction runs signed out)', () => {
    expect(SQL).toMatch(/grant execute on function public\.capture_signup_lead\([^)]*\) to anon, authenticated;/)
    expect(SQL).toMatch(/grant execute on function public\.update_signup_lead\([^)]*\) to anon, authenticated;/)
  })

  it('🔴 the conversion function is NOT anon-callable and proves ownership via auth.uid()', () => {
    expect(SQL).toMatch(/grant execute on function public\.mark_signup_lead_converted\(uuid, uuid\) to authenticated;/)
    expect(SQL).not.toMatch(/grant execute on function public\.mark_signup_lead_converted\([^)]*\) to anon/)
    // Without this check a stolen lead id plus any profile id attaches one account to another
    // person's funnel record.
    const body = bodyBlock(SQL, 'mark_signup_lead_converted')
    expect(body).toMatch(/from public\.profiles p\s+where p\.id = p_profile_id and p\.auth_user_id = auth\.uid\(\)/)
  })

  it('update_signup_lead returns void: holding an id must not reveal whose row it is', () => {
    const def = definitionBlock(SQL, 'update_signup_lead')
    expect(def).toMatch(/\)\s*returns void\b/)
    const body = bodyBlock(SQL, 'update_signup_lead')
    expect(body).not.toMatch(/\braise\b/)
  })
})

describe('(D) the table carries no consent state — this is transactional, not a mailing list', () => {
  it('has no opt-in / consent / subscribed / marketing column', () => {
    // Marketing consent lives on contacts.consent_state behind the double opt-in at /subscribe.
    // A column here would let a later reader mistake "started signing up" for "agreed to be mailed".
    const create = SQL.slice(SQL.indexOf('create table if not exists public.signup_leads'), SQL.indexOf(');'))
    expect(create.toLowerCase()).not.toMatch(/consent|opt_in|optin|subscribed|marketing/)
  })

  it('records progress + conversion, which is what a recovery job actually needs', () => {
    expect(SQL).toMatch(/step_reached\s+smallint not null default 0/)
    expect(SQL).toMatch(/converted_profile_id\s+uuid references public\.profiles\(id\) on delete set null/)
    expect(SQL).toMatch(/create index[^;]*on public\.signup_leads \(converted_at, updated_at\)/)
  })
})
