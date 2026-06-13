// Vera's poster-quality observer — the qualitative layer on top of the
// deterministic honesty bands (lib/events/poster-quality.ts). The bands already
// scale the Zaps reward automatically; Vera's job is to look at the PATTERN
// behind a band and draft one of two things into the existing creator_tips
// draft-and-approve queue:
//
//   • kind 'tip'  — a warm coaching nudge to a genuine poster whose events just
//     need better picking/timing. Sendable to the member ONLY after a janitor
//     approves it (the same draft -> approved -> sent flow as creator tips).
//   • kind 'flag' — an internal spam/quality note for the admin. NEVER sent to
//     the member; "send" is disabled for flags, and resolving one only marks it
//     reviewed. Vera never punishes anyone unreviewed; the bands already
//     throttle the reward, a flag just summarizes the pattern for a human.
//
// Who gets reviewed: every poster whose band is 'watch' or 'throttled', plus any
// poster with 5+ posted events (high volume is worth a look even when healthy).
// Posters with a live (draft/approved) event tip or flag are skipped. One model
// call per poster, capped per run, grounded ONLY in the supplied numbers.
//
// Budget: an ADMIN analysis surface like creator-tips — gated by the platform AI
// switch + its own per-feature daily cap, never a member feature's budget.
// Server-only; all callers gate at the action layer (janitor).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { aiAvailable, featureOverBudget, recordAiUsage } from './usage'
import { completeText, AiUnavailableError } from './complete'
import { withVoice } from './voice'
import { getPosterQuality, type PosterQuality } from '@/lib/events/poster-quality'

function db(): SupabaseClient {
  return createAdminClient()
}

const FEATURE = 'poster-observer'

// How many posters one generation run may review (bounds spend per click).
const MAX_REVIEWS_PER_RUN = 10
// How many recent posted events feed the evidence for one review.
const RECENT_EVENTS_PER_POSTER = 6
// How many posts make a poster worth reviewing even with a healthy band.
const HIGH_VOLUME_POSTED = 5

export type ReviewKind = 'tip' | 'flag'

/**
 * Pure selection predicate: does this poster's pattern need Vera's attention?
 * Watch/throttled bands always do; a healthy band with high volume gets a look
 * too (a prolific genuine poster can still use a coaching nudge). Exported for
 * unit tests and so the threshold lives in exactly one place.
 */
export function needsReview(quality: PosterQuality): boolean {
  return quality.band === 'watch' || quality.band === 'throttled' || quality.posted >= HIGH_VOLUME_POSTED
}

export interface PosterReviewCandidate {
  posterId: string
  quality: PosterQuality
}

/**
 * The posters whose pattern needs review this run: distinct posters of
 * published posted events, minus anyone with a live (draft/approved) event
 * tip or flag, scored with getPosterQuality and filtered by needsReview.
 * Capped at MAX_REVIEWS_PER_RUN so a run stays fast and bounded.
 */
export async function reviewCandidates(): Promise<PosterReviewCandidate[]> {
  const admin = db()
  const [{ data: eventRows }, { data: coveredRows }] = await Promise.all([
    admin
      .from('events')
      .select('posted_by_profile_id')
      .eq('status', 'published')
      .not('posted_by_profile_id', 'is', null),
    admin
      .from('creator_tips')
      .select('creator_id')
      .eq('content_type', 'event')
      .in('status', ['draft', 'approved']),
  ])

  const covered = new Set(
    ((coveredRows ?? []) as { creator_id: string }[]).map((r) => String(r.creator_id)),
  )
  const posterIds = Array.from(
    new Set(
      ((eventRows ?? []) as { posted_by_profile_id: string | null }[])
        .map((r) => r.posted_by_profile_id)
        .filter((id): id is string => !!id),
    ),
  ).filter((id) => !covered.has(id))

  const out: PosterReviewCandidate[] = []
  for (const posterId of posterIds) {
    if (out.length >= MAX_REVIEWS_PER_RUN) break
    const quality = await getPosterQuality(posterId)
    if (needsReview(quality)) out.push({ posterId, quality })
  }
  return out
}

