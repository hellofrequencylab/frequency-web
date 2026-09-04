// Stripe Connect — the payout foundation (Phase 1, ADR-175). Express connected
// accounts let a host/partner RECEIVE money from the four payout channels (paid
// memberships, event tickets, tips, store sales). This module is the shared
// plumbing every channel reuses: create + onboard an account, sync its capability
// flags from Stripe, and read payout-readiness for the UI. Server-only.
//
// Per-PROFILE account: one human = one Stripe Express account (one bank + one KYC),
// shared across every channel and persona they earn through. The per-persona
// `profile_personas.stripe_account_id` override is reserved for the multi-legal-
// entity case (a separate LLC) and is not wired in this phase.
//
// ENV-GATED, like the rest of billing: every function no-ops (returns null / an
// empty status) when `stripe` is unconfigured, so the surface degrades cleanly
// before keys are set. The new `profiles.stripe_*` columns aren't in the generated
// types yet, so reads/writes use the untyped-client cast (repo convention).

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { stripe, appUrl, billingEnabled } from './stripe'
import { hostPayoutsEnabledFlag } from '@/lib/platform-flags'
import { createAdminClient } from '@/lib/supabase/admin'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { getPersonaStates } from '@/lib/personas'

/** The single live-gate for every Connect payout channel: a configured Stripe key
 *  AND the operator-controlled `host_payouts_enabled` flag (default OFF). Tips,
 *  tickets, onboarding, and future channels all check this, so nothing goes live
 *  until an operator flips the switch (ADR-178). */
export async function payoutsLive(): Promise<boolean> {
  return billingEnabled() && (await hostPayoutsEnabledFlag())
}

// ── Connect payouts eligibility (ADR-175, AUTHZ-4) ───────────────────────────
// Who may receive payouts ("earners"): a community host+ (runs paid circles/events)
// OR anyone holding a partner persona (a business/practitioner who sells or is
// tipped). A plain member with no persona can't, so the card stays hidden for them.
// Lives here (server-only plumbing), NOT in a `'use server'` module — it is a pure
// capability predicate, not a callable RPC.
export async function canReceivePayouts(profileId: string, role: CommunityRole): Promise<boolean> {
  if (atLeastRole(role, 'host')) return true
  const personas = await getPersonaStates(profileId)
  return Object.values(personas).some((s) => s !== null && s !== 'suspended')
}

/** Payout-readiness for a profile, derived from the mirrored Stripe flags. */
export interface ConnectStatus {
  accountId: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  /** Finished the Stripe-hosted onboarding form (may still be under review). */
  onboarded: boolean
  /** Can actually receive money right now (charges AND payouts enabled). */
  ready: boolean
}

export interface ProfileConnectRow {
  stripe_account_id: string | null
  stripe_charges_enabled: boolean | null
  stripe_payouts_enabled: boolean | null
  stripe_details_submitted: boolean | null
  display_name?: string | null
}

/** Every column name on `public.profiles`, straight from the generated schema types. */
type ProfileColumn = keyof Database['public']['Tables']['profiles']['Row']

/**
 * 🔴 THE COLUMN LIST IS TYPE-CHECKED AGAINST THE REAL SCHEMA, AND THAT IS THE WHOLE POINT.
 *
 * This list used to be a hand-written string that ended `…, email, display_name` — and
 * `profiles.email` HAS NEVER EXISTED. PostgREST rejects a select naming an unknown column, so every
 * read through this constant returned `{ data: null, error: <42703> }`; every caller destructured
 * only `data` and read the null as a fact about the profile rather than a failed query. The damage
 * was not cosmetic:
 *
 *   · `getConnectStatus` reported accountId: null for a profile that HAD a connected account, so the
 *     settings card offered "Set up payouts" to someone already onboarded.
 *   · `getOrCreateConnectedAccount` never saw the existing `acct_…`, so it took the create branch
 *     EVERY time — minting a duplicate Express account per click, or throwing and surfacing as
 *     "Stripe could not complete that just now."
 *
 * `satisfies readonly ProfileColumn[]` makes a repeat a COMPILE error rather than a silent runtime
 * null: re-add `'email'` here and `pnpm exec tsc` fails naming it. A test could only have caught
 * this against a live database; the generated types are already the schema, so the compiler is the
 * cheaper and stricter gate.
 *
 * The Stripe `email` prefill that string was reaching for is gone rather than repaired: it was
 * always `undefined` in practice, Stripe's hosted onboarding collects the address itself, and the
 * real source is `auth.users.email` (a separate admin read), not this table.
 */
