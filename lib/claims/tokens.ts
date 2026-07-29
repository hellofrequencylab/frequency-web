import 'server-only'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// ── THE CLAIM-TOKEN SYSTEM (ADR-907) ──────────────────────────────────────────────────────
//
// One way to mint, send, verify, consume and revoke the capability secrets that transfer
// ownership of a seeded entity. Use this for EVERY new claim flow. Do not add a
// `claim_token text` column to an entity table: that shape produced the identical live
// privilege escalation four times (events, spaces, market_listings, listings), because those
// tables are anon-readable at the ROW level and Postgres RLS cannot hide a column.
//
// `server-only`: this module reads and writes secrets on the service-role client. Importing it
// into a Client Component is a build error, which is the cheapest possible guard against the
// class of bug this file exists to end.

/** Entities that can be claimed. Adding a fifth is one enum value here and one in the table's
 *  CHECK constraint — no new column, no new exposure. */
export type ClaimSubjectType = 'space' | 'event' | 'market_listing' | 'listing'

export interface MintedClaim {
  /** 🔴 The PLAINTEXT token. This is the ONLY moment it exists. It is never stored and cannot be
   *  read back: the database holds sha256 of it. Put it straight into the link you are sending
   *  and do not log it. To "get it again", rotate. */
  token: string
  id: string
  expiresAt: string
}

export interface ResolvedClaim {
  id: string
  subjectType: ClaimSubjectType
  subjectId: string
  expiresAt: string
  sentAt: string | null
}

const TOKEN_BYTES = 24 // 192 bits of CSPRNG output
const DEFAULT_TTL_DAYS = 30

// ── Untyped handle ────────────────────────────────────────────────────────────────────────
// `claim_tokens` is new and not in lib/database.types.ts yet. Same pattern (and same reason) as
// lib/spaces/claim.ts's ClaimQuery: reach the table through a narrow structural interface rather
// than regenerating types in the same commit that adds the table. The interface is deliberately
// minimal — it exposes only the operations this module performs, so a stray `.delete()` on the
// audit trail does not typecheck.
interface TokenQuery {
  select: (cols: string) => TokenQuery
  insert: (row: Record<string, unknown>) => TokenQuery
  update: (patch: Record<string, unknown>) => TokenQuery
  eq: (col: string, val: unknown) => TokenQuery
  is: (col: string, val: null) => TokenQuery
  gt: (col: string, val: unknown) => TokenQuery
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { code?: string } | null }>
  then: Promise<{ data: unknown; error: { code?: string } | null }>['then']
}
function table(): TokenQuery {
  return (createAdminClient() as unknown as { from: (t: string) => TokenQuery }).from('claim_tokens')
}

/** url-safe, 192-bit. Same entropy as the tokens this replaces; the change is where it lives. */
function mintSecret(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/** sha256, unsalted, fast — correct for a high-entropy capability token. See the migration's
 *  column comment for why this is NOT the password-hashing mistake it resembles. */
export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time compare of two hashes. The lookup below is by hash equality in the database, so
 *  this is belt-and-braces for any caller that compares in application code. */
export function claimHashEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Mint a claim token for an entity, or return the LIVE one if it already has an unconsumed,
 * unrevoked, unexpired token.
 *
 * 🔴 IDEMPOTENT BY DEFAULT, and that is a correctness requirement rather than a nicety. The
 * Space seeder's mint was not, so re-approving an already-applied intake silently rotated the
 * token and killed every claim link already emailed to a real business owner: they get a 404 on
 * a link we sent, and we hear nothing. Here the partial unique index enforces one live token per
 * subject, so even a race cannot produce two.
 *
 * ⚠️ Because the plaintext is not stored, an idempotent hit CANNOT return the token — there is
 * nothing to return. It returns `null` with `reason: 'exists'`, and the caller's choice is to
 * send nothing or to `rotateClaimToken`. That is the deliberate cost of not storing secrets, and
 * it is the right trade: a system that can re-read a live token is a system that can leak one.
 */
export async function mintClaimToken(
  subjectType: ClaimSubjectType,
  subjectId: string,
  opts: { createdBy?: string | null; ttlDays?: number } = {},
): Promise<{ minted: MintedClaim } | { minted: null; reason: 'exists' | 'error' }> {
  const existing = await getLiveClaim(subjectType, subjectId)
  if (existing) return { minted: null, reason: 'exists' }

  const token = mintSecret()
  const ttl = Math.max(1, Math.floor(opts.ttlDays ?? DEFAULT_TTL_DAYS))
  const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data, error } = await table()
      .insert({
        subject_type: subjectType,
        subject_id: subjectId,
        token_hash: hashClaimToken(token),
        created_by: opts.createdBy ?? null,
        expires_at: expiresAt,
      })
      .select('id, expires_at')
      .maybeSingle()
    // A unique violation means a concurrent mint won the race. Report `exists` rather than
    // returning a token the row does not carry: that is exactly how a dead link gets emailed.
    if (error || !data) return { minted: null, reason: error?.code === '23505' ? 'exists' : 'error' }
    return { minted: { token, id: data.id as string, expiresAt: data.expires_at as string } }
  } catch {
    return { minted: null, reason: 'error' }
  }
}

