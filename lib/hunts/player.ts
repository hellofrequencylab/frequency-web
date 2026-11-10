/**
 * What a player may see (FH-016): the projection of one published Trail for one run, as a pure function.
 *
 * The server evaluates the graph, then calls this to decide which words leave the server. The rule is
 * simple and tested: a stop you cannot play yet shows nothing but its position and an optional teaser,
 * a stop you can play shows its clue but not its place name, and only a stop you already visited shows
 * the place. So a hidden clue, a locked place name or an answer never reaches the page, the API or the
 * share preview, however many tabs or devices ask. The same input gives the same output on every device,
 * and `revision` rides along so two devices can tell when one of them is behind.
 *
 * This reads no database. The route loads the published version and the run's credits, then calls this.
 */
import { evaluate, type Instant } from './graph'
import type { Credit, HuntGraph, MissionState } from './graph'
import { playerView } from './moderation'

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
}): Projection {
  const ev = evaluate(input.graph, input.credits, input.now)
  const view = playerView(input.huntState)
  const stops: PlayerStop[] = input.content.map((c, i) => {
    const state = ev.status[c.mission_key] ?? 'locked'
    const base = { key: c.mission_key, position: i + 1, state }
    if (state === 'credited') return { ...base, place: c.title, clue: c.visible_body }
    if (state === 'eligible') return { ...base, clue: c.visible_body }
    return c.locked_teaser ? { ...base, teaser: c.locked_teaser } : base
  })
  const nextKey = view.canClaim && !ev.finished ? (stops.find((s) => s.state === 'eligible')?.key ?? null) : null
  return {
    revision: input.revision,
    stops,
    progress: { done: ev.credited.length, total: input.content.length, finished: ev.finished },
    nextKey,
    banner: view.banner,
    canClaim: view.canClaim && nextKey !== null,
  }
}
