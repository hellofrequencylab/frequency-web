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

// Beta invite-only switch (platform_flags.beta_invite_only) — the master gate on NEW-account creation
// during the beta. When OFF (the default), signup is OPEN exactly as today. When ON, only an ADMITTED
// beta contact or an already-existing member/staff may create an account (enforced in the passwordless
// signup path: app/sign-in/actions.ts + app/auth/callback/route.ts). Existing members are NEVER blocked.
// Defaults to FALSE on any read failure — FAIL OPEN, so a transient DB hiccup can never wall off signup
// or lock anyone out. Cached per request.
export const betaInviteOnly = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'beta_invite_only')
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

// The metered beta clock (platform_settings.beta_ends_at) — the timestamp the in-product countdown
// banner ("Summer of Frequency ends Sept 1") counts down to. Stored as ISO text in platform_settings
// (platform_flags.value is boolean-only). DEFAULT UNSET → returns null → no banner. Returns null on a
// missing/unparseable value or any read error (fail-safe: a hiccup hides the banner, never shows a
// broken date). Cached per request via getPlatformSetting.
export const betaEndsAt = cache(async (): Promise<Date | null> => {
  const raw = (await getPlatformSetting('beta_ends_at', '')).trim()
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? null : new Date(ms)
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
