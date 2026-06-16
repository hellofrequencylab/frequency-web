// The operator content home (ADR-211; QUEST-UI-REDESIGN §4.5/§A7): the "needs you"
// work list + the at-a-glance health strip for /admin/content. One read assembles both
// so the home is a glance-and-act surface, not an exploration tool — every "needs you"
// item carries the link to the surface that fixes it, and every health number is a
// drill-down. Reuses the same signal libs the curation pages + Vera's tips read, so the
// home and the working surfaces never disagree on the numbers.
//
// Server-only. The quest/practice tables run ahead of the generated Database types
// (repo convention — see lib/practices.ts / lib/admin/content-signals.ts), so this reads
// through an untyped admin handle.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatusTone } from '@/components/admin/status'
import { getCurrentSeason, type Season } from '@/lib/seasons'
import { seasonStateFromStatus, seasonStateMeta } from '@/app/(main)/admin/content/seasons/lifecycle'

function db(): SupabaseClient {
  return createAdminClient()
}

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

/** One actionable "needs you" item: a short label, the reason, the surface that fixes
 *  it, and a tone so the most urgent items read loudest. */
export interface NeedsYouItem {
  id: string
  title: string
  detail: string
  href: string
  tone: StatusTone
}

/** The at-a-glance health strip: the active season's state + a few headline counts. */
export interface ContentHealth {
  season: Season | null
  seasonState: { label: string; tone: StatusTone }
  /** Whole days until the active season's ends_at, or null when no end is set / no season. */
  daysLeft: number | null
  officialJourneys: number
  rankedLibraryJourneys: number
  publicPractices: number
  /** Public practices with no Pillar (domain_id null) — they fall outside the Pillar
   *  balance and can't complete a Journey, so they need categorizing. */
  practicesUncategorized: number
  /** Per-Pillar count of public practices, in display order, for the balance glance. */
  pillarSpread: { slug: string; name: string; count: number }[]
}

export interface ContentHomeData {
  health: ContentHealth
  needsYou: NeedsYouItem[]
}

/** A short, locale-stable date for an item detail line (e.g. "Jun 21"). */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Whole days from now until an ISO instant (negative = already past). */
function daysUntil(iso: string, now: number): number {
  return Math.ceil((new Date(iso).getTime() - now) / DAY_MS)
}

/**
 * Assemble the operator content home: the health strip + the "needs you" work list.
 * Caller enforces the admin/curator gate; this is a pure read (no writes). Built from a
 * handful of small targeted reads run in parallel — the home stays fast even as the
 * library grows because each read is a head-count or a narrow filtered slice.
 */
