import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

// Global "show demo content" switch — the single source of truth for whether
// seeded Beta demo content (is_demo rows) surfaces site-wide. Backed by
// platform_flags.demo_mode. Flip that row to false to hide ALL demo content at
// once (the soft kill switch; the hard purge is DELETE ... WHERE is_demo).
//
// Defaults to TRUE on any read failure so a transient DB hiccup never blanks the
// Beta community unexpectedly. Cached per request (React cache) so the many
// surfaces that gate on it share one round trip.
export const demoModeEnabled = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'demo_mode')
      .maybeSingle()
    return data?.value ?? true
  } catch {
    return true
  }
})

// The AI master switch (platform_flags.ai_enabled) — the operator kill switch that
// gates EVERY AI surface (Vera, winback, help search, the Profile Creator harvest).
// Defaults to FALSE on any read failure — fail closed for spend safety, matching
// lib/ai/usage.ts aiAvailable(). Read it to render operator state; the live gate is
// still aiAvailable() (this flag AND the env key).
export const aiEnabledFlag = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'ai_enabled')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
})

// Whether any seeded demo content actually exists right now (an `is_demo` row in
// the headline tables). The Beta demo toggle is pointless when there's nothing to
// hide/show, so the header hides it when this is false. Cheap existence probes;
// defaults TRUE on error so a transient DB hiccup never wrongly hides the control.
export const demoContentExists = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const [profiles, circles] = await Promise.all([
      admin.from('profiles').select('id', { head: true, count: 'exact' }).eq('is_demo', true),
      admin.from('circles').select('id', { head: true, count: 'exact' }).eq('is_demo', true),
    ])
    return (profiles.count ?? 0) > 0 || (circles.count ?? 0) > 0
  } catch {
    return true
  }
})

// Host payouts master switch (platform_flags.host_payouts_enabled) — gates the
// Connect marketplace (tips, event tickets, future store/membership payouts).
// Defaults to FALSE on any read failure: payments stay OFF until an operator turns
// them on, so the channels never go live by accident. The live gate is
// `payoutsLive()` (this flag AND a configured Stripe key).
export const hostPayoutsEnabledFlag = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'host_payouts_enabled')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
})

// Platform SMS switch (platform_flags.sms_enabled) — the operator kill-switch on the
// SMS channel ("text the group", ADR-256). Defaults FALSE on any read failure (and when
// the row is absent): SMS stays OFF until an operator turns it on at /admin/sms. This is
// ADDITIVE to the legal lock — the live gate (lib/comms/sms.ts) requires this flag ON AND
// the A2P 10DLC env provisioning set, and the env lock always overrides this switch.
// Defaults FALSE so a transient DB hiccup never opens the hardest-gated channel by
// accident. Cached per request.
export const smsEnabledFlag = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'sms_enabled')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
})

// Referral program master switch (platform_flags.referrals_enabled) — gates whether
// an owner-owned /q scan drops the `fq_ref` attribution cookie, so turning it off
// cleanly stops new referral credit (existing rewards are untouched). The reward
// amount itself lives in zap_config.invite_accepted (edited at /admin/gamification).
// Defaults to TRUE on any read failure so a transient DB hiccup never silently kills
// attribution while the program is meant to be on. Cached per request.
export const referralsEnabled = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'referrals_enabled')
      .maybeSingle()
    return data?.value ?? true
  } catch {
    return true
  }
})

// Open-feed switch (platform_flags.feed_open) — when ON, the main feed (feed_for_viewer)
// lifts its reach gate so every member sees every member's posts; when OFF, the normal
// "your circles + nearby" reach model applies. The LIVE gate is enforced DB-side inside
// feed_for_viewer (default false / closed on a missing row); this reader only renders the
// operator toggle's current state. Defaults to FALSE on a read error so the admin UI fails
// to the closed (private) reading rather than implying the feed is open.
export const feedOpenFlag = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'feed_open')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
})

