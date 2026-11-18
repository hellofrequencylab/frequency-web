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
  /** FH-042S: a Mystery whose tries are used up. Still open, but the way on is its stand-in stop. */
  answerLocked?: true
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
  /** FH-042S: Mysteries this run used every try on. Never the next stop; the stand-in is. */
  lockedMysteries?: readonly string[]
}): Projection {
  const ev = evaluate(input.graph, input.credits, input.now)
  const view = playerView(input.huntState)
  const locked = new Set(input.lockedMysteries ?? [])
  const nextKey = view.canClaim && !ev.finished
    ? input.content.find((c) => ev.status[c.mission_key] === 'eligible' && !locked.has(c.mission_key))?.mission_key ?? null
    : null
  const stops: PlayerStop[] = input.content.map((c, i) => {
    const state = ev.status[c.mission_key] ?? 'locked'
    const base = { key: c.mission_key, position: i + 1, state }
    if (state === 'credited') return { ...base, place: c.title, clue: c.visible_body }
    if (state === 'eligible') {
      const visible = { ...base, clue: c.visible_body, ...(locked.has(c.mission_key) ? { answerLocked: true as const } : {}) }
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
