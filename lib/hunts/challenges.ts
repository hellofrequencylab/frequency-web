/**
 * Trail challenges (FH-042S, ADR-1977): the Mystery question, its hint, and the fork and stand-in
 * choices, kept as their own list beside the stops. Pure: no database, no Next, no crypto, so the
 * editor can import it.
 *
 * A challenge names one stop by position and says how that stop plays:
 *   mystery   the player answers a question there as well as proving the visit (hunt_missions.kind
 *             `answer`). The answer is never stored: the server action hashes it with hashAnswer
 *             (lib/hunts/mystery.ts) and only `answerHash` is kept. The editor only ever sees `answerSet`.
 *   fork      stops next to each other in the same fork are an exclusive choice (hunt_missions.choice_group):
 *             a player takes one, the others close, and the next stop opens after whichever was taken.
 *   standIn   stops next to each other in the same stand-in set are one objective by different means
 *             (hunt_missions.fallback_group): either counts. A Mystery needs one, so a player who runs out
 *             of tries still has a way on (validateGraph refuses a Mystery with none).
 *
 * The list is stored at hunt_versions.policy.challenges, apart from policy.trail, so the stops list and
 * its autosave never carry an answer hash. A Trail with no challenges publishes exactly as before.
 */

/** Judged guesses per Mystery. The same number as MAX_ANSWER_ATTEMPTS in lib/hunts/mystery.ts. */
export const MYSTERY_TRIES = 5

const GROUPS = ['1', '2', '3'] as const
type Group = (typeof GROUPS)[number] | ''

/** A challenge as stored. `answerHash` never leaves the server. */
export type Challenge = {
  /** The stop's position, from 0. */
  stop: number
  mystery: boolean
  question: string
  hint: string
  answerHash: string | null
  fork: Group
  standIn: Group
}

/** A challenge as the editor holds it: no hash, only whether an answer is set. */
export type ChallengeView = Omit<Challenge, 'answerHash'> & { answerSet: boolean }

const LIMITS = { question: 300, hint: 200 } as const
const HASH = /^s1:[0-9a-f]{32}:[0-9a-f]{64}$/
const group = (v: unknown): Group => (typeof v === 'string' && (GROUPS as readonly string[]).includes(v) ? (v as Group) : '')
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

function readOne(r: Record<string, unknown>): Omit<Challenge, 'answerHash'> | null {
  const stop = r.stop
  if (typeof stop !== 'number' || !Number.isInteger(stop) || stop < 0 || stop >= 10) return null
  return { stop, mystery: r.mystery === true, question: text(r.question, LIMITS.question), hint: text(r.hint, LIMITS.hint), fork: group(r.fork), standIn: group(r.standIn) }
}

/** Read the stored list. Total: anything unreadable is dropped, and one challenge per stop is kept (the first). */
export function parseChallenges(input: unknown): Challenge[] {
  const seen = new Set<number>()
  const out: Challenge[] = []
  for (const item of Array.isArray(input) ? input.slice(0, 10) : []) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const c = readOne(r)
    if (!c || seen.has(c.stop)) continue
    seen.add(c.stop)
    out.push({ ...c, answerHash: typeof r.answerHash === 'string' && HASH.test(r.answerHash) ? r.answerHash : null })
  }
  return out.sort((a, b) => a.stop - b.stop)
}

/** The editor's copy: the hash becomes a yes or no. */
export function challengeViews(list: readonly Challenge[]): ChallengeView[] {
  return list.map(({ answerHash, ...c }) => ({ ...c, answerSet: answerHash !== null }))
}

/**
 * Read what the editor sent (untrusted) into stored challenges. `answers` holds the hashes the server
 * action made from any plain answers just typed, by stop; a challenge with no new answer keeps the hash
 * `previous` held for that stop, so leaving the field blank keeps the answer.
 */
export function mergeChallenges(input: unknown, answers: ReadonlyMap<number, string>, previous: readonly Challenge[]): Challenge[] {
  const kept = new Map(previous.map((c) => [c.stop, c.answerHash]))
  return parseChallenges(
    (Array.isArray(input) ? input : []).map((item) => {
      const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const stop = typeof r.stop === 'number' ? r.stop : -1
      // A plain answer is read here only to be replaced: the hash, never the answer, goes on.
      const { answer: _answer, answerHash: _sent, ...rest } = r
      void _answer
      void _sent
      return { ...rest, answerHash: answers.get(stop) ?? (r.mystery === true ? kept.get(stop) ?? null : null) }
    }),
  )
}