// Host-prompt switch (platform_flags.beta_host_prompts) — gates the Lone-Wolf ->
// Local-Host graduation nudges on the member feed (the rank-gated "you're ready to
// start a Circle" prompt AND the "a few people near you are into this" ignition).
// Seeded FALSE (migration 20261124000000): the whole surface stays inert until an
// operator flips it, so nothing new appears on the feed until it is turned on.
// Defaults to FALSE on any read error — fail-closed, so a transient DB hiccup never
// switches the prompts on by accident. Cached per request.
export const betaHostPromptsFlag = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'beta_host_prompts')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
})

// THE ANNOUNCEMENT BANNER (platform_settings.announcement_message + announcement_ends_at).
//
// This replaced the metered beta clock. That clock was gated on a DATE alone, and the banner it drove
// carried a hardcoded sentence about the Founding Business rate; when ADR-1060 closed the window the
// sentence became false and kept rendering, because a date was still set. The message is the gate now,
// and the operator writes it, so a stale date is inert and no sentence can outlive what it described.
//
// DEFAULT UNSET → empty string → no banner. Fail-safe on any read error: a hiccup hides the banner,
// never shows a stale or broken one. Cached per request via getPlatformSetting.
export const announcementMessage = cache(async (): Promise<string> => {
  return (await getPlatformSetting('announcement_message', '')).trim()
})

// The OPTIONAL countdown the announcement banner shows beside its message. Decoration only: it never
// decides whether the banner renders (announcementMessage does) and it grants no access to anything.
// Null on a missing/unparseable value or any read error.
export const announcementEndsAt = cache(async (): Promise<Date | null> => {
  const raw = (await getPlatformSetting('announcement_ends_at', '')).trim()
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? null : new Date(ms)
})

// ── The events listing HORIZON (platform_settings.events_listing_horizon_days) ───────────────────
//
// How far ahead the community events listing (app/(main)/events/index-data.ts) will look. It gates
// the `.lte('starts_at', ...)` ceiling on all three of that loader's reads: circle events, public
// events, and the viewer's own hosted events.
//
// WHY IT EXISTS: the ceiling used to be a hardcoded 60 days. A host published a gathering 64 days
// out, it never appeared on the listing, and nothing anywhere said why — not the listing, not the
// event page, not the host's own library. An invisible event with no explanation is the worst
// failure this surface has. The owner ruled on 2026-08-20: "Remove that cap for now. Make it a
// setting in the admin."
//
// 🔴 ZERO MEANS NO CAP, and zero is the shipped default. A positive number caps the listing at that
// many days ahead; 0 (and a missing row, and any value that does not read as a non-negative whole
// number) means the loader OMITS its upper bound entirely and every upcoming event lists. There is
// deliberately no far-future sentinel date: an unbounded query is the honest expression of "no cap",
// and a sentinel is just a hardcoded 60 wearing a bigger number.
//
// FAIL-SAFE DIRECTION IS *NO CAP*, on purpose and against the usual instinct. Most flags in this
// file fail closed, because the risk they carry is a surface doing something (spending, sending,
// exposing). The risk HERE is the opposite: the bug was invisibility. A transient settings read
// failure must not be able to re-hide a host's event, so a throw, a missing row, and garbage all
// degrade to showing everything upcoming. The row budget still bounds the query (SERIES_WIDE_READ),
// so "no cap" is not "no limit".
//
// WHY platform_settings AND NOT platform_flags: `platform_flags.value` is `boolean NOT NULL`
// (supabase/migrations/20260603000001_demo_0_infrastructure.sql:73-77, re-verified against the live
// database 2026-08-20) — it is not a JSONB store and cannot hold a number, and widening it would
// break the SQL that reads it in a boolean context (`coalesce((select value from platform_flags
// where key = 'demo_mode'), true)` inside feed_for_viewer). `platform_settings` is the repo's
// key -> text store and is already where operator-tunable NUMBERS live (`events_series_display`,
// ADR-897). Same table, same reader, same writer; nothing new to learn.
//
// NO AUDIT LEDGER: platform_flag_events.value is boolean, so this number is unlogged, the same gap
// the series knobs carry. Do not build a parallel ledger for one integer.

