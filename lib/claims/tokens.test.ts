import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { hashClaimToken, claimHashEquals } from './tokens'

// ── The claim-token system (ADR-907) ──────────────────────────────────────────────────────
// The pure parts are unit-tested; the rest is pinned as source text, because the properties that
// matter here are all SILENT when broken. Storing the plaintext, granting the table to anon, or
// dropping a compare-and-set would throw nothing and fail no other test — the only symptom is a
// secret leaving the building, which is exactly how this bug shipped four times already.

describe('hashing', () => {
  it('is stable and 64 hex chars (sha256)', () => {
    const h = hashClaimToken('abc123')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashClaimToken('abc123')).toBe(h)
  })

  it('differs for different tokens', () => {
    expect(hashClaimToken('abc123')).not.toBe(hashClaimToken('abc124'))
  })

  it('compares equal hashes in constant time, and rejects mismatches', () => {
    const h = hashClaimToken('token')
    expect(claimHashEquals(h, hashClaimToken('token'))).toBe(true)
    expect(claimHashEquals(h, hashClaimToken('other'))).toBe(false)
    // Different lengths must return false rather than throw — timingSafeEqual throws on unequal
    // buffer lengths, so the guard has to come first.
    expect(claimHashEquals(h, 'short')).toBe(false)
  })
})

describe('the token never leaves the mint call', () => {
  const src = readFileSync('lib/claims/tokens.ts', 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('only the HASH is ever written to the row', () => {
    // 🔴 The property the whole design rests on. A `token` (or `claim_token`) key in any insert or
    // update patch would store the plaintext and undo the entire migration.
    expect(code).toContain('token_hash: hashClaimToken(token)')
    expect(code).not.toMatch(/\btoken:\s*token\b/)
    // The COLUMN `claim_token`, not the TABLE `claim_tokens` — the table name contains the column
    // name as a substring, so a bare `not.toContain('claim_token')` fails on `from('claim_tokens')`
    // and would have been "fixed" by deleting the assertion. Negative lookahead for the plural.
    expect(code).not.toMatch(/claim_token(?!s)/)
  })

  it('reads never select the hash back out', () => {
    // Nothing needs it: verification is an equality filter in the database. Selecting it into app
    // memory is how a secret reaches a log line or an error payload.
    for (const m of code.matchAll(/\.select\('([^']*)'\)/g)) {
      expect(m[1]).not.toContain('token_hash')
    }
  })

  it('is server-only, so it cannot be imported into a Client Component', () => {
    expect(src.startsWith("import 'server-only'")).toBe(true)
  })

  it('runs on the admin client only', () => {
    expect(code).toContain('createAdminClient')
    expect(code).not.toContain('@/lib/supabase/server')
  })
})

describe('lifecycle gates are fail-closed on every axis', () => {
  const code = readFileSync('lib/claims/tokens.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

  it('resolve requires unconsumed AND unrevoked AND unexpired', () => {
    const fn = code.slice(code.indexOf('export async function resolveClaimToken'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toContain(".is('consumed_at', null)")
    expect(body).toContain(".is('revoked_at', null)")
    expect(body).toContain(".gt('expires_at'")
  })

  it('consume is a compare-and-set, so exactly one claimer wins a race', () => {
    // Without the .is() filters this is a last-write-wins update and two people presenting the
    // same link both get ownership.
    const fn = code.slice(code.indexOf('export async function consumeClaimToken'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toContain(".is('consumed_at', null)")
    expect(body).toContain(".is('revoked_at', null)")
    expect(body).toContain(".gt('expires_at'")
  })

  it('mint is idempotent and reports `exists` rather than a fresh token', () => {
    // The defect that silently killed emailed Space links: an unconditional mint rotated the token
    // on every re-run of an import. Returning a NEW token on an idempotent hit would be the same
    // bug wearing a different hat, because the caller would send a link the row does not carry.
    const fn = code.slice(code.indexOf('export async function mintClaimToken'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toContain('const existing = await getLiveClaim(subjectType, subjectId)')
    expect(body).toContain("return { minted: null, reason: 'exists' }")
    // A unique violation is a lost race, not an error.
    expect(body).toContain("'23505'")
  })

  it('rotate revokes BEFORE minting', () => {
    // The partial unique index allows one live token per subject, so minting first would violate
    // it; and a crash between the two must leave zero live links, never two.
    const fn = code.slice(code.indexOf('export async function rotateClaimToken'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    const revoke = body.indexOf('revokeClaimToken')
    const mint = body.indexOf('mintClaimToken')
    expect(revoke).toBeGreaterThan(-1)
    expect(mint).toBeGreaterThan(revoke)
  })

  it('revoke never deletes — the audit trail is the point', () => {
    expect(code).not.toContain('.delete(')
  })
})

describe('the table is service-role only', () => {
  const sql = readFileSync('supabase/migrations/20270130000000_claim_tokens_table.sql', 'utf8')
  const code = sql.replace(/^\s*--.*$/gm, '')

  it('RLS is enabled with NO policies (deny-all) and no grants', () => {
    expect(code).toContain('alter table public.claim_tokens enable row level security')
    expect(code).toContain('revoke all on public.claim_tokens from anon, authenticated')
    // A policy here would be the beginning of the same mistake: a claim token has no legitimate
    // browser reader, so the correct number of policies is zero.
    expect(code).not.toMatch(/create policy[\s\S]*claim_tokens/i)
    expect(code).not.toMatch(/grant\s+(select|all)[\s\S]{0,80}claim_tokens[\s\S]{0,40}to\s+(anon|authenticated)/i)
  })

  it('one LIVE token per subject is enforced by the database, not by app code', () => {
    // App-level idempotency loses races. The partial index is what makes it true under concurrency.
    expect(code).toContain('claim_tokens_one_live_per_subject')
    expect(code).toContain('where consumed_at is null and revoked_at is null')
  })

  it('tokens expire by default', () => {
    // The four column-based predecessors never expired, which is why disclosed tokens are still
    // live today.
    expect(code).toContain("expires_at     timestamptz not null default (now() + interval '30 days')")
  })

  it('carries the audit trail the old columns could not', () => {
    for (const col of ['created_by', 'sent_at', 'consumed_by', 'revoked_at', 'revoked_reason']) {
      expect(code).toContain(col)
    }
  })
})