// --- Evidence: the poster's recent posted events, with real numbers ----------

interface RecentPostedEvent {
  id: string
  title: string
  publishedAt: string | null
  going: number
  claimed: boolean
  removed: boolean
}

/** The poster's most recent published outreach posts (same definition as
 *  poster-quality: poster_scan or posted for someone else), each with its
 *  going-RSVP count (excluding the poster's own RSVP). */
async function recentPostedEvents(posterId: string): Promise<RecentPostedEvent[]> {
  const admin = db()
  const { data } = await admin
    .from('events')
    .select('id, title, published_at, claimed_at, removed_at, host_id, source')
    .eq('posted_by_profile_id', posterId)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(RECENT_EVENTS_PER_POSTER * 2)

  const rows = ((data ?? []) as Record<string, unknown>[])
    .filter((e) => {
      const hostId = (e.host_id as string | null) ?? null
      const source = (e.source as string | null) ?? null
      return source === 'poster_scan' || hostId !== posterId
    })
    .slice(0, RECENT_EVENTS_PER_POSTER)

  const ids = rows.map((e) => String(e.id))
  const goingByEvent = new Map<string, number>()
  if (ids.length) {
    const { data: rsvps } = await admin
      .from('event_rsvps')
      .select('event_id, profile_id, status')
      .in('event_id', ids)
      .eq('status', 'going')
    for (const r of (rsvps ?? []) as { event_id: string; profile_id: string }[]) {
      if (String(r.profile_id) === posterId) continue
      const key = String(r.event_id)
      goingByEvent.set(key, (goingByEvent.get(key) ?? 0) + 1)
    }
  }

  return rows.map((e) => ({
    id: String(e.id),
    title: typeof e.title === 'string' ? e.title : 'Untitled event',
    publishedAt: (e.published_at as string | null) ?? null,
    going: goingByEvent.get(String(e.id)) ?? 0,
    claimed: !!e.claimed_at,
    removed: !!e.removed_at,
  }))
}

// --- The one model call per poster --------------------------------------------

const OBSERVER_SYSTEM = `You are Vera, the Frequency guide, reviewing how one member's posted town events have been landing. A human admin reviews everything you write; nothing reaches the member without their approval. You are given the poster's honesty band and counts, plus their recent posted events with real numbers. Judge the PATTERN across all of it, not any single event.

If this reads like a genuine member whose events just need better picking or timing, write a warm coaching tip addressed to the poster: 2-4 sentences, with one or two concrete, doable suggestions (for example: fewer, better-chosen events; posters with clear dates and places; events people nearby can actually attend). Open with what is working when anything is.

If this reads like farming or spam (high volume, near-zero engagement, removals), write a concise internal note for the admin instead: summarize the pattern in plain language and recommend what to do (keep watching, remove the events, or note that the throttle already stands automatically). The member never sees a flag, so write it to the admin, not to the poster.

Rules for every word: never shame or accuse the member; describe what the numbers show, not who they are. Ground every claim in the supplied numbers only; never invent, estimate, or round a number you were not given. The honesty bands already scale the reward automatically, so never threaten or promise punishment. Never use an em dash; use a period or comma instead. No emojis. Plain language, no jargon.

Output ONLY a JSON object on a single line, nothing else:
{"kind":"tip","text":"..."} for a coaching tip to the poster, or
{"kind":"flag","text":"..."} for an internal note to the admin.`

interface ObserverVerdict {
  kind: ReviewKind
  text: string
}

/** Parse the model's `{kind, text}` JSON, tolerating code fences. Returns null
 *  on anything malformed so the caller skips instead of inserting junk. */