/** The one platform_settings key. */
export const EVENTS_LISTING_HORIZON_KEY = 'events_listing_horizon_days'

/** The stored value that means "no ceiling at all" — and the shipped default. */
export const NO_LISTING_HORIZON = 0

/**
 * Coerce a stored setting into a non-negative whole number of days. NEVER throws.
 *
 * Anything that is not a non-negative finite number — an empty/absent row, text, a negative, a
 * fraction below 1, Infinity, NaN — returns 0, which the loader reads as NO CAP. Showing more is
 * the safe direction here (see the header): a garbage value must not be able to hide events.
 */
export function coerceListingHorizonDays(raw: unknown): number {
  // Only a number or a numeric string can be a horizon; everything else is no cap. Typed this way
  // rather than as a bare Number(raw) because Number() THROWS on a symbol, and a coercion whose
  // whole job is to be the fail-safe must not be the thing that throws.
  if (typeof raw !== 'number' && typeof raw !== 'string') return NO_LISTING_HORIZON
  const n = typeof raw === 'number' ? raw : Number(raw.trim())
  // Covers NaN, both infinities, negatives, a fraction under one whole day, and the empty row
  // (Number('') is 0). All of them mean no cap.
  if (!Number.isFinite(n) || n <= 0) return NO_LISTING_HORIZON
  return Math.floor(n)
}

/**
 * How many days ahead the events listing looks. 0 = no cap (the default). Cached per request, so
 * the loader's three reads share one round trip.
 *
 * FAIL-SAFE: a missing row, a malformed value, or any read error returns 0 — no cap, everything
 * upcoming lists.
 */
export const eventsListingHorizonDays = cache(async (): Promise<number> => {
  try {
    return coerceListingHorizonDays(await getPlatformSetting(EVENTS_LISTING_HORIZON_KEY, ''))
  } catch {
    return NO_LISTING_HORIZON
  }
})

/**
 * Persist the horizon. Returns the STORED value, not what was asked for, so an operator who types
 * "-5" or "3.7" sees what actually landed instead of believing their number took.
 * Operator-gated callers only (the server action re-verifies janitor).
 */
export async function setEventsListingHorizonDays(
  days: number,
  changedBy?: string | null,
): Promise<number> {
  const next = coerceListingHorizonDays(days)
  await setPlatformSetting(EVENTS_LISTING_HORIZON_KEY, String(next), changedBy ?? null)
  return next
}

// Vera AUTONOMY master switch (platform_flags.vera_autonomy_enabled) — the graduation gate that
// lets Vera SEND email autonomously (past propose-only, ADR-028). This is ALSO the global kill
// switch: OFF stops every autonomous send at once. Defaults to FALSE on a missing row OR any read
// error — fail-closed, so autonomy is off by default and a transient DB hiccup can never open it.
// The live gate is still the full circuit breaker (lib/ai/vera/circuit-breaker.ts) AND the send-gate;
// this flag is the first, most fundamental of them. Audited via platform_flag_events. Cached per request.
export const veraAutonomyEnabledFlag = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'vera_autonomy_enabled')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
})

// Vera circuit-breaker ARMED latch (platform_flags.vera_breaker_armed) — the anomaly trip. TRUE = armed
// (healthy); an anomaly trip flips it FALSE (disarmed) and it stays off until an operator manually
// re-arms. Autonomy may not send while disarmed. Defaults to TRUE on a missing row (the healthy, armed
// posture) so the breaker starts armed; the master switch above (default FALSE) is what keeps autonomy
// off until an owner opts in, so a default-armed breaker never means "sending". Cached per request.
export const veraBreakerArmedFlag = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'vera_breaker_armed')
      .maybeSingle()
    return data?.value ?? true
  } catch {
    // A read blip should not READ as "sending is fine"; but the master switch (fail-closed FALSE)
    // is the real gate, so returning true here is safe — autonomy stays off via the master.
    return true
  }
})

