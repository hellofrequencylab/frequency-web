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

interface ProfileConnectRow {
  stripe_account_id: string | null
  stripe_charges_enabled: boolean | null
  stripe_payouts_enabled: boolean | null
  stripe_details_submitted: boolean | null
  email?: string | null
  display_name?: string | null
}

const COLS =
  'stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, email, display_name'

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

/** Read payout-readiness for a profile (UI). Never calls Stripe. */
export async function getConnectStatus(profileId: string): Promise<ConnectStatus> {
  const { data } = await db().from('profiles').select(COLS).eq('id', profileId).maybeSingle()
  return toStatus(data as ProfileConnectRow | null)
}

/** The profile's connected-account id, creating an Express account if none exists. */
export async function getOrCreateConnectedAccount(profileId: string): Promise<string | null> {
  if (!stripe) return null
  const { data } = await db().from('profiles').select(COLS).eq('id', profileId).maybeSingle()
  const row = data as ProfileConnectRow | null
  if (row?.stripe_account_id) return row.stripe_account_id

  const account = await stripe.accounts.create({
    type: 'express',
    email: row?.email ?? undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: { name: row?.display_name ?? undefined },
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
  const { data } = await db()
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', profileId)
    .maybeSingle()
  const accountId = (data as { stripe_account_id: string | null } | null)?.stripe_account_id
  if (!accountId) return toStatus(null)
  const account = await stripe.accounts.retrieve(accountId)
  return persistAccount(account)
}

/** Express dashboard login link so a connected host can manage payouts/bank/details. */
export async function createDashboardLink(profileId: string): Promise<string | null> {
  if (!stripe) return null
  const { data } = await db()
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', profileId)
    .maybeSingle()
  const accountId = (data as { stripe_account_id: string | null } | null)?.stripe_account_id
  if (!accountId) return null
  const link = await stripe.accounts.createLoginLink(accountId)
  return link.url
}
