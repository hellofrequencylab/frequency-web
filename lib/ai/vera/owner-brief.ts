// Vera daily OWNER BRIEF (CRM Master Build Plan · Phase 7). Turns Vera's "Today" from a pull-only
// operator screen into the daily PUSH the owner asked for: once a day, compose the top Today moves
// into a short brief and email it to the operator (platform staff) and to each Space owner.
//
// Hard boundaries, by design:
//   • READ + COMPOSE only. It reuses buildTodayCards() (the same fail-safe 5-card ranker the screen
//     uses) and NEVER acts on a card. No playbook runs from here; the brief just points the owner at
//     Today, where every move is still a human one-tap through the governed execute path.
//   • Sends go through resolveSendGate (consent + suppression) + the durable outbox (enqueueEmail),
//     never inline. Frequency-capped to once per day per recipient (a 20h window guards a double
//     cron fire). A recipient who has not opted in to lifecycle email, or is suppressed, is skipped.
//   • FAIL-SAFE: every send is wrapped so one bad recipient never aborts the run, and the run never
//     throws (the cron stays green even when the brief is empty or a lookup fails).
//
// server-only: this module reaches the service-role admin client + the send path, so it must stay
// OUT of any client-reachable import graph. It is imported ONLY by the vera-owner-brief cron route.
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { withVoice } from '@/lib/ai/voice'
import { buildTodayCards, type TodayCard } from '@/lib/ai/vera/today'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

/** The Resend tag stamped on every brief email, so the frequency check can find prior briefs. */
const OWNER_BRIEF_TAG = 'vera_owner_brief'

/** One brief per recipient per day. The 20h window (slightly under a day) makes the cap a real
 *  idempotency guard against a double cron fire without blocking tomorrow's brief. */
const FREQUENCY_WINDOW_MS = 20 * 60 * 60 * 1000
const FREQUENCY_CAP = 1

// ── Compose ──────────────────────────────────────────────────────────────────────

export interface OwnerBrief {
  subject: string
  /** The brief body (inner HTML). The unsubscribe footer is added per-recipient at send time. */
  html: string
  text: string
  /** The AI-or-deterministic in-voice opener. */
  intro: string
  cardCount: number
  laterCount: number
}

/**
 * Compose the brief for a scope. Returns null when there is nothing to surface (a hollow brief is
 * never sent). Pass a `spaceId` for a per-Space owner's brief, or omit it for the platform brief.
 * READ-ONLY: reuses buildTodayCards and never acts on a card.
 */
export async function buildOwnerBrief(opts: { spaceId?: string | null } = {}): Promise<OwnerBrief | null> {
  const { cards, laterCount } = await buildTodayCards({ spaceId: opts.spaceId ?? null })
  if (cards.length === 0) return null

  const intro = await draftBriefIntro(cards, laterCount)
  const subject = `Your Frequency brief: ${cards.length} ${cards.length === 1 ? 'move' : 'moves'} today`
  return {
    subject,
    html: briefHtml(intro, cards, laterCount),
    text: briefText(intro, cards, laterCount),
    intro,
    cardCount: cards.length,
    laterCount,
  }
}

/** Deterministic, in-voice opener (used when AI is off / over budget). Plain, no dashes. */
function deterministicIntro(cards: TodayCard[], laterCount: number): string {
  const n = cards.length
  const lead = `${n} ${n === 1 ? 'member needs' : 'members need'} a small move today.`
  const tail = laterCount > 0 ? ` ${laterCount} more are on the Later shelf for when you have time.` : ''
  return `Morning. ${lead}${tail} Here they are, each one tap in Today.`
}

const BRIEF_SYSTEM = withVoice(
  `You write the single opening line of a daily brief email to a community operator (the person who runs the place). You get how many members need attention today, how many are on a "Later" shelf, and a few first names with a short reason. Write EXACTLY one short, plain line, no preamble, no list, no dashes: name the size of today's list and point them to open Today. Do not invent facts beyond what you are given. Return ONLY the one line.`,
)

