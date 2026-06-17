// Journeys v2 — the LEARN/player read helpers (the "follow-along course" overhaul). The player
// view (lib/journeys/store.ts) gives the tree + per-lesson content but, by design, drops two
// things a follower needs to read the Journey as a course: the library content behind a
// `practice` block (its summary / cadence / duration / Pillar / the "Why it works / How to do it"
// body markdown), and each phase's focus text (the phase block's `body`). This module composes
// those over the existing reads — it never edits lib/journey-plans.ts — so the learn page can
// render rich, cohesive detail. Server-only (rides the same admin handle as the reads it calls).

import { createAdminClient } from '@/lib/supabase/admin'
import { getPlan, normalizeJourneyMeeting, planPillarMap, type JourneyPlan, type JourneyMeeting, type JourneyPlanItem } from '@/lib/journey-plans'
import { getRankedPractice, type RankedPractice } from '@/lib/practices'
import { getPillars, pillarsById, type Pillar } from '@/lib/pillars'

/** A phase's focus copy (the phase block's body) keyed by the phase item id — so each week of
 *  the player reads as a chapter, not a bare heading. */
export type PhaseFocusMap = Map<string, string>

/** The per-Pillar coverage of a Journey (always all four, zero-filled), for the balance read. */
export interface PillarBalanceSlice {
  pillar: Pillar
  count: number
}

/** Everything the learn page needs ON TOP of the player view: the resolved library practice for
 *  every `practice` block (keyed by ITEM id, so the player can look up the selected lesson), each
 *  phase's focus copy, the normalized meeting, and the four-Pillar balance. One extra read per
 *  distinct practice (batched + de-duped), plus the pillars taxonomy. */
export interface JourneyLearnExtras {
  /** The library practice behind each `practice` block, keyed by the block's ITEM id. */
  practiceByItem: Map<string, RankedPractice>
  /** Each phase's focus copy (phase block body), keyed by the phase item id. */
  phaseFocus: PhaseFocusMap
  /** How the Circle gathers around the Journey (all-null when unset). */
  meeting: JourneyMeeting
  /** Four-Pillar coverage, in display order, zero-filled. */
  pillarBalance: PillarBalanceSlice[]
  /** The pillars taxonomy, for mapping a practice's domain_id → its Pillar on a step. */
  pillars: Pillar[]
}

/** Load the learn-page extras for a plan's items. `items` is the already-loaded item list (the
 *  page reads it via the player view's plan; we re-read the plan by slug to get item bodies the
 *  player view drops). Batched: one practice read per distinct practice id, run in parallel. */
export async function getJourneyLearnExtras(slug: string): Promise<JourneyLearnExtras> {
  const [loaded, pillars] = await Promise.all([getPlan(slug), getPillars()])
  const items = loaded?.items ?? []

  // Phase focus copy: a phase block carries its week's focus in `body`.
  const phaseFocus: PhaseFocusMap = new Map()
  for (const it of items) {
    // block_type is widened at runtime to the v2 set (phase/module/...); the BlockType union is
    // narrower, so coerce to string for the phase check.
    if (String(it.block_type ?? 'practice') === 'phase' && it.body?.trim()) phaseFocus.set(it.id, it.body.trim())
  }

  // The practice behind every `practice` block. De-dupe by practice id (a Journey may reuse one),
  // load each once in parallel, then fan the result back out to every item that points at it.
  const practiceItems = items.filter((it) => (it.block_type ?? 'practice') === 'practice' && it.practice_id)
  const distinctIds = [...new Set(practiceItems.map((it) => it.practice_id))]
  const loadedPractices = await Promise.all(distinctIds.map((id) => getRankedPractice(id)))
  const byId = new Map<string, RankedPractice>()
  distinctIds.forEach((id, i) => {
    const p = loadedPractices[i]
    if (p) byId.set(id, p)
  })
  const practiceByItem = new Map<string, RankedPractice>()
  for (const it of practiceItems) {
    const p = byId.get(it.practice_id)
    if (p) practiceByItem.set(it.id, p)
  }

  return {
    practiceByItem,
    phaseFocus,
    meeting: normalizeJourneyMeeting(loaded?.plan.meeting),
    pillarBalance: buildPillarBalance(items, pillars),
    pillars,
  }
}

/** The Journey's four-Pillar coverage, zero-filled and in display order (mirrors the discovery
 *  PillarBalanceBlock, but returns the full Pillar so a step can render its name + badge). */
export function buildPillarBalance(items: JourneyPlanItem[], pillars: Pillar[]): PillarBalanceSlice[] {
  const coverage = new Map(planPillarMap(items).map((s) => [s.domainId, s.count]))
  return pillars.map((pillar) => ({ pillar, count: coverage.get(pillar.id) ?? 0 }))
}

/** The untyped discovery/delivery attributes the plan row carries (read untyped in
 *  lib/journey-plans.ts — difficulty/category/tags/daily_minutes are not on the JourneyPlan type
 *  yet). One coercion point so the page reads them safely without a cast at every use. */
export interface JourneyAttributes {
  difficulty: string | null
  category: string | null
  tags: string[]
  dailyMinutes: number | null
}

/** Coerce a plan's untyped discovery/delivery attributes into a clean, bounded shape. */
export function journeyAttributes(plan: JourneyPlan): JourneyAttributes {
  const p = plan as unknown as {
    difficulty?: unknown
    category?: unknown
    tags?: unknown
    daily_minutes?: unknown
  }
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    difficulty: str(p.difficulty),
    category: str(p.category),
    tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [],
    dailyMinutes: typeof p.daily_minutes === 'number' && p.daily_minutes > 0 ? Math.round(p.daily_minutes) : null,
  }
}

/** A Journey's linked Event (meeting.eventId), resolved to the bits the learn page links to. */
export interface LinkedEvent {
  slug: string
  title: string
  /** Event start (ISO), for a date line. May be null on a date-less draft. */
  startsAt: string | null
}

/** Resolve a Journey's linked Event by id (the `meeting.eventId` set from the "Create Event" flow)
 *  to its slug + title + start, so the meeting block can link to `/events/[slug]`. Null when the id
 *  is unset or the event is gone (the page then falls back to a plain "Linked event" line). Reads
 *  the events table directly through the same admin handle the other Journey reads use — mirrors
 *  getKickoffEvent in lib/journeys/runs.ts (no event-lib file is edited). */
export async function getLinkedEvent(eventId: string | null): Promise<LinkedEvent | null> {
  if (!eventId) return null
  const { data } = await createAdminClient()
    .from('events')
    .select('slug, title, starts_at')
    .eq('id', eventId)
    .maybeSingle()
  const e = data as { slug: string | null; title: string | null; starts_at: string | null } | null
  if (!e?.slug) return null
  return { slug: e.slug, title: e.title?.trim() || 'Linked event', startsAt: e.starts_at }
}

/** Index a pillar list by id, re-exported so the page doesn't import lib/pillars twice. */
export { pillarsById }
