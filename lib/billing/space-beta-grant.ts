// THE PER-SPACE BETA PRICE GRANT — the IO half (ADR-1061). The pure decision lives in
// lib/pricing/beta.ts (`loadoutChargeArm`); this module is the only thing that touches the database
// for it, so the decision stays testable without one.
//
// WHAT IT IS. `spaces.beta_price_grant` is a private, per-Space fact: this Space checks out at the
// FOUNDING (beta) rate even though the beta window is shut and every public surface says list. The
// owner promised a handful of people the beta price before closing the window; the grant is where
// that promise lives so it stops living only in their memory (the OWN-022 failure mode).
//
// 🔴 IT IS NOT A DISCOUNT ENGINE AND IT IS NOT `is_comped`. `is_comped` means FREE. This means
// "charge them, at the older number". It moves ONE thing: which catalog price key the loadout
// checkout resolves. It touches no plan, no entitlement, no public surface.
//
// 🔴 THE COLUMN MAY NOT EXIST YET. The migration is staged in
// docs/proposals/OWN-023-space-beta-price-grant.sql and is the owner's to apply — a file in
// supabase/migrations/ asserts production has run it (check:migrations rule 4, ADR-1007). Selecting a
// column PostgREST does not know fails the WHOLE request with 42703, and this repo has already been
// bitten by exactly that: space-plan-checkout.ts once selected a non-existent `profiles.email` and
// silently lost the owner's saved Stripe customer id for every checkout. So the grant is NEVER read
// as part of another select. It is its own request, its own try/catch, and a missing column is
// reported as `unavailable` rather than swallowed as "no grant" — an operator surface that cannot
// tell those apart is a fail-safe with no gate that notices it fired.
//
// Server-only (admin client). The table is reached untyped (ADR-246) because the column is not in the
// generated types until the migration lands.

import { createAdminClient } from '@/lib/supabase/admin'

/** The grant as stored on a Space: whether it is set, and the audit stamps that say who set it when. */
export interface SpaceBetaPriceGrant {
  granted: boolean
  /** ISO instant the grant was last turned ON, or null (never granted, or granted pre-audit). */
  grantedAt: string | null
  /** The staff profile id that turned it on, or null. */
  grantedBy: string | null
}

/** A read of the grant. `unavailable` means we could not ask — the column is not deployed yet, or the
 *  query failed — and is deliberately DISTINCT from a `ok` read of `granted: false`. Callers that
 *  charge money collapse both to "no grant" (fail-safe, never under-charge); the operator surface
 *  renders them differently, because "not deployed" is an instruction and "not granted" is a state. */
export type SpaceBetaPriceGrantRead =
  | { kind: 'ok'; grant: SpaceBetaPriceGrant }
  | { kind: 'unavailable'; reason: 'not_deployed' | 'not_found' | 'error'; message: string }

/** Postgres' undefined_column. PostgREST surfaces it verbatim in `error.code`, and it is the ONE
 *  signal that separates "the migration has not been applied" from a genuine failure. */
const UNDEFINED_COLUMN = '42703'

/** The grant columns, as one select list. Named once so the reader and the writer cannot drift. */
const GRANT_COLUMNS = 'beta_price_grant, beta_price_granted_at, beta_price_granted_by'

/** The untyped admin surface this module needs (ADR-246: the columns are not in the generated types
 *  until the migration lands, so the typed client would reject them at compile time). */
interface UntypedSpaces {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c1: string, v1: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
      }
    }
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v1: string) => Promise<{ error: { code?: string; message?: string } | null }>
    }
  }
}

function spaces(): UntypedSpaces {
  return createAdminClient() as unknown as UntypedSpaces
}

/**
 * Read a Space's beta price grant, distinguishing "not granted" from "could not ask".
 * Service-role; the caller authorizes. Never throws.
 */