export function parseVerdict(raw: string): ObserverVerdict | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    const parsed = JSON.parse(cleaned) as { kind?: unknown; text?: unknown }
    const kind = parsed.kind
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : ''
    if ((kind === 'tip' || kind === 'flag') && text) return { kind, text: text.slice(0, 1000) }
  } catch {
    // fall through
  }
  return null
}

function evidenceBlock(quality: PosterQuality, recent: RecentPostedEvent[]): string {
  const rate = Math.round(quality.engagementRate * 100)
  const lines = recent.map((e) => {
    const bits = [
      e.publishedAt ? `published ${e.publishedAt.slice(0, 10)}` : 'publish date unknown',
      `${e.going} going`,
      e.claimed ? 'claimed by the organizer' : 'not claimed',
    ]
    if (e.removed) bits.push('removed by staff')
    return `- "${e.title}": ${bits.join(', ')}`
  })
  return [
    `Honesty band: ${quality.band}.`,
    `Counts: ${quality.posted} posted, ${quality.engaged} engaged, ${quality.claimed} claimed, ${quality.removed} removed. Engagement rate ${rate}%.`,
    `Recent posted events:`,
    ...lines,
  ].join('\n')
}

/**
 * Review the posters whose pattern needs attention and draft a tip or flag for
 * each into the creator_tips queue (status 'draft'; nothing reaches a member
 * without janitor approval). Returns how many drafts were created and how many
 * candidates were skipped (no events, a malformed verdict, or a failed call).
 * Throws AiUnavailableError when AI is off or this feature is over its cap.
 */
export async function generatePosterReviews(actorId: string): Promise<{ created: number; skipped: number }> {
  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) {
    throw new AiUnavailableError('AI is off or over budget for today')
  }

  const candidates = await reviewCandidates()
  let created = 0
  let skipped = 0

  for (const c of candidates) {
    try {
      const recent = await recentPostedEvents(c.posterId)
      if (!recent.length) {
        skipped += 1
        continue
      }
      const res = await completeText({
        system: withVoice(OBSERVER_SYSTEM),
        messages: [
          {
            role: 'user',
            content: `EVIDENCE (the only numbers you may use):\n${evidenceBlock(c.quality, recent)}\n\nJudge the pattern and output the JSON verdict.`,
          },
        ],
        tier: 'haiku',
        maxTokens: 400,
      })
      await recordAiUsage({ feature: FEATURE, model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId: actorId })
      const verdict = parseVerdict(res.text)
      if (!verdict) {
        skipped += 1
        continue
      }
      const { error } = await db().from('creator_tips').insert({
        creator_id: c.posterId,
        content_type: 'event',
        content_id: recent[0].id,
        kind: verdict.kind,
        status: 'draft',
        draft_text: verdict.text,
        evidence: {
          band: c.quality.band,
          posted: c.quality.posted,
          engaged: c.quality.engaged,
          claimed: c.quality.claimed,
          removed: c.quality.removed,
          engagementRate: Math.round(c.quality.engagementRate * 100) / 100,
          recentTitles: recent.map((e) => e.title),
        },
      })
      if (error) skipped += 1
      else created += 1
    } catch (e) {
      if (e instanceof AiUnavailableError) throw e
      skipped += 1
    }
  }

  return { created, skipped }
}

/**
 * Resolve an internal flag: mark it reviewed (status 'approved', reviewer
 * stamped) WITHOUT any notification. Flags never reach the member; the honesty
 * bands already throttle the reward, so reviewing a flag is the whole action.
 * Scoped to kind 'flag' so a tip can never be silently swallowed by this path.
 */
export async function resolveFlag(id: string, reviewedBy: string): Promise<void> {
  const { error } = await db()
    .from('creator_tips')
    .update({ status: 'approved', reviewed_by: reviewedBy })
    .eq('id', id)
    .eq('kind', 'flag')
    .in('status', ['draft', 'approved'])
  if (error) throw new Error(error.message)
}
