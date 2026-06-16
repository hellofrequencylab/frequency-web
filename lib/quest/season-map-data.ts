import { createAdminClient } from '@/lib/supabase/admin'
import {
  journeyPracticeIds,
  distinctPracticeDaysInWindow,
  distinctPillarDaysInWindow,
} from '@/lib/quest/completion'
import { getPillars } from '@/lib/pillars'
import type { Season } from '@/lib/seasons'
import type { PillarProgress } from '@/components/quest/season-map'

// The data reads behind the My Quest Season Map module (components/widgets/quest/quest-season-map).
// Lifted out of the page so the module can self-fetch. Server-only (admin client + completion
// engine); every read is keyed to the caller's profile id and degrades to an empty/zeroed shape
// rather than throwing, so the hub never breaks on a taxonomy gap.

const DAYS_TO_FINISH = 14
const PILLAR_LABEL: Record<string, 'Mind' | 'Body' | 'Spirit'> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
}
const PILLAR_ORDER: Record<string, number> = { mind: 0, body: 1, spirit: 2 }

export interface JourneyArc {
  /** Resolved Journey id (for the Expression-only next-step branch). */
  journeyId: string
  slug: string
  title: string
  pillar: 'Mind' | 'Body' | 'Spirit'
  emoji: string | null
  state: 'done' | 'current' | 'upcoming'
  daysLogged: number
  daysNeeded: number
  expression: 'done' | 'pending'
}

export interface SeasonMapData {
  journeys: JourneyArc[]
  /** The Journey to act on now: in-window, else the next upcoming, else the last. */
  current: JourneyArc | null
  /** That Journey's Expression Challenge is the last thing left to finish it. */
  currentExpressionPending: boolean
}

interface OfficialJourneyRow {
  id: string
  slug: string
  title: string
  emoji: string | null
  window_starts_at: string | null
  window_ends_at: string | null
  pillarSlug: string | null
}