export async function readSpaceBetaPriceGrant(
  spaceId: string | null | undefined,
): Promise<SpaceBetaPriceGrantRead> {
  if (!spaceId) return { kind: 'unavailable', reason: 'not_found', message: 'No space id.' }
  try {
    const { data, error } = await spaces()
      .from('spaces')
      .select(`id, ${GRANT_COLUMNS}`)
      .eq('id', spaceId)
      .maybeSingle()
    if (error) {
      if (error.code === UNDEFINED_COLUMN) {
        return {
          kind: 'unavailable',
          reason: 'not_deployed',
          message:
            'The beta price grant column is not in the database yet. Apply docs/proposals/OWN-023-space-beta-price-grant.sql first.',
        }
      }
      return { kind: 'unavailable', reason: 'error', message: error.message ?? 'Could not read the grant.' }
    }
    const row = data as {
      id?: string
      beta_price_grant?: unknown
      beta_price_granted_at?: unknown
      beta_price_granted_by?: unknown
    } | null
    if (!row?.id) return { kind: 'unavailable', reason: 'not_found', message: 'We could not find that space.' }
    return {
      kind: 'ok',
      grant: {
        granted: row.beta_price_grant === true,
        grantedAt: typeof row.beta_price_granted_at === 'string' ? row.beta_price_granted_at : null,
        grantedBy: typeof row.beta_price_granted_by === 'string' ? row.beta_price_granted_by : null,
      },
    }
  } catch (e) {
    return { kind: 'unavailable', reason: 'error', message: e instanceof Error ? e.message : 'Could not read the grant.' }
  }
}

/**
 * Does this Space carry the private beta price grant? The one question the CHECKOUT asks.
 *
 * FAIL-SAFE FALSE, in the repo's pricing direction: an unreadable answer (column not deployed, row
 * missing, query failed) charges the LIST price. Under-charging is money we chose not to take;
 * over-charging a granted Space is a promise broken, but it is a promise we can honour with a refund
 * and a lock, whereas a silent grant applied to the wrong Space is revenue that never existed. The
 * same direction `isBetaPricingActive` takes on an unparseable constant.
 */
export async function spaceHasBetaPriceGrant(spaceId: string | null | undefined): Promise<boolean> {
  const read = await readSpaceBetaPriceGrant(spaceId)
  return read.kind === 'ok' && read.grant.granted
}

/** The result of a grant write: ok, or a human-readable reason it did not happen. */
export type SpaceBetaPriceGrantWrite = { ok: true } | { ok: false; error: string }

/**
 * Grant or revoke the private beta price for a Space (operator). Service-role; the CALLER authorizes
 * (the admin action is janitor-gated and audits the change).
 *
 * Granting stamps `beta_price_granted_at` + `beta_price_granted_by`; revoking CLEARS both, so the
 * stamps always describe the grant that is currently in force rather than a historical one. The audit
 * trail of every flip lives in `admin_audit_log`, which is append-only; these two columns exist so the
 * row itself answers "who promised this, and when" without a join.
 *
 * REVOKING DOES NOT UN-CHARGE ANYONE. Once the Space has subscribed, its `locked_price_id` re-bills
 * the founding price forever and the grant is no longer consulted (`loadoutChargeArm` checks the lock
 * first). Revoke only ever affects a Space that has not checked out yet.
 */
export async function setSpaceBetaPriceGrant(
  spaceId: string,
  granted: boolean,
  actorId: string | null,
): Promise<SpaceBetaPriceGrantWrite> {
  if (!spaceId) return { ok: false, error: 'We could not find that space.' }
  const patch: Record<string, unknown> = granted
    ? {
        beta_price_grant: true,
        beta_price_granted_at: new Date().toISOString(),
        beta_price_granted_by: actorId,
      }
    : { beta_price_grant: false, beta_price_granted_at: null, beta_price_granted_by: null }
  try {
    const { error } = await spaces().from('spaces').update(patch).eq('id', spaceId)
    if (!error) return { ok: true }
    if (error.code === UNDEFINED_COLUMN) {
      return {
        ok: false,
        error:
          'The beta price grant column is not in the database yet. Apply docs/proposals/OWN-023-space-beta-price-grant.sql first.',
      }
    }
    return { ok: false, error: error.message ?? 'Could not save that change.' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save that change.' }
  }
}