/** Draft the opener. Best-effort AI (haiku), deterministic fallback. Never throws. */
async function draftBriefIntro(cards: TodayCard[], laterCount: number): Promise<string> {
  const fallback = deterministicIntro(cards, laterCount)
  try {
    if (!(await aiAvailable()) || (await featureOverBudget('today'))) return fallback
    const signal = JSON.stringify({
      needs_you_today: cards.length,
      later_shelf: laterCount,
      people: cards.slice(0, 3).map((c) => ({ name: c.name, why: c.whyNow })),
    })
    const res = await completeText({
      system: BRIEF_SYSTEM,
      messages: [{ role: 'user', content: signal }],
      tier: 'haiku',
      maxTokens: 80,
      cacheSystem: true,
    })
    await recordAiUsage({ feature: 'today', model: res.tier, usage: res.usage, costUsd: res.costUsd })
    const line = (res.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)[0]
    return line || fallback
  } catch (e) {
    if (e instanceof AiUnavailableError) return fallback
    return fallback
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The brief body. Inline styles for mail-client compatibility (email is not app UI; the rest of
 *  lib/email uses literal hex the same way). Plain, in voice, no dashes. */
function briefHtml(intro: string, cards: TodayCard[], laterCount: number): string {
  const rows = cards
    .map(
      (c) => `
    <div style="border-left:3px solid #E2912F;padding:2px 0 2px 14px;margin:0 0 16px;">
      <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#8F8675;">${escapeHtml(c.context)} · ${escapeHtml(c.playbookName)}</p>
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#3D352A;">${escapeHtml(c.name)}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#6B6253;line-height:1.55;">${escapeHtml(c.whyNow)}</p>
      <p style="margin:0;font-size:14px;color:#3D352A;line-height:1.55;">${escapeHtml(c.actionDraft)}</p>
    </div>`,
    )
    .join('')
  const later = laterCount > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:#8F8675;">${laterCount} more are on the Later shelf.</p>` : ''
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;">
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#9A5E12;margin:0 0 8px;">Vera · Today</p>
    <p style="font-size:16px;color:#3D352A;line-height:1.6;margin:0 0 20px;">${escapeHtml(intro)}</p>
    ${rows}
    ${later}
    <p style="margin:24px 0 0;"><a href="${BASE_URL}/admin/crm/today" style="display:inline-block;background:#E2912F;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:10px;">Open Today &rarr;</a></p>
  </div>`
}

function briefText(intro: string, cards: TodayCard[], laterCount: number): string {
  const lines: string[] = [intro, '']
  for (const c of cards) {
    lines.push(`${c.name} (${c.context} · ${c.playbookName})`)
    lines.push(`  ${c.whyNow}`)
    lines.push(`  ${c.actionDraft}`)
    lines.push('')
  }
  if (laterCount > 0) lines.push(`${laterCount} more are on the Later shelf.`, '')
  lines.push(`Open Today: ${BASE_URL}/admin/crm/today`)
  return lines.join('\n') + '\n'
}

// ── Send ───────────────────────────────────────────────────────────────────────

export interface OwnerBriefRecipient {
  profileId: string
  email: string
  /** The Space this brief scopes to (per-Space owner brief), or null for the platform brief. */
  spaceId?: string | null
  spaceName?: string | null
}

export type OwnerBriefSendReason =
  | 'ok'
  | 'no_email'
  | 'nothing_to_surface'
  | 'error'
  // plus any SendGateReason (suppressed / no_consent / pref_off / frequency_cap / ...)
  | string

/**
 * Compose + send one recipient's brief. Fail-safe (never throws). The send routes through
 * resolveSendGate (consent + suppression) and the durable outbox, frequency-capped to once/day.
 * NEVER acts on a card.
 */
export async function sendOwnerBrief(
  recipient: OwnerBriefRecipient,
  opts: { now?: Date } = {},
): Promise<{ sent: boolean; reason: OwnerBriefSendReason }> {
  try {
    if (!recipient.email || !recipient.email.includes('@')) return { sent: false, reason: 'no_email' }

    const brief = await buildOwnerBrief({ spaceId: recipient.spaceId ?? null })
    if (!brief) return { sent: false, reason: 'nothing_to_surface' }

    const now = opts.now ?? new Date()
    const sentInWindow = await countRecentBriefs(recipient.email, now)

    // Lifecycle email: consent + suppression + the per-day frequency cap, all fail-closed.
    const gate = await resolveSendGate(recipient.profileId, 'email', 'lifecycle', {
      email: recipient.email,
      frequency: { sentInWindow, cap: FREQUENCY_CAP },
    })
    if (!gate.allowed) return { sent: false, reason: gate.reason }

    const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: BASE_URL, profileId: recipient.profileId, category: 'lifecycle' })
    await enqueueEmail({
      to: recipient.email,
      subject: brief.subject,
      html: brief.html + unsubscribeFooterHtml(unsubscribeUrl),
      text: brief.text + `\nUnsubscribe or manage emails: ${unsubscribeUrl}\n`,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
      tags: [{ name: OWNER_BRIEF_TAG, value: '1' }],
    })
    return { sent: true, reason: 'ok' }
  } catch {
    return { sent: false, reason: 'error' }
  }
}

function unsubscribeFooterHtml(unsubscribeUrl: string): string {
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:0 24px 24px;">
    <hr style="border:none;border-top:1px solid #E9E1D4;margin:8px 0 16px;"/>
    <p style="font-size:12px;color:#8F8675;">You're getting this because you run a community on Frequency. <a href="${unsubscribeUrl}" style="color:#8F8675;">Turn off the daily brief</a> or manage emails any time.</p>
  </div>`
}

/** Count prior owner-brief emails to this address inside the frequency window (the per-day cap +
 *  double-fire guard). Fail-safe: on any error it returns 0 (permit) rather than silently blocking
 *  the owner's own brief. Reads the outbox tag stamped by sendOwnerBrief. */
async function countRecentBriefs(email: string, now: Date): Promise<number> {
  try {
    const admin = createAdminClient()
    const since = new Date(now.getTime() - FREQUENCY_WINDOW_MS).toISOString()
    const { data, error } = await admin
      .from('notification_queue')
      .select('payload')
      .eq('kind', 'email')
      .gte('created_at', since)
      .limit(2000)
    if (error || !data) return 0
    let n = 0
    for (const r of data as { payload: unknown }[]) {
      const p = r.payload as { to?: string; tags?: { name?: string }[] } | null
      if (!p || p.to !== email) continue
      if (Array.isArray(p.tags) && p.tags.some((t) => t?.name === OWNER_BRIEF_TAG)) n += 1
    }
    return n
  } catch {
    return 0
  }
}

// ── Run (the cron worker) ────────────────────────────────────────────────────────

export interface OwnerBriefRunResult {
  candidates: number
  sent: number
  skipped: number
  errors: number
}

/**
 * The daily worker the cron calls. Collects recipients (platform operators + active Space owners),
 * composes + sends each brief. FAIL-SAFE: per-recipient and per-collection errors are swallowed so
 * the run always completes and returns counts; it never throws.
 */
export async function runOwnerBriefs(opts: { now?: Date } = {}): Promise<OwnerBriefRunResult> {
  const now = opts.now ?? new Date()
  const recipients = await collectRecipients()
  let sent = 0
  let skipped = 0
  let errors = 0
  for (const r of recipients) {
    try {
      const res = await sendOwnerBrief(r, { now })
      if (res.sent) sent += 1
      else if (res.reason === 'error') errors += 1
      else skipped += 1
    } catch {
      errors += 1
    }
  }
  return { candidates: recipients.length, sent, skipped, errors }
}

/** Platform operators (web_role staff) get the platform brief; each active Space owner gets a
 *  brief scoped to their Space. Deduped by scope. Fail-safe: a broken read yields fewer recipients,
 *  never a throw. */
async function collectRecipients(): Promise<OwnerBriefRecipient[]> {
  const admin = createAdminClient()
  const out: OwnerBriefRecipient[] = []
  const seen = new Set<string>()

  // Platform operators -> platform-scope brief.
  try {
    const { data: ops } = await admin
      .from('profiles')
      .select('id, auth_user_id, web_role')
      .in('web_role', ['admin', 'janitor'])
    for (const p of (ops ?? []) as { id: string; auth_user_id: string | null }[]) {
      const key = `platform:${p.id}`
      if (seen.has(key)) continue
      const email = await emailForAuthUser(admin, p.auth_user_id)
      if (!email) continue
      seen.add(key)
      out.push({ profileId: p.id, email, spaceId: null })
    }
  } catch {
    /* fail-safe */
  }

  // Active Space owners -> per-Space brief.
  try {
    const { data: spaces } = await admin
      .from('spaces')
      .select('id, name, owner_profile_id, status')
      .eq('status', 'active')
    for (const s of (spaces ?? []) as { id: string; name: string | null; owner_profile_id: string | null }[]) {
      if (!s.owner_profile_id) continue
      const key = `space:${s.id}`
      if (seen.has(key)) continue
      const email = await emailForProfileId(admin, s.owner_profile_id)
      if (!email) continue
      seen.add(key)
      out.push({ profileId: s.owner_profile_id, email, spaceId: s.id, spaceName: s.name })
    }
  } catch {
    /* fail-safe */
  }

  return out
}

type AdminClient = ReturnType<typeof createAdminClient>

/** Resolve an auth user's email (the send address). Fail-safe to null. */
async function emailForAuthUser(admin: AdminClient, authUserId: string | null): Promise<string | null> {
  if (!authUserId) return null
  try {
    const { data } = await admin.auth.admin.getUserById(authUserId)
    const email = data?.user?.email ?? null
    return email && email.includes('@') ? email : null
  } catch {
    return null
  }
}

/** Resolve a profile's send address via its auth user. Fail-safe to null. */
async function emailForProfileId(admin: AdminClient, profileId: string): Promise<string | null> {
  try {
    const { data } = await admin.from('profiles').select('auth_user_id').eq('id', profileId).maybeSingle()
    const authId = (data as { auth_user_id?: string | null } | null)?.auth_user_id ?? null
    return emailForAuthUser(admin, authId)
  } catch {
    return null
  }
}
