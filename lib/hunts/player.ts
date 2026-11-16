/**
 * What a player may see (FH-016): the projection of one published Trail for one run, as a pure function.
 *
 * The server evaluates the graph, then calls this to decide which words leave the server. The rule is
 * simple and tested: a stop you can play shows its clue, and only a stop you already visited shows
 * its place. The live player requests on-demand hints for the current stop. Existing previews can
 * keep their optional locked teasers. The same input gives the same output on every device.
 *
 * This reads no database. The route loads the published version and the run's credits, then calls this.
 */
import { APPROX_SPACE_NOTE } from '@/lib/maps/approximate'
import { evaluate, type Instant } from './graph'
import type { Credit, HuntGraph, MissionState } from './graph'
import { playerView } from './moderation'

/** What a player reads when a visit is kept for staff to check (FH-020V). Plain and warm, no blame. */
export const HELD_VISIT_MESSAGE = 'Thanks for stopping by. We saved your visit, and someone on the Trail team will check it. This stop shows as confirmed once they do.'

type StopContent = { mission_key: string; title: string; visible_body: string; locked_teaser: string | null }

type PlayerStop = {
  key: string
  position: number
  state: MissionState
  /** Only for a stop already visited. */
  place?: string
  /** Only for a stop that is playable now or already visited. */
  clue?: string
  /** Only for a stop that is not playable yet. */
  teaser?: string
  /** Only for the current stop when the player asks to reveal it. */
  hint?: string
  canRevealHint?: true
  /** FH-042S: a playable Mystery stop: prove the place with its code, then type the answer. */
  mystery?: true
  /**
   * FH-042S: why a closed stop is closed for this run, when it is the run's own doing rather than the
   * place: another stop of its fork was taken, its Mystery stand-in is no longer needed, or the run used
   * every try on this Mystery (the stand-in is the way on).
   */
  closedBecause?: 'other_path' | 'not_needed' | 'answer_locked'
}

type Projection = {
  revision: number
  stops: PlayerStop[]
  progress: { done: number; total: number; finished: boolean }
  /** The one stop to play next, or null when finished or nothing is playable. */
  nextKey: string | null
  banner: 'none' | 'paused' | 'closed'
  canClaim: boolean
}

export function projectForPlayer(input: {
  graph: HuntGraph
  content: readonly StopContent[]
  credits: readonly Credit[]
  now: Instant
  huntState: 'published' | 'paused' | 'closed'
  revision: number
  /** Omitted for callers that still show a locked teaser. */
  hints?: { enabled: boolean; requestedKey?: string }
  /**
   * FH-042S: the Mysteries this run has used every try on (lib/hunts/claim-store.ts `loadLockedAnswers`).
   * Such a stop is closed for the run and is never the next stop: its stand-in is.
   */
  lockedAnswers?: readonly string[]
}): Projection {
  const ev = evaluate(input.graph, input.credits, input.now)
  const view = playerView(input.huntState)
  const locked = new Set(input.lockedAnswers ?? [])
  const stateOf = (key: string): MissionState => {
    const state = ev.status[key] ?? 'locked'
    return state === 'eligible' && locked.has(key) ? 'closed' : state
  }
  const nextKey = view.canClaim && !ev.finished
    ? input.content.find((c) => stateOf(c.mission_key) === 'eligible')?.mission_key ?? null
    : null
  const mission = new Map(input.graph.missions.map((m) => [m.mission_key, m]))
  const credited = new Set(ev.credited)
  // A closed stop whose group already holds another credit was closed by the run's own pick.
  const siblingCredited = (key: string, field: 'choice_group' | 'fallback_group'): boolean => {
    const g = mission.get(key)?.[field]
    return typeof g === 'string' && g !== '' && input.graph.missions.some((m) => m.mission_key !== key && m[field] === g && credited.has(m.mission_key))
  }
  const closedBecause = (key: string): PlayerStop['closedBecause'] | undefined =>
    locked.has(key) && ev.status[key] === 'eligible' ? 'answer_locked'
      : siblingCredited(key, 'choice_group') ? 'other_path'
        : siblingCredited(key, 'fallback_group') ? 'not_needed'
          : undefined
  const stops: PlayerStop[] = input.content.map((c, i) => {
    const state = stateOf(c.mission_key)
    const base = { key: c.mission_key, position: i + 1, state }
    if (state === 'credited') return { ...base, place: c.title, clue: c.visible_body }
    if (state === 'closed') {
      const why = closedBecause(c.mission_key)
      if (why) return { ...base, closedBecause: why }
    }
    if (state === 'eligible') {
      const visible = { ...base, clue: c.visible_body, ...(mission.get(c.mission_key)?.kind === 'answer' ? { mystery: true as const } : {}) }
      if (!input.hints?.enabled || c.mission_key !== nextKey || !c.locked_teaser) return visible
      if (input.hints.requestedKey === nextKey) return { ...visible, hint: c.locked_teaser }
      return { ...visible, canRevealHint: true }
    }
    return !input.hints && c.locked_teaser ? { ...base, teaser: c.locked_teaser } : base
  })
  return {
    revision: input.revision,
    stops,
    progress: { done: ev.credited.length, total: input.content.length, finished: ev.finished },
    nextKey,
    banner: view.banner,
    canClaim: view.canClaim && nextKey !== null,
  }
}

