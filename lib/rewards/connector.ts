// Connector rewards — the event-invite capture loop's gamification (ADR-154 / ADR-777).
//
// Rewards the REAL OUTCOME of a member's captured event guest, never a bare row insert
// (the anti-farm doctrine, ADR-154 §4: "adding a row is NEVER a payout"). The outcomes,
// in ascending realness, and what each pays the INVITER:
//
//   capture — the guest filled the RSVP capture form                small ⚡  (2)
//   rsvp    — the guest stated going/maybe                          ⚡        (4)
//   attend  — the guest showed up (verified member check-in)        ⚡⚡       (8)
//   join    — the guest signed up for Frequency                     ⚡⚡ + 💎  (8 + 5)
//
// Every grant is:
//   • IDEMPOTENT — a deterministic reward_grants rule_key
//     `connector:<outcome>:<inviter>:<guestKey>` means a re-fire (retry, resubmit,
//     re-check-in) can never double-pay. Mirrors the practice.verified / Spark
//     claim-then-pay pattern (lib/rewards/spark.ts, lib/achievements.ts).
//   • DAILY-CAPPED per inviter — at most CONNECTOR_DAILY_CAP connector grants per
//     inviter per UTC day, so a member cannot farm the loop by capturing crowds.
//   • FAIL-SAFE — every IO path is wrapped; a reward failure NEVER throws to the
//     capture / RSVP / attendance / signup flow that called it.
//
// The pure grant/threshold logic (outcome → amount, count → tier, what counts as a
// real connection) lives at the top with NO Supabase/Next imports, so it unit-tests in
// isolation. The IO below is the only part that touches the DB. Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import { awardZaps } from '@/lib/zaps'
import { awardGems } from '@/lib/gems'
import { processGamificationEvent } from '@/lib/achievements'

// ── PURE: the reward economy (source of truth for connector amounts) ─────────────

export type ConnectorOutcome = 'capture' | 'rsvp' | 'attend' | 'join'

export interface ConnectorReward {
  /** Zaps paid to the inviter for this outcome (external / in-person → zaps). */
  zaps: number
  /** Gems paid on top (only the join outcome carries a 💎 bonus). */
  gems: number
}

/** The deterministic payout per outcome. Small at capture, larger the realer the
 *  outcome gets — reward the OUTCOME, not the insert (ADR-154). */
export const CONNECTOR_REWARDS: Record<ConnectorOutcome, ConnectorReward> = {
  capture: { zaps: 2, gems: 0 }, // small ⚡ — a real human filled the form
  rsvp:    { zaps: 4, gems: 0 }, // ⚡
  attend:  { zaps: 8, gems: 0 }, // ⚡⚡
  join:    { zaps: 8, gems: 5 }, // ⚡⚡ + 💎
}

/** PURE: the reward for an outcome (zeros for an unknown outcome). */
export function connectorReward(outcome: ConnectorOutcome): ConnectorReward {
  return CONNECTOR_REWARDS[outcome] ?? { zaps: 0, gems: 0 }
}

/** Max connector reward grants per inviter per UTC day (anti-farm throttle). The hard
 *  guarantee is the per-outcome idempotency key; this bounds a capture spree. */
export const CONNECTOR_DAILY_CAP = 25

/** The gem action key the join 💎 bonus is paid under (needs a gem_config row —
 *  seeded in the connector migration; a missing row makes the gem leg a safe no-op). */
export const CONNECTOR_JOIN_GEM_ACTION = 'connector_join'

// ── PURE: the "real connection" predicate + the Connector achievement tiers ──────

export type GuestRsvpStatus = 'going' | 'maybe' | 'declined' | null | undefined

/**
 * PURE: is this captured guest a REAL connection — i.e. did the outcome actually
 * happen? A real connection is a captured guest who at least RSVP'd (going/maybe) OR
 * joined Frequency. A bare capture (declined / no stated intent, not joined) is NOT a
 * real connection — it never advances the Connector achievement (ADR-154: reward the
 * outcome, not the raw capture).
 */
export function isRealConnection(guest: { rsvpStatus?: GuestRsvpStatus; joined?: boolean }): boolean {
  if (guest.joined) return true
  return guest.rsvpStatus === 'going' || guest.rsvpStatus === 'maybe'
}

/** Which connector OUTCOMES count as a real connection (advance the achievement). */
export function outcomeIsRealConnection(outcome: ConnectorOutcome): boolean {
  return outcome === 'rsvp' || outcome === 'attend' || outcome === 'join'
}

export interface ConnectorTier {
  slug: string
  threshold: number
}

/** The Connector achievement tiers — 10 / 25 / 100 real connections (ADR-154). */
export const CONNECTOR_TIERS: readonly ConnectorTier[] = [
  { slug: 'connector-10', threshold: 10 },
  { slug: 'connector-25', threshold: 25 },
  { slug: 'connector-100', threshold: 100 },
] as const

/** PURE: the highest Connector tier a real-connection count has reached, or null. */
export function connectorTier(count: number): ConnectorTier | null {
  let reached: ConnectorTier | null = null
  for (const tier of CONNECTOR_TIERS) {
    if (count >= tier.threshold) reached = tier
  }
  return reached
}