// The three official Journeys of the active Quest (Mind → Body → Spirit) with each one's
// completion state. The `quests`/`journey_plans` columns aren't in the generated types yet, so it
// reads through the admin handle behind a try/catch and degrades to an empty hero.
export async function readSeasonMap(profileId: string, season: Season | null): Promise<SeasonMapData> {
  const empty: SeasonMapData = { journeys: [], current: null, currentExpressionPending: false }
  if (!season) return empty

  try {
    const admin = createAdminClient()

    // Active Quest(s) for this season → their official Journeys, with each Journey's Pillar
    // (the first practice item's domain) for the arc label.
    const { data: questRows } = await admin.from('quests').select('id').eq('status', 'active')
    const questIds = ((questRows ?? []) as { id: string }[]).map((q) => q.id)
    if (questIds.length === 0) return empty

    const { data: planRows } = await admin
      .from('journey_plans')
      .select('id, slug, title, emoji, window_starts_at, window_ends_at, journey_plan_items(domain_id)')
      .in('quest_id', questIds)
      .eq('official', true)
    const plans = (planRows ?? []) as Array<{
      id: string
      slug: string
      title: string
      emoji: string | null
      window_starts_at: string | null
      window_ends_at: string | null
      journey_plan_items: { domain_id: string | null }[] | null
    }>
    if (plans.length === 0) return empty

    // Map each Journey's domain_id → its Pillar slug (mind/body/spirit).
    const domainIds = [
      ...new Set(
        plans.flatMap((p) => (p.journey_plan_items ?? []).map((i) => i.domain_id).filter(Boolean) as string[]),
      ),
    ]
    const slugByDomain = new Map<string, string>() // domainId → pillar slug
    if (domainIds.length > 0) {
      const { data: pillarRows } = await admin.from('pillars').select('id, slug').in('id', domainIds)
      for (const r of (pillarRows ?? []) as { id: string; slug: string }[]) {
        slugByDomain.set(r.id, r.slug)
      }
    }

    const rows: OfficialJourneyRow[] = plans.map((p) => {
      const firstDomain = (p.journey_plan_items ?? []).find((i) => i.domain_id)?.domain_id ?? null
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        emoji: p.emoji,
        window_starts_at: p.window_starts_at,
        window_ends_at: p.window_ends_at,
        pillarSlug: firstDomain ? slugByDomain.get(firstDomain) ?? null : null,
      }
    })

    // Keep only the three Pillar Journeys (a Quest ships exactly Mind/Body/Spirit), ordered
    // Mind → Body → Spirit.
    const pillarRowsOnly = rows
      .filter((r) => r.pillarSlug && PILLAR_LABEL[r.pillarSlug])
      .sort((a, b) => (PILLAR_ORDER[a.pillarSlug!] ?? 9) - (PILLAR_ORDER[b.pillarSlug!] ?? 9))
    if (pillarRowsOnly.length === 0) return empty

    // Which Journeys are already finished this season (a journey_completions row).
    const { data: doneRows } = await admin
      .from('journey_completions')
      .select('journey_id')
      .eq('profile_id', profileId)
      .eq('season', season.season_number)
    const doneIds = new Set(((doneRows ?? []) as { journey_id: string }[]).map((r) => r.journey_id))

    // Per-Journey Expression Challenge state — the 4th Pillar's capstone on each Journey. Each
    // Journey's Expression Challenge is the season_challenges row with journey_id = <plan id>;
    // done = a challenge_progress row with a completed_at for the member. A finished Journey
    // implies its Expression Challenge is done.
    const planIds = pillarRowsOnly.map((r) => r.id)
    const { data: challengeRows } = await admin
      .from('season_challenges')
      .select('id, journey_id')
      .eq('season', season.season_number)
      .in('journey_id', planIds)
    const challenges = ((challengeRows ?? []) as { id: string; journey_id: string | null }[]).filter(
      (c): c is { id: string; journey_id: string } => !!c.journey_id,
    )
    const challengeByJourney = new Map(challenges.map((c) => [c.journey_id, c.id]))

    let completedChallengeIds = new Set<string>()
    if (challenges.length > 0) {
      const { data: progressRows } = await admin
        .from('challenge_progress')
        .select('challenge_id, completed_at')
        .eq('profile_id', profileId)
        .in(
          'challenge_id',
          challenges.map((c) => c.id),
        )
      completedChallengeIds = new Set(
        ((progressRows ?? []) as { challenge_id: string; completed_at: string | null }[])
          .filter((p) => !!p.completed_at)
          .map((p) => p.challenge_id),
      )
    }
    const expressionDoneFor = (journeyId: string): boolean => {
      if (doneIds.has(journeyId)) return true // a finished Journey cleared its capstone
      const challengeId = challengeByJourney.get(journeyId)
      return !!challengeId && completedChallengeIds.has(challengeId)
    }

    const today = new Date()
    const inWindow = (r: OfficialJourneyRow) => {
      const start = r.window_starts_at ? new Date(r.window_starts_at) : null
      const end = r.window_ends_at ? new Date(r.window_ends_at) : null
      return (!start || today >= start) && (!end || today <= end)
    }

    // The current Journey: the one whose window is open now; else the next one to open; else the
    // last (season's tail). Distinct days only matter for the open one.
    const openRow = pillarRowsOnly.find((r) => !doneIds.has(r.id) && inWindow(r))
    const upcomingRow = pillarRowsOnly.find(
      (r) => !doneIds.has(r.id) && r.window_starts_at && new Date(r.window_starts_at) > today,
    )
    const currentRow = openRow ?? upcomingRow ?? pillarRowsOnly[pillarRowsOnly.length - 1]

    // Days logged toward the bar — only the open current Journey needs the count. Once the 14
    // days are met, the only thing left is the Expression Challenge.
    let currentDays = 0
    let currentExpressionPending = false
    if (openRow) {
      const practiceIds = await journeyPracticeIds(openRow.id)
      currentDays = await distinctPracticeDaysInWindow(
        profileId,
        practiceIds,
        openRow.window_starts_at,
        openRow.window_ends_at,
      )
      if (currentDays >= DAYS_TO_FINISH) {
        currentExpressionPending = !expressionDoneFor(openRow.id)
      }
    }

    const journeys: JourneyArc[] = pillarRowsOnly.map((r) => {
      const isDone = doneIds.has(r.id)
      const isCurrent = !isDone && !!openRow && openRow.id === r.id
      return {
        journeyId: r.id,
        slug: r.slug,
        title: r.title,
        pillar: PILLAR_LABEL[r.pillarSlug!],
        emoji: r.emoji,
        state: isDone ? 'done' : isCurrent ? 'current' : 'upcoming',
        daysLogged: isCurrent ? currentDays : 0,
        daysNeeded: DAYS_TO_FINISH,
        expression: expressionDoneFor(r.id) ? 'done' : 'pending',
      }
    })

    const current = currentRow ? journeys.find((j) => j.journeyId === currentRow.id) ?? null : null

    return { journeys, current, currentExpressionPending }
  } catch {
    return empty
  }
}

// Each Pillar's gauge fills with the DISTINCT days the member logged a practice in that Pillar
// this season (Mind / Body / Spirit / Expression). Reuses the completion engine's per-Pillar day
// counter; degrades to empty gauges if the taxonomy can't be read. One call per Pillar, in parallel.
const PILLAR_DAYS_TARGET = 14

export async function readPillarProgress(profileId: string, season: Season | null): Promise<PillarProgress[]> {
  const fallback: PillarProgress[] = (['mind', 'body', 'spirit', 'expression'] as const).map((slug) => ({
    slug,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    daysLogged: 0,
    daysTarget: PILLAR_DAYS_TARGET,
  }))

  if (!season) return fallback
  try {
    const pillars = await getPillars()
    if (pillars.length === 0) return fallback
    const start = season.starts_at
    const end = season.ends_at ?? new Date().toISOString()
    const days = await Promise.all(
      pillars.map((p) => distinctPillarDaysInWindow(profileId, [p.id], start, end).catch(() => 0)),
    )
    return pillars.map((p, i) => ({
      slug: p.slug,
      name: p.name,
      daysLogged: days[i] ?? 0,
      daysTarget: PILLAR_DAYS_TARGET,
    }))
  } catch {
    return fallback
  }
}

/** Whole weeks left in the 13-week Quest (rounded up; never negative). */
export function weeksLeft(season: Season | null): number | null {
  if (!season?.ends_at) return null
  const ms = new Date(season.ends_at).getTime() - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / (7 * 24 * 60 * 60 * 1000))
}