/**
 * FH-042S: the stops that stand in for a Mystery when its tries run out (the other members of its
 * fallback group), as 1-based positions on the Trail.
 */
export function standInPositions(graph: HuntGraph, content: readonly Pick<StopContent, 'mission_key'>[], missionKey: string): number[] {
  const group = graph.missions.find((m) => m.mission_key === missionKey)?.fallback_group
  if (!group) return []
  const members = new Set(graph.missions.filter((m) => m.fallback_group === group && m.mission_key !== missionKey).map((m) => m.mission_key))
  return content.flatMap((c, i) => (members.has(c.mission_key) ? [i + 1] : []))
}

const stopList = (positions: readonly number[]): string =>
  positions.length === 0 ? '' : positions.length === 1 ? `stop ${positions[0]}` : `stops ${positions.slice(0, -1).join(', ')} or ${positions[positions.length - 1]}`

const tries = (n: number): string => (n === 1 ? '1 try' : `${n} tries`)

/** What a refused Mystery answer says (FH-042S). The hint is the stop's own, released from the second wrong try on. */
type AnswerRefusalWords = { message: string; hint?: string }

/**
 * The player's words for a Mystery the claim door did not credit. Plain, warm, no blame, and always a
 * way on: a wrong answer says how many tries are left, and a locked one names the stand-in stop.
 */
export function answerRefusalWords(
  refusal: { reason: 'answer_required' } | { reason: 'answer_wrong' | 'answer_locked'; attemptsLeft: number; hint?: string },
  standIns: readonly number[] = [],
): AnswerRefusalWords {
  if (refusal.reason === 'answer_required') return { message: 'This stop is a Mystery. Type your answer to confirm it.' }
  const hint = refusal.hint ? { hint: refusal.hint } : {}
  if (refusal.reason === 'answer_wrong') {
    return { message: `Not quite. You have ${tries(Math.max(1, refusal.attemptsLeft))} left.`, ...hint }
  }
  const way = standIns.length > 0 ? ` Head to ${stopList(standIns)} instead. It counts the same.` : ' The Trail has another way on, so keep going.'
  return { message: `That was your last try on this Mystery.${way}`, ...hint }
}

/** A stop closed because the run took another stop of its fork (FH-042S). */
export const OTHER_PATH_MESSAGE = 'You took the other path at this fork, so this stop is closed on your run.'

type VisitedPin = { id: string; lat: number; lng: number; title: string; badge?: string; approximate?: true }

/**
 * The pins of the visited-stops map (FH-016T). The second gate after the loader's query filter: a point
 * becomes a pin only when the projection above already released that stop's place, so whatever the
 * source returned, a stop the player has not visited cannot reach the page. One pin per stop.
 */
export function visitedPins(
  stops: readonly Pick<PlayerStop, 'key' | 'position' | 'state' | 'place'>[],
  points: readonly { missionKey: string; lat: number; lng: number; approximate: boolean }[],
): VisitedPin[] {
  const pins: VisitedPin[] = []
  for (const stop of stops) {
    if (stop.state !== 'credited' || !stop.place) continue
    const point = points.find((candidate) => candidate.missionKey === stop.key)
    if (!point) continue
    pins.push({
      id: stop.key,
      lat: point.lat,
      lng: point.lng,
      title: `Stop ${stop.position}: ${stop.place}`,
      ...(point.approximate ? { badge: APPROX_SPACE_NOTE, approximate: true as const } : {}),
    })
  }
  return pins
}