const CONNECT_COLUMNS = [
  'stripe_account_id',
  'stripe_charges_enabled',
  'stripe_payouts_enabled',
  'stripe_details_submitted',
  'display_name',
] as const satisfies readonly ProfileColumn[]

const COLS = CONNECT_COLUMNS.join(', ')

function db(): SupabaseClient {
  return createAdminClient()
}

/** Map a profile row (or null) to the derived payout status. Pure — no I/O. */
export function toStatus(row: ProfileConnectRow | null): ConnectStatus {
  const chargesEnabled = !!row?.stripe_charges_enabled
  const payoutsEnabled = !!row?.stripe_payouts_enabled
  const detailsSubmitted = !!row?.stripe_details_submitted
  return {
    accountId: row?.stripe_account_id ?? null,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    onboarded: detailsSubmitted,
    ready: chargesEnabled && payoutsEnabled,
  }
}

/** Read payout-readiness for a profile (UI). Never calls Stripe.
 *
 *  A read error still degrades to the empty status — a settings page must not throw an error
 *  boundary over a payouts card — but it is LOGGED rather than swallowed. Reading a failed query as
 *  "this profile has no account" is exactly how the `email` defect above stayed invisible, and
 *  AGENTS.md's rule applies: every fail-safe needs something that notices it fired. */
export async function getConnectStatus(profileId: string): Promise<ConnectStatus> {
  const { data, error } = await db().from('profiles').select(COLS).eq('id', profileId).maybeSingle()
  if (error) console.error('[connect] getConnectStatus profile read failed', error.message)
  return toStatus(data as ProfileConnectRow | null)
}

/**
 * Payout readiness for MANY profiles in one read (LIVE-126).
 *
 * The event form's price control has to answer "will this money land?" for every scope a host can
 * pick, and a space-hosted event pays the space OWNER (ADR-819) rather than the caller. Doing that
 * with `getConnectStatus` per scope is one round trip per option on a page that already runs several.
 *
 * Returns ONLY the ids that are ready. A missing id therefore reads as not ready at every call site,
 * which is the same direction `ticketSellerVerdict` fails and the correct one: telling a host the
 * money will land when we do not know is the failure that strands a buyer's payment.
 *
 * Respects the same platform gate the buy path does — when payouts are not live, nobody is ready.
 * Never calls Stripe.
 */
export async function getConnectReadyMap(profileIds: string[]): Promise<Record<string, boolean>> {
  const ids = [...new Set(profileIds.filter(Boolean))]
  if (ids.length === 0) return {}
  if (!(await payoutsLive())) return {}
  const { data, error } = await db()
    .from('profiles')
    .select('id, stripe_charges_enabled, stripe_payouts_enabled')
    .in('id', ids)
  // Fails CLOSED by design (an absent id reads as not-ready everywhere, which is the safe direction
  // for "will this money land?"), but it says so now. Its three siblings were changed to notice a
  // failed read in the same pass; leaving this one silent is how the file drifts back.
  if (error) console.error('[connect] getConnectReadyMap profile read failed', error.message)
  const out: Record<string, boolean> = {}
  for (const row of (data ?? []) as {
    id: string
    stripe_charges_enabled: boolean | null
    stripe_payouts_enabled: boolean | null
  }[]) {
    if (row.stripe_charges_enabled && row.stripe_payouts_enabled) out[row.id] = true
  }
  return out
}

/**
 * What a profile read means for the create-or-reuse decision. PURE + total.
 *
 * 🔴 A FAILED READ AND AN ABSENT ACCOUNT ARE OPPOSITE INSTRUCTIONS, and collapsing them is the whole
 * defect this function exists to prevent. Supabase hands back `data: null` in both cases: when the
 * profile genuinely has no connected account ("make one"), and when the query itself failed ("you do
 * not know yet"). The `email` typo above made every read the second kind while the caller read it as
 * the first, so the create branch ran on every click — minting a duplicate Express account each
 * time, each one orphaned from the profile that already had one.
 *
 * Separated out because the decision is the only interesting part and mocking a Supabase client to
 * reach it would test the mock (SCAN-532's lesson, one directory over).
 */
