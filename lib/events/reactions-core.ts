// The event-post reaction set, the per-post shape, and the pure fold — the half with no database
// in it. Split out of lib/events/reactions.ts, which is a `'use server'` module and so can only
// EXPORT async functions (every export there is a public POST endpoint, AUTHZ-4). Keeping the
// fold here lets it be tested directly without minting an endpoint, and lets the client import
// the runtime set from a module with no admin client in its graph.
//
// 🔴 THE DEFECT THIS SPLIT CLOSES (2026-09-04). `aggregate` built its result with
// `Object.create(null)` — correct for a caller-keyed map — and RETURNED that null-prototype
// object straight out of `getEventPostReactions`, a server action. React Flight serializes a
// server action's result exactly as it serializes a prop, and refuses a null prototype:
//   "Only plain objects, and a few built-ins, can be passed to Client Components from Server
//    Components. Classes or null prototypes are not supported."
// It fired on every mount of an event with at least one post — 60 times across 20 of the site's
// 57 members, from 2026-06-27 (the day after the feature's migration) to the day this was found —
// and the client's `.catch(() => {})` swallowed it, so no reaction count ever rendered and nobody
// saw an error. React 19.2 serializes Date/Map/Set natively; only a class instance or a null
// prototype can produce this message, which is why every other boundary value was ruled out.
//
// The fix is one boundary conversion: aggregate into the null-prototype map (still the right
// tool for caller-supplied keys), then hand Flight a PLAIN object. The pinned test below asserts
// the prototype, so the next refactor that "simplifies" it back is a red test.
// (2026-09-04, same day: CodeQL flagged the object-keyed fold as remote property injection once it
// lived in its own file, so the working map is now a Map and the boundary is Object.fromEntries —
// same guarantee, no property write keyed by caller input anywhere.)

// The Partiful-style reaction set (EVENTS-DESIGN §2.2/§8). The `'use server'` module can only
// EXPORT async functions (types are erased and fine), so the runtime set lives here and is
// mirrored by the BOOPS array the activity bar renders — keep the two in lockstep. Only these
// faces are accepted server-side. `BoopKind` is exported as a type for the UI to share.
export const BOOP_KINDS = ['👋', '🔥', '🎉', '❤️', '😂'] as const
export type BoopKind = (typeof BOOP_KINDS)[number]

export function isBoopKind(value: string): value is BoopKind {
  return (BOOP_KINDS as readonly string[]).includes(value)
}

/** Per-post reaction state for the activity feed: how many of each face, and which
 *  faces the viewer themselves booped. `counts` only carries kinds with at least one
 *  reaction (a zero is absent, not shown). */
export interface PostReactions {
  /** kind → count (only kinds with count > 0). */
  counts: Partial<Record<BoopKind, number>>
  /** The kinds the current viewer has booped on this post. */
  mine: BoopKind[]
}

export interface ReactionRow {
  post_id: string
  kind: string
  profile_id: string
}

/** Fold reaction rows into per-post {counts, mine} for the given viewer. */
// Post IDs that, used as an object key, would pollute the prototype chain. `postIds`
// reaches this from a `'use server'` action (caller-controlled), so never write one
// of these as a property name (CodeQL: remote property injection).
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function aggregate(
  rows: ReactionRow[],
  postIds: string[],
  myProfileId: string | null,
): Record<string, PostReactions> {
  // A Map, not an object: a caller-supplied key is never written as a PROPERTY NAME at all, so
  // there is no prototype to reach (CodeQL js/remote-property-injection, raised on the object
  // form of this fold when it moved here). The reserved names are still skipped as a second
  // barrier, so the boundary object below can never carry one either.
  const out = new Map<string, PostReactions>()
  for (const id of postIds) {
    if (UNSAFE_KEYS.has(id)) continue
    out.set(id, { counts: {}, mine: [] })
  }

  for (const row of rows) {
    if (!isBoopKind(row.kind)) continue
    const bucket = out.get(row.post_id)
    if (!bucket) continue
    bucket.counts[row.kind] = (bucket.counts[row.kind] ?? 0) + 1
    if (myProfileId && row.profile_id === myProfileId) bucket.mine.push(row.kind)
  }
  // The boundary conversion (see the header): a PLAIN object for Flight, built from the Map's
  // entries; the reserved names were never inserted, so nothing here can reach a setter.
  return Object.fromEntries(out)
}