/** PURE: the deterministic idempotency key for one (outcome, inviter, guest) grant. */
export function connectorRuleKey(outcome: ConnectorOutcome, inviterProfileId: string, guestKey: string): string {
  return `connector:${outcome}:${inviterProfileId}:${guestKey}`
}

/** PURE: the start-of-UTC-day ISO timestamp for a moment (the daily-cap window floor). */
export function utcDayStart(at: Date = new Date()): string {
  return `${at.toISOString().slice(0, 10)}T00:00:00.000Z`
}

// ── IO: the grant engine (fail-safe, idempotent, daily-capped) ───────────────────

export interface GrantConnectorInput {
  /** The inviter (QR owner) being rewarded — resolved server-side, never the client. */
  inviterProfileId: string
  outcome: ConnectorOutcome
  /** A stable per-guest key (event_guests id, or `<eventId>:<email>`), for the rule key. */
  guestKey: string
  /** Extra context stored on the ledger rows. */
  meta?: Record<string, unknown>
}

export interface GrantConnectorResult {
  granted: boolean
  /** True when skipped because this (outcome, inviter, guest) was already paid. */
  duplicate?: boolean
  /** True when skipped because the inviter hit the per-day cap. */
  capped?: boolean
  zaps: number
  gems: number
}

/**
 * Grant one connector outcome to the inviter, idempotently + daily-capped, best-effort.
 *
 * Order: check the per-inviter daily cap → claim the deterministic reward_grants row
 * (the UNIQUE (rule_key, profile_id) insert is the lock; a re-fire loses the race and
 * skips) → pay zaps (+ gems for join) through the canonical award paths so the grant
 * lands in the Vault ledger. If NOTHING was paid, release the claim so a later retry can
 * re-pay. A real-connection outcome then re-evaluates the Connector achievement.
 *
 * Never throws: any failure returns { granted: false } so the caller's capture / RSVP /
 * attendance / signup flow is untouched.
 */
export async function grantConnectorOutcome(input: GrantConnectorInput): Promise<GrantConnectorResult> {
  const inviterProfileId = (input.inviterProfileId || '').trim()
  const guestKey = (input.guestKey || '').trim()
  const outcome = input.outcome
  const none: GrantConnectorResult = { granted: false, zaps: 0, gems: 0 }

  try {
    if (!inviterProfileId || !guestKey || !CONNECTOR_REWARDS[outcome]) return none
    const reward = connectorReward(outcome)
    if (reward.zaps <= 0 && reward.gems <= 0) return none

    const admin = createAdminClient()
    const ruleKey = connectorRuleKey(outcome, inviterProfileId, guestKey)

    // Anti-farm: bound total connector grants per inviter per UTC day. The per-outcome
    // rule_key below is the hard no-double-pay guard; this is the soft daily throttle.
    const { count: todayCount } = await admin
      .from('reward_grants')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', inviterProfileId)
      .like('rule_key', 'connector:%')
      .gte('granted_at', utcDayStart())
    if ((todayCount ?? 0) >= CONNECTOR_DAILY_CAP) {
      return { ...none, capped: true }
    }

    // Claim-then-pay: the UNIQUE (rule_key, profile_id) row is the once-per-outcome lock.
    const { error: claimErr } = await admin.from('reward_grants').insert({
      rule_key: ruleKey,
      profile_id: inviterProfileId,
      reward_kind: reward.gems > 0 ? 'gems' : 'zaps',
      amount: reward.zaps,
      detail: `connector:${outcome}`,
    })
    if (claimErr) return { ...none, duplicate: true } // already paid / lost the race

    const meta = { rule: ruleKey, outcome, ...(input.meta ?? {}) }
    let paidZaps = 0
    let paidGems = 0

    if (reward.zaps > 0) {
      const r = await awardZaps(inviterProfileId, reward.zaps, {
        actionType: `connector_${outcome}`,
        metadata: meta,
      })
      if (r.awarded) paidZaps = r.amount
    }
    if (reward.gems > 0) {
      // The join 💎 bonus. Needs a gem_config row (connector migration); if it's absent
      // (pre-migration) awardGems returns not-awarded and the zaps leg still stands.
      const g = await awardGems(inviterProfileId, CONNECTOR_JOIN_GEM_ACTION as never, reward.gems, meta)
      if (g.awarded) paidGems = g.amount
    }

    // If nothing landed, release the claim so a later retry can re-pay (else the row
    // would be a claimed-but-unpaid tombstone forever). If anything paid, keep it.
    if (paidZaps === 0 && paidGems === 0) {
      await admin.from('reward_grants').delete().eq('rule_key', ruleKey).eq('profile_id', inviterProfileId)
      return none
    }

    // A real-connection outcome advances the Connector achievement (idempotent inside
    // the achievements engine). A bare capture never does.
    if (outcomeIsRealConnection(outcome)) {
      await processGamificationEvent({ type: 'connector_connection', profileId: inviterProfileId }).catch(() => {})
    }

    return { granted: true, zaps: paidZaps, gems: paidGems }
  } catch (err) {
    console.error('[connector] grant failed:', err instanceof Error ? err.message : err)
    return none
  }
}