export type ConnectReadOutcome =
  | { kind: 'unknown'; message: string }
  | { kind: 'existing'; accountId: string }
  | { kind: 'create'; displayName: string | null }

export function connectReadOutcome(
  row: ProfileConnectRow | null,
  error: { message: string } | null | undefined,
): ConnectReadOutcome {
  if (error) return { kind: 'unknown', message: error.message }
  if (row?.stripe_account_id) return { kind: 'existing', accountId: row.stripe_account_id }
  return { kind: 'create', displayName: row?.display_name ?? null }
}

/** The profile's connected-account id, creating an Express account if none exists. */
export async function getOrCreateConnectedAccount(profileId: string): Promise<string | null> {
  if (!stripe) return null
  const { data, error } = await db().from('profiles').select(COLS).eq('id', profileId).maybeSingle()

  const outcome = connectReadOutcome(data as ProfileConnectRow | null, error)
  // Fail loudly rather than create on a read we could not trust; `viaStripe` renders it inline.
  if (outcome.kind === 'unknown') {
    throw new Error(`Could not read the payout profile (${outcome.message}).`)
  }
  if (outcome.kind === 'existing') return outcome.accountId

  const account = await stripe.accounts.create({
    type: 'express',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: { name: outcome.displayName ?? undefined },
    // The webhook + persistAccount resolve an Account back to its owner by this.
    metadata: { profile_id: profileId },
  })
  await db().from('profiles').update({ stripe_account_id: account.id }).eq('id', profileId)
  return account.id
}

/** A fresh Stripe-hosted onboarding link for the profile's account (links expire). */
export async function createOnboardingLink(profileId: string): Promise<string | null> {
  if (!stripe || !(await payoutsLive())) return null
  const accountId = await getOrCreateConnectedAccount(profileId)
  if (!accountId) return null
  const link = await stripe.accountLinks.create({
    account: accountId,
    // An expired/abandoned link bounces to refresh_url; a finished one to return_url.
    refresh_url: `${appUrl()}/settings/billing?payouts=refresh`,
    return_url: `${appUrl()}/settings/billing?payouts=return`,
    type: 'account_onboarding',
  })
  return link.url
}

/** Persist an Account's capability flags onto the owning profile. Returns the status.
 *  Resolves the owner by metadata.profile_id (set at create), else by account id. */
export async function persistAccount(account: Stripe.Account): Promise<ConnectStatus> {
  const update = {
    stripe_charges_enabled: !!account.charges_enabled,
    stripe_payouts_enabled: !!account.payouts_enabled,
    stripe_details_submitted: !!account.details_submitted,
  }
  const profileId = account.metadata?.profile_id
  if (profileId) await db().from('profiles').update(update).eq('id', profileId)
  else await db().from('profiles').update(update).eq('stripe_account_id', account.id)
  return toStatus({ stripe_account_id: account.id, ...update })
}

/** Fetch the live Account from Stripe and persist its flags (the on-return reconcile,
 *  complementing the async account.updated webhook). Returns the refreshed status. */
export async function syncConnectedAccount(profileId: string): Promise<ConnectStatus> {
  if (!stripe) return toStatus(null)
  const { data, error } = await db()
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', profileId)
    .maybeSingle()
  if (error) throw new Error(`Could not read the payout profile (${error.message}).`)
  const accountId = (data as { stripe_account_id: string | null } | null)?.stripe_account_id
  if (!accountId) return toStatus(null)
  const account = await stripe.accounts.retrieve(accountId)
  return persistAccount(account)
}

/** Express dashboard login link so a connected host can manage payouts/bank/details. */
export async function createDashboardLink(profileId: string): Promise<string | null> {
  if (!stripe) return null
  const { data, error } = await db()
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', profileId)
    .maybeSingle()
  if (error) throw new Error(`Could not read the payout profile (${error.message}).`)
  const accountId = (data as { stripe_account_id: string | null } | null)?.stripe_account_id
  if (!accountId) return null
  const link = await stripe.accounts.createLoginLink(accountId)
  return link.url
}
