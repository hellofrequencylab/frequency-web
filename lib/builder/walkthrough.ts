// THE OWNER WALK-THROUGH (BLD-902; spec docs/EDITOR-NEXT.md#bld-902). Five owners each build a page from a blank Space
// while the team watches; the observer logs one session per owner. This file turns those logs into the verdict the
// spec asks for: did every owner publish without help, was any control searched for in ⌘K by more than two owners, and
// which Layer 2 controls were used by three of five owners (they move into Layer 1).
//
// PURE and import-free on purpose, so the CLI (scripts/builder-walkthrough.mjs) and the unit test run the same code.
// Nothing here is captured by the product: the observer writes the log by hand, so no owner's words are recorded by
// the builder itself.

/** One control an owner used, as the observer saw it: a stable id and the layer it sits in today. */
interface WalkthroughControl { id: string; layer: 1 | 2 }

/** One owner's session. `published` and `helped` are the two things the spec's first line of Done turns on. */
export interface WalkthroughSession {
  owner: string
  published: boolean
  /** The team stepped in to unblock the owner (anything short of watching). */
  helped: boolean
  /** Controls the owner used on the way to a published page. */
  used: WalkthroughControl[]
  /** Control ids the owner looked for in ⌘K, or in the Add sheet's search, instead of finding them on the page. */
  searched: string[]
  /** Every hesitation and failed find, in the observer's words: the log the spec asks for. */
  notes: string[]
}

const WALKTHROUGH_OWNERS = 5
/** A Layer 2 control used by this many owners moves into Layer 1. */
const PROMOTE_AT = 3
/** A control searched for in ⌘K by more than this many owners is a find that failed. */
const MAX_SEARCHERS = 2

interface WalkthroughVerdict {
  sessions: number
  everyonePublishedUnaided: boolean
  /** Owners who did not publish, or who were helped. */
  blocked: string[]
  /** Controls searched for by more owners than MAX_SEARCHERS, with who. */
  hardToFind: { id: string; owners: string[] }[]
  /** Layer 2 controls used by PROMOTE_AT or more owners: to be moved into Layer 1. */
  promote: { id: string; owners: string[] }[]
  /** What stands between this log and a pass, in plain words; empty when it passes. */
  missing: string[]
  passes: boolean
}

const ownersBy = (sessions: readonly WalkthroughSession[], pick: (s: WalkthroughSession) => string[]) => {
  const by = new Map<string, Set<string>>()
  for (const s of sessions) for (const id of pick(s)) by.set(id, (by.get(id) ?? new Set()).add(s.owner))
  return by
}

/** Read a log, refusing anything that is not five distinct owners' sessions in the expected shape. */
export function readWalkthrough(value: unknown): WalkthroughSession[] | null {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { sessions?: unknown }).sessions) ? (value as { sessions: unknown[] }).sessions : null
  if (!list) return null
  const out: WalkthroughSession[] = []
  for (const raw of list) {
    const s = raw as Partial<WalkthroughSession> | null
    if (!s || typeof s.owner !== 'string' || !s.owner.trim() || typeof s.published !== 'boolean' || typeof s.helped !== 'boolean') return null
    if (!Array.isArray(s.used) || !s.used.every((u) => u && typeof u.id === 'string' && (u.layer === 1 || u.layer === 2))) return null
    if (!Array.isArray(s.searched) || !s.searched.every((x) => typeof x === 'string') || !Array.isArray(s.notes) || !s.notes.every((x) => typeof x === 'string')) return null
    out.push({ owner: s.owner.trim(), published: s.published, helped: s.helped, used: s.used, searched: s.searched, notes: s.notes })
  }
  return out
}

export function walkthroughVerdict(sessions: readonly WalkthroughSession[]): WalkthroughVerdict {
  const owners = new Set(sessions.map((s) => s.owner))
  const blocked = sessions.filter((s) => !s.published || s.helped).map((s) => s.owner)
  const searched = ownersBy(sessions, (s) => s.searched)
  const hardToFind = [...searched].filter(([, who]) => who.size > MAX_SEARCHERS).map(([id, who]) => ({ id, owners: [...who] }))
  const layer2 = new Set(sessions.flatMap((s) => s.used.filter((u) => u.layer === 2).map((u) => u.id)))
  const used = ownersBy(sessions, (s) => s.used.map((u) => u.id))
  const promote = [...used].filter(([id, who]) => layer2.has(id) && who.size >= PROMOTE_AT).map(([id, who]) => ({ id, owners: [...who] }))
  const missing: string[] = []
  if (owners.size < WALKTHROUGH_OWNERS) missing.push(`${owners.size} of ${WALKTHROUGH_OWNERS} owners have been logged`)
  if (owners.size !== sessions.length) missing.push('an owner is logged twice: each of the five is one session')
  if (blocked.length) missing.push(`${blocked.join(', ')} did not publish without help`)
  if (hardToFind.length) missing.push(`searched for by more than ${MAX_SEARCHERS} owners: ${hardToFind.map((h) => h.id).join(', ')}`)
  return { sessions: sessions.length, everyonePublishedUnaided: !blocked.length && sessions.length >= WALKTHROUGH_OWNERS, blocked, hardToFind, promote, missing, passes: missing.length === 0 }
}