// ── IO: the three call-site seams (each fail-safe, each adds a hook, rewrites nothing) ─

/**
 * CAPTURE seam — called at the end of captureEventGuest (lib/events/guests.ts). Pays the
 * small capture ⚡ for any captured guest, and the RSVP ⚡ on top when the guest stated
 * going/maybe (a real connection). A declined / blank capture earns only the capture ⚡.
 */
export async function rewardConnectorCapture(input: {
  inviterProfileId: string
  eventId: string
  guestId: string | null
  email: string
  rsvpStatus?: GuestRsvpStatus
}): Promise<void> {
  try {
    const inviter = (input.inviterProfileId || '').trim()
    const email = (input.email || '').trim().toLowerCase()
    if (!inviter || !email) return
    // Stable key: the guest row id when present, else event+email (dedup on resubmit).
    const guestKey = (input.guestId || '').trim() || `${(input.eventId || '').trim()}:${email}`

    await grantConnectorOutcome({
      inviterProfileId: inviter,
      outcome: 'capture',
      guestKey,
      meta: { eventId: input.eventId, email },
    })

    if (isRealConnection({ rsvpStatus: input.rsvpStatus })) {
      await grantConnectorOutcome({
        inviterProfileId: inviter,
        outcome: 'rsvp',
        guestKey,
        meta: { eventId: input.eventId, email, rsvpStatus: input.rsvpStatus },
      })
    }
  } catch {
    // best-effort: a reward failure never breaks the capture triple-write
  }
}

/**
 * ATTEND seam — called at the end of a verified member check-in (checkInEvent). If the
 * member who checked in was captured as a guest for THIS event by one or more inviters,
 * each inviter earns the attend ⚡⚡ (their invitee showed up). Matched by email through
 * the inviter's event_guests capture. Idempotent + capped + fail-safe.
 */
export async function rewardConnectorAttendanceForCheckin(
  eventId: string,
  attendeeProfileId: string,
): Promise<void> {
  try {
    const evId = (eventId || '').trim()
    const profileId = (attendeeProfileId || '').trim()
    if (!evId || !profileId) return

    const admin = createAdminClient()
    // The attendee's email lives on their linked marketing contact (contacts.profile_id),
    // not on profiles. Untyped handle (contacts not in generated types, ADR-246).
    const db = admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: unknown) => {
            eq: (col: string, val: unknown) => Promise<{ data: unknown }>
            maybeSingle: () => Promise<{ data: { email?: string | null } | null }>
          }
        }
      }
    }
    const { data: contact } = await db.from('contacts').select('email').eq('profile_id', profileId).maybeSingle()
    const email = (contact?.email || '').trim().toLowerCase()
    if (!email) return

    const { data: guests } = await db.from('event_guests').select('id, inviter_profile_id').eq('event_id', evId).eq('email', email)
    const rows = (guests as { id?: string; inviter_profile_id?: string }[] | null) ?? []
    for (const g of rows) {
      const inviter = (g.inviter_profile_id || '').trim()
      if (!inviter || inviter === profileId) continue // never self-reward
      await grantConnectorOutcome({
        inviterProfileId: inviter,
        outcome: 'attend',
        guestKey: (g.id || '').trim() || `${evId}:${email}`,
        meta: { eventId: evId, email },
      })
    }
  } catch {
    // best-effort: a reward failure never breaks the check-in
  }
}

/**
 * JOIN seam — called from the signup hook (completeOnboarding) after claimLeadOnSignup.
 * A new member's email may match one or more inviters' event-sourced personal contacts
 * (network_contacts, source='event'); each such inviter earns the join ⚡⚡ + 💎 (the
 * person they captured actually joined Frequency). Idempotent + capped + fail-safe.
 */
export async function rewardConnectorJoinOnSignup(email: string | null | undefined): Promise<void> {
  try {
    const key = (email || '').trim().toLowerCase()
    if (!key || !key.includes('@')) return

    const admin = createAdminClient()
    const db = admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: unknown) => { eq: (col: string, val: unknown) => Promise<{ data: unknown }> }
        }
      }
    }
    // Each event-sourced personal card for this email points back to an inviter (owner_id).
    const { data } = await db.from('network_contacts').select('id, owner_id').eq('email', key).eq('source', 'event')
    const rows = (data as { id?: string; owner_id?: string }[] | null) ?? []
    const seen = new Set<string>()
    for (const c of rows) {
      const inviter = (c.owner_id || '').trim()
      if (!inviter || seen.has(inviter)) continue
      seen.add(inviter)
      await grantConnectorOutcome({
        inviterProfileId: inviter,
        outcome: 'join',
        guestKey: (c.id || '').trim() || key,
        meta: { email: key, via: 'signup' },
      })
    }
  } catch {
    // best-effort: a reward failure never breaks signup
  }
}