export async function getContentHomeData(): Promise<ContentHomeData> {
  const client = db()
  const now = Date.now()
  const weekFromNow = new Date(now + WEEK_MS).toISOString()
  const nowIso = new Date(now).toISOString()

  const [
    season,
    { count: officialJourneys },
    { count: rankedLibraryJourneys },
    { count: publicPractices },
    { count: practicesUncategorized },
    { data: windowOpening },
    { data: windowClosing },
    { data: awaitingVera },
    { data: expressionChallenges },
    { data: pillarRows },
    { data: publicPracticePillars },
  ] = await Promise.all([
    getCurrentSeason(),
    client.from('journey_plans').select('id', { count: 'exact', head: true }).eq('official', true),
    client
      .from('journey_plans')
      .select('id', { count: 'exact', head: true })
      .eq('ranked_eligible', true)
      .eq('official', false),
    client.from('practices').select('id', { count: 'exact', head: true }).eq('is_public', true),
    client
      .from('practices')
      .select('id', { count: 'exact', head: true })
      .eq('is_public', true)
      .is('domain_id', null),
    // Official Journeys whose enrollment window OPENS within the next week.
    client
      .from('journey_plans')
      .select('id, slug, title, window_starts_at')
      .eq('official', true)
      .gt('window_starts_at', nowIso)
      .lte('window_starts_at', weekFromNow)
      .order('window_starts_at', { ascending: true })
      .limit(8),
    // Official Journeys whose enrollment window CLOSES within the next week.
    client
      .from('journey_plans')
      .select('id, slug, title, window_ends_at')
      .eq('official', true)
      .gt('window_ends_at', nowIso)
      .lte('window_ends_at', weekFromNow)
      .order('window_ends_at', { ascending: true })
      .limit(8),
    // Published library Journeys awaiting Vera review — visible but not ranked yet, and
    // no completed Vera verdict on record (ranked_eligible=false + vera_review null).
    client
      .from('journey_plans')
      .select('id, slug, title')
      .eq('visibility', 'public')
      .eq('official', false)
      .eq('ranked_eligible', false)
      .is('vera_review', null)
      .neq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(8),
    // Expression Challenges (criteria.type = 'expression') — unlinked or ending soon.
    client
      .from('season_challenges')
      .select('id, slug, name, journey_id, ends_at, criteria')
      .limit(200),
    client.from('pillars').select('id, slug, name, display_order').eq('is_active', true).order('display_order'),
    client.from('practices').select('domain_id').eq('is_public', true),
  ] as const)

  // --- Health strip -----------------------------------------------------------
  const seasonState = seasonStateMeta(seasonStateFromStatus(season?.status))
  const daysLeft = season?.ends_at ? Math.max(0, daysUntil(season.ends_at, now)) : null

  const pillars = (pillarRows ?? []) as { id: string; slug: string; name: string }[]
  const countByPillar = new Map<string, number>()
  for (const r of (publicPracticePillars ?? []) as { domain_id: string | null }[]) {
    if (!r.domain_id) continue
    countByPillar.set(r.domain_id, (countByPillar.get(r.domain_id) ?? 0) + 1)
  }
  const pillarSpread = pillars.map((p) => ({
    slug: p.slug,
    name: p.name,
    count: countByPillar.get(p.id) ?? 0,
  }))

  const health: ContentHealth = {
    season,
    seasonState,
    daysLeft,
    officialJourneys: officialJourneys ?? 0,
    rankedLibraryJourneys: rankedLibraryJourneys ?? 0,
    publicPractices: publicPractices ?? 0,
    practicesUncategorized: practicesUncategorized ?? 0,
    pillarSpread,
  }

  // --- "Needs you" work list --------------------------------------------------
  const needsYou: NeedsYouItem[] = []

  // The active season's lifecycle — the loudest item when the season is not live yet.
  if (!season) {
    needsYou.push({
      id: 'season-none',
      title: 'No season is live',
      detail: 'Open the seasons calendar to schedule the next one.',
      href: '/admin/content/seasons',
      tone: 'warning',
    })
  } else if (seasonState.label === 'Draft') {
    needsYou.push({
      id: `season-${season.id}`,
      title: `${season.name} is in Draft`,
      detail: 'Finish composing it, then schedule or go live.',
      href: `/admin/content/seasons/${season.id}`,
      tone: 'warning',
    })
  } else if (seasonState.label === 'Scheduled') {
    needsYou.push({
      id: `season-${season.id}`,
      title: `${season.name} is scheduled`,
      detail: season.starts_at ? `Goes live ${shortDate(season.starts_at)}.` : 'Goes live soon.',
      href: `/admin/content/seasons/${season.id}`,
      tone: 'info',
    })
  } else if (daysLeft != null && daysLeft <= 7) {
    needsYou.push({
      id: `season-${season.id}`,
      title: `${season.name} ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`,
      detail: 'Line up the next season before this one closes.',
      href: `/admin/content/seasons/${season.id}`,
      tone: 'warning',
    })
  }

  // Library Journeys awaiting Vera review — they cannot count toward rank until reviewed.
  for (const j of (awaitingVera ?? []) as { id: string; slug: string; title: string }[]) {
    needsYou.push({
      id: `vera-${j.id}`,
      title: j.title,
      detail: 'Library Journey awaiting Vera review. Review it into the ranked library.',
      href: '/admin/content/journeys',
      tone: 'info',
    })
  }

  // Official Journey enrollment windows opening / closing this week.
  for (const j of (windowOpening ?? []) as { id: string; title: string; window_starts_at: string }[]) {
    const d = daysUntil(j.window_starts_at, now)
    needsYou.push({
      id: `open-${j.id}`,
      title: j.title,
      detail: `Enrollment opens ${shortDate(j.window_starts_at)}${d <= 1 ? ' (soon)' : ''}.`,
      href: '/admin/content/journeys',
      tone: 'info',
    })
  }
  for (const j of (windowClosing ?? []) as { id: string; title: string; window_ends_at: string }[]) {
    const d = daysUntil(j.window_ends_at, now)
    needsYou.push({
      id: `close-${j.id}`,
      title: j.title,
      detail: `Enrollment closes ${shortDate(j.window_ends_at)}${d <= 2 ? ' (soon)' : ''}.`,
      href: '/admin/content/journeys',
      tone: d <= 2 ? 'warning' : 'info',
    })
  }

  // Expression Challenges: unlinked (no journey_id) or ending within the week. Only the
  // capstone challenges (criteria.type = 'expression') care about a Journey link.
  type ChallengeRow = {
    id: string
    name: string
    journey_id: string | null
    ends_at: string | null
    criteria: { type?: string } | null
  }
  for (const c of (expressionChallenges ?? []) as ChallengeRow[]) {
    const isExpression = c.criteria?.type === 'expression' || c.journey_id != null
    if (!isExpression) continue
    if (!c.journey_id) {
      needsYou.push({
        id: `challenge-unlinked-${c.id}`,
        title: c.name,
        detail: 'Expression Challenge with no Journey linked. Point it at an official Journey.',
        href: '/admin/content/challenges',
        tone: 'warning',
      })
    } else if (c.ends_at) {
      const d = daysUntil(c.ends_at, now)
      if (d >= 0 && d <= 7) {
        needsYou.push({
          id: `challenge-ending-${c.id}`,
          title: c.name,
          detail: `Expression Challenge ends ${shortDate(c.ends_at)}.`,
          href: '/admin/content/challenges',
          tone: d <= 2 ? 'warning' : 'info',
        })
      }
    }
  }

  // Practices with no Pillar — they sit outside the Pillar balance and can't complete a
  // Journey until categorized (the completion engine matches on a practice's Pillar).
  if (health.practicesUncategorized > 0) {
    needsYou.push({
      id: 'practices-no-pillar',
      title: `${health.practicesUncategorized} ${
        health.practicesUncategorized === 1 ? 'practice has' : 'practices have'
      } no Pillar`,
      detail: 'Sort each into Mind, Body, Spirit, or Expression so it counts toward Journeys.',
      href: '/admin/content/practices',
      tone: 'warning',
    })
  }

  return { health, needsYou }
}