// Chat consolidation (ADR-896, platform_flags.chat_dm_routes_retired) — when TRUE the full-page
// DM route stops rendering and hands the conversation to the chat dock instead. The owner's ask
// was blunt: "All chats happen in the pop up on the lower right… that page should not exist."
//
// A FLAG rather than a deleted route, and rather than a next.config.ts redirect, for three
// reasons. (1) A config redirect is evaluated before routing and cannot read a database row, so
// it is only revertible by a deploy. (2) /messages/* is registered as an iOS universal-link path
// in public/.well-known/apple-app-site-association, so the route must keep EXISTING and answer;
// a render-time redirect does that, a deleted file does not. (3) Dock parity for legacy GROUP
// conversations (rename / leave / roster) had to land first; it did, and the owner flipped this
// ON, so the flag is now the revert path rather than a staging gate.
//
// SCOPE: this retires /messages/[id] — direct and group messages — and nothing else. Rooms live at
// /messages/r/[roomId] and are read by Spaces and Channels; a static segment outranks a dynamic
// one in Next's route matching, so a Room never falls into the gate below. That split is the
// owner's ruling: "We have a Room function that I want for Space members and Channel
// conversations. DMs and group messages are in the popup."
//
// Defaults FALSE on a missing row OR any read error. That direction is not a coin toss: a
// transient DB hiccup must never be able to make a member's messages unreachable, and "the old
// page still works" is the safe failure. Cached per request.
export const chatDmRoutesRetiredFlag = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'chat_dm_routes_retired')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
})

export interface FlagEvent {
  id: string
  flagKey: string
  value: boolean
  previous: boolean | null
  changedBy: string | null
  source: string
  createdAt: string | null
}

/** Set a boolean platform flag AND append an audit event (who/when/old→new).
 *  Service-role; call only from operator-gated paths. The flag write is
 *  authoritative; the audit insert is best-effort and never blocks the toggle. */
export async function setPlatformFlag(
  key: string,
  value: boolean,
  opts: { changedBy?: string | null; source?: 'admin' | 'setup' | 'system' } = {},
): Promise<void> {
  const admin = createAdminClient()
  const { data: prev } = await admin
    .from('platform_flags')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  const previous = (prev?.value ?? null) as boolean | null

  const { error } = await admin
    .from('platform_flags')
    .upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)

  try {
    const db = admin
    await db.from('platform_flag_events').insert({
      flag_key: key,
      value,
      previous,
      changed_by: opts.changedBy ?? null,
      source: opts.source ?? 'admin',
    })
  } catch {
    /* the audit ledger is best-effort; a failed log must not undo the toggle */
  }
}

// ── Text settings (platform_settings) ───────────────────────────────────────
// The string sibling of the boolean flags above. Same store pattern; service-role.

/** Read a TEXT platform setting. Cached per request; returns `fallback` on
 *  missing/error so a transient DB hiccup never breaks a read. */
export const getPlatformSetting = cache(async (key: string, fallback: string): Promise<string> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('platform_settings').select('value').eq('key', key).maybeSingle()
    return ((data?.value as string | undefined) ?? fallback) || fallback
  } catch {
    return fallback
  }
})

/** Set a TEXT platform setting (operator-gated paths only). */
export async function setPlatformSetting(key: string, value: string, changedBy?: string | null): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('platform_settings').upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
    updated_by: changedBy ?? null,
  })
  if (error) throw new Error(error.message)
}

/** Recent toggle history for a flag (newest first). Operator-only. */
export async function listFlagEvents(key: string, limit = 20): Promise<FlagEvent[]> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('platform_flag_events')
      .select('id, flag_key, value, previous, changed_by, source, created_at')
      .eq('flag_key', key)
      .order('created_at', { ascending: false })
      .limit(limit)
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      flagKey: String(r.flag_key),
      value: Boolean(r.value),
      previous: r.previous == null ? null : Boolean(r.previous),
      changedBy: (r.changed_by as string) ?? null,
      source: String(r.source ?? 'admin'),
      createdAt: (r.created_at as string) ?? null,
    }))
  } catch {
    return []
  }
}