/** The live (unconsumed, unrevoked, unexpired) claim for an entity, without its secret. Lets an
 *  operator console answer "does this have a link out?" and "when does it die?" without ever
 *  touching the token. */
export async function getLiveClaim(
  subjectType: ClaimSubjectType,
  subjectId: string,
): Promise<ResolvedClaim | null> {
  try {
    const { data } = await table()
      .select('id, subject_type, subject_id, expires_at, sent_at')
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .is('consumed_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!data) return null
    return {
      id: data.id as string,
      subjectType: data.subject_type as ClaimSubjectType,
      subjectId: data.subject_id as string,
      expiresAt: data.expires_at as string,
      sentAt: (data.sent_at as string | null) ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Resolve a presented token to its subject, or null.
 *
 * FAIL-CLOSED on every axis: unknown hash, consumed, revoked, or expired all return null and are
 * indistinguishable to the caller, so a guessed token learns nothing about which of those it hit.
 */
export async function resolveClaimToken(token: string): Promise<ResolvedClaim | null> {
  if (!token || token.length < 16) return null
  try {
    const { data } = await table()
      .select('id, subject_type, subject_id, expires_at, sent_at')
      .eq('token_hash', hashClaimToken(token))
      .is('consumed_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!data) return null
    return {
      id: data.id as string,
      subjectType: data.subject_type as ClaimSubjectType,
      subjectId: data.subject_id as string,
      expiresAt: data.expires_at as string,
      sentAt: (data.sent_at as string | null) ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Consume a token as part of a claim. COMPARE-AND-SET on (hash, unconsumed, unrevoked, unexpired),
 * so concurrent presentations of the same link let exactly ONE claimer win — the caller must treat
 * a false return as "someone else already claimed this" and must not transfer ownership.
 *
 * The caller performs the ownership transfer; this only closes the token. Order matters: consume
 * FIRST, transfer second, so a crash between them leaves an unclaimed entity with a dead link
 * (recoverable by re-minting) rather than a claimed entity with a live link (a second takeover).
 */
export async function consumeClaimToken(token: string, profileId: string): Promise<ResolvedClaim | null> {
  if (!token || !profileId) return null
  try {
    const { data } = await table()
      .update({ consumed_at: new Date().toISOString(), consumed_by: profileId })
      .eq('token_hash', hashClaimToken(token))
      .is('consumed_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id, subject_type, subject_id, expires_at, sent_at')
      .maybeSingle()
    if (!data) return null
    return {
      id: data.id as string,
      subjectType: data.subject_type as ClaimSubjectType,
      subjectId: data.subject_id as string,
      expiresAt: data.expires_at as string,
      sentAt: (data.sent_at as string | null) ?? null,
    }
  } catch {
    return null
  }
}

/** Stamp that the link actually went out. Distinct from `created_at` so an operator console can
 *  tell "minted but never sent" from "sent and ignored" — the old columns could answer neither. */
export async function markClaimSent(id: string): Promise<boolean> {
  try {
    const { error } = await table().update({ sent_at: new Date().toISOString() }).eq('id', id)
    return !error
  } catch {
    return false
  }
}

/** Kill a live token. Revoked, never deleted: the audit trail is the point, and a deleted row
 *  cannot answer "was this link ever live?" after an incident. */
export async function revokeClaimToken(
  subjectType: ClaimSubjectType,
  subjectId: string,
  reason: string,
): Promise<boolean> {
  try {
    const { error } = await table()
      .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .is('consumed_at', null)
      .is('revoked_at', null)
    return !error
  } catch {
    return false
  }
}

/**
 * Revoke the live token and mint a fresh one. THE supported way to "get the link again", because
 * the plaintext of the existing one is unrecoverable by construction.
 *
 * Revoke first: the partial unique index permits only one live token per subject, so minting
 * before revoking would violate it. Ordering this way also means a crash between the two leaves
 * the entity with NO live link rather than two.
 */
export async function rotateClaimToken(
  subjectType: ClaimSubjectType,
  subjectId: string,
  opts: { createdBy?: string | null; ttlDays?: number; reason?: string } = {},
): Promise<{ minted: MintedClaim } | { minted: null; reason: 'exists' | 'error' }> {
  await revokeClaimToken(subjectType, subjectId, opts.reason ?? 'rotated by operator')
  return mintClaimToken(subjectType, subjectId, opts)
}
