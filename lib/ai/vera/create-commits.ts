// ─────────────────────────────────────────────────────────────────────────────
// THE COMMIT REGISTRY (ADR-998; ADR-988 the governed create layer). Server-only.
//
// `confirmCreate` takes the entity's own create path as a callback, which is right: nine correct,
// tested create paths with their own slug rules, meters and side effects are not worth
// re-implementing inside a governance layer (ADR-988 §5). But a GENERIC surface — a member looking
// at a list of pending drafts — has no wizard to supply that callback. This file is the lookup
// that closes the gap, and it is deliberately the narrowest thing that could work.
//
// TWO ADMISSION CRITERIA. An entity may be registered here ONLY when both hold. They are what
// stops this file from quietly becoming the second authority ADR-988 §4 forbids:
//
//  1. ITS GATE IS A `capability` GATE. `confirmCreate` re-checks a capability gate itself, twice.
//     A `scoped` gate (a Space plan limit, a per-Space role ladder, a seller gate) is enforced by
//     the entity's own action, and a commit invoked from here would SKIP it. So a scoped entity is
//     never registered — not "not yet", but never, unless its scoped gate moves into the commit.
//
//  2. ITS OWN CREATE ACTION ADDS NOTHING BEYOND THE GATE AND THE WRITER. If the action also
//     computes policy (a review status from the author's role) or seeds companion rows, calling
//     the raw writer from here would produce a DIFFERENT thing from the one the wizard makes.
//     Re-stating that policy is exactly how a governance layer becomes the bug.
//
// Everything not registered is still fully visible on the drafts surface and can still be
// dismissed there. It is simply finished in its own builder, which is where its authority lives.
// That is a statement about where authority sits, not a gap waiting to be filled.
//
// The registry is keyed by Studio entity id, so it can only ever name something the catalog knows.
// ─────────────────────────────────────────────────────────────────────────────

import type { PillarSlug } from '@/lib/pillars'
import type { CircleSparkDraft } from '@/lib/ai/circle-spark'
import { createBlankCircleDraft } from '@/lib/circles/draft'
import type { CreateCommitInput } from './create-entity'

/** What a registered commit returns: where to send the member once the thing exists. */
export interface CreateCommitResult {
  /** The surface that now owns the new thing (its builder). Null when there is nowhere to go. */
  href: string | null
}

export type CreateCommit = (input: CreateCommitInput) => Promise<CreateCommitResult>

// ── Draft readers (PURE, total) ──────────────────────────────────────────────────────────────
// The draft arrives keyed by the manifest's own field paths, so reading it is a dotted-path walk.
// Same shape as the kernel's reader; restated rather than imported because this file is a server
// seam and the kernel must stay pure.

function at(draft: Record<string, unknown>, path: string): unknown {
  let cur: unknown = draft
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function str(draft: Record<string, unknown>, path: string): string {
  const v = at(draft, path)
  return typeof v === 'string' ? v.trim() : ''
}

function strings(draft: Record<string, unknown>, path: string): string[] {
  const v = at(draft, path)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

const PILLARS: readonly string[] = ['mind', 'body', 'spirit', 'expression']

// ── The registry ─────────────────────────────────────────────────────────────────────────────

const COMMITS: Readonly<Record<string, CreateCommit>> = {
  /**
   * CIRCLE. Registered because it meets both criteria exactly: the gate is `circle.create` (a
   * capability `confirmCreate` re-checks at propose AND at the write), and the wizard's own
   * action is nothing but `assertCanCreate('circle.create')` plus this same writer. Running the
   * writer from here therefore produces the identical draft Circle, under the identical gate.
   *
   * The draft is bridged onto `CircleSparkDraft` the same way the wizard bridges it: a Circle's
   * About is the spark's `oneLiner`, and the two rhythm beats are the `.text` under their groups.
   * `createBlankCircleDraft` reads every spark field defensively, so a thin draft is safe.
   */
  circle: async (input) => {
    const pillarRaw = str(input.draft, 'primaryPillar')
    const spark: CircleSparkDraft = {
      name: str(input.draft, 'name'),
      primaryPillar: PILLARS.includes(pillarRaw) ? (pillarRaw as PillarSlug) : null,
      card: '',
      oneLiner: str(input.draft, 'about'),
      identity: '',
      audience: '',
      pillarsInside: Object.fromEntries(
        PILLARS.map((p) => [p, str(input.draft, `pillarsInside.${p}`)]).filter(([, v]) => v),
      ) as Partial<Record<PillarSlug, string>>,
      meetup: str(input.draft, 'meetup.text'),
      gathering: str(input.draft, 'gathering.text'),
      thread: str(input.draft, 'thread'),
      format: str(input.draft, 'format'),
      sizeLabel: str(input.draft, 'sizeLabel'),
      agreements: strings(input.draft, 'agreements'),
      remixOptions: strings(input.draft, 'remixOptions'),
    }
    const res = await createBlankCircleDraft({
      profileId: input.actorProfileId,
      name: spark.name,
      spark,
      spaceId: input.spaceId,
    })
    return { href: `/circles/${res.slug}/edit` }
  },
}

/**
 * WHY an entity is NOT registered. Read by the drafts surface so it can say something true instead
 * of a shrug, and asserted by test so an entity cannot drift out of the catalog without a reason.
 */
export const NO_COMMIT_REASON: Readonly<Record<string, string>> = {
  event: 'The Event road takes a whole form (venue, times, tickets) and settles policy along the way. Finish it in the Event builder.',
  journey: 'A new Journey is born with its phases already laid out, and that seeding belongs to the Journey builder.',
  practice: 'Whether a Practice goes live or waits for review is decided by the Practice road from your role. That call stays there.',
  space: 'How many Spaces you can run is decided by your plan, and that gate lives in the Space builder.',
  business: 'A researched Space carries a provenance ledger the Seeder holds. Finish it there.',
  listing: 'Where a listing can be posted is decided by the board it goes on. Finish it in the listing builder.',
  product: 'Whether you can sell in a Space is decided by that Space. Finish it in the shop.',
  service: 'Whether you can sell in a Space is decided by that Space. Finish it in the shop.',
}

/** Whether this surface can finish an entity itself. Total: an unknown id is false. */
export function hasCreateCommit(entity: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMMITS, entity)
}

/** The registered commit for an entity, or null. Total. */
export function createCommitFor(entity: string): CreateCommit | null {
  return COMMITS[entity] ?? null
}

/** Every entity this surface can finish, for tests and for the report. */
export function committableEntities(): string[] {
  return Object.keys(COMMITS)
}