/** Remap challenges when a stop moves or goes: `order[i]` is the old position of the stop now at `i`. */
export function remapChallenges<C extends { stop: number }>(list: readonly C[], order: readonly number[]): C[] {
  return list.flatMap((c) => {
    const at = order.indexOf(c.stop)
    return at === -1 ? [] : [{ ...c, stop: at }]
  })
}

/** What the challenges do to one stop's published mission. */
type StopPlay = { kind: 'visit' | 'answer'; choiceGroup: string | null; fallbackGroup: string | null; question: string; hint: string; answerHash: string | null }

export function stopPlay(list: readonly Pick<Challenge, 'stop' | 'mystery' | 'question' | 'hint' | 'answerHash' | 'fork' | 'standIn'>[], stop: number): StopPlay {
  const c = list.find((x) => x.stop === stop)
  return {
    kind: c?.mystery ? 'answer' : 'visit',
    choiceGroup: c?.fork ? `fork-${c.fork}` : null,
    fallbackGroup: c?.standIn ? `stand-in-${c.standIn}` : null,
    question: c?.mystery ? c.question.trim() : '',
    hint: c?.hint.trim() ?? '',
    answerHash: c?.mystery ? c.answerHash : null,
  }
}

/**
 * The stops grouped into layers, in order: a run of neighbouring stops in the same fork, or in the same
 * stand-in set, is one layer; every other stop is a layer of its own. A layer opens after the layer
 * before it (any one of its stops), and the finish needs the last layer.
 */
export function stopLayers(stopCount: number, list: readonly Pick<Challenge, 'stop' | 'fork' | 'standIn'>[]): number[][] {
  const tag = (i: number): string | null => {
    const c = list.find((x) => x.stop === i)
    return c?.fork ? `f${c.fork}` : c?.standIn ? `s${c.standIn}` : null
  }
  const layers: number[][] = []
  for (let i = 0; i < stopCount; i++) {
    const t = tag(i)
    const last = layers[layers.length - 1]
    if (t && last && tag(last[0]) === t) last.push(i)
    else layers.push([i])
  }
  return layers
}

type Problem = { stop?: number; message: string }

/** The author's blockers, in plain words, checked before the engine's own (validateGraph). */
export function challengeProblems(stopCount: number, list: readonly (Omit<Challenge, 'answerHash'> & { answerSet: boolean })[]): Problem[] {
  const problems: Problem[] = []
  for (const c of list) {
    if (c.stop >= stopCount) problems.push({ message: 'A challenge points at a stop that is no longer on the trail. Remove it or pick another stop.' })
    if (c.fork && c.standIn) problems.push({ stop: c.stop, message: 'A stop can be in a fork or a stand-in set, not both.' })
    if (c.mystery && !c.question.trim()) problems.push({ stop: c.stop, message: 'This Mystery needs a question.' })
    if (c.mystery && !c.answerSet) problems.push({ stop: c.stop, message: 'This Mystery needs an answer.' })
    if (c.mystery && !c.standIn) problems.push({ stop: c.stop, message: 'Put this Mystery in a stand-in set with another stop, so a player who runs out of tries still has a way on.' })
  }
  const layers = stopLayers(stopCount, list)
  for (const [field, word] of [['fork', 'fork'], ['standIn', 'stand-in set']] as const) {
    for (const g of GROUPS) {
      const stops = list.filter((c) => c.stop < stopCount && c[field] === g).map((c) => c.stop)
      if (stops.length === 0) continue
      if (stops.length === 1) problems.push({ stop: stops[0], message: `A ${word} needs at least two stops. Add another stop to it or clear it.` })
      else if (!layers.some((l) => stops.every((s) => l.includes(s)))) problems.push({ stop: stops[0], message: `The stops in one ${word} have to sit next to each other in the trail.` })
    }
  }
  return problems
}
