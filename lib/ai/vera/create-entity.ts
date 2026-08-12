// ─────────────────────────────────────────────────────────────────────────────
// THE GOVERNED CREATE PATH (ADR-988; ADR-986 Studio, ADR-066 + ADR-028 Vera). Server-only.
//
// The server half of create-tools.ts. Every Studio create routes through here so that the
// single highest-volume write on the platform finally lands in the audit log the autonomy
// ladder is meant to be earned against, and passes the same gate every other governed write
// passes: propose, a human confirms, the code executes.
//
// TWO PHASES, TWO REQUESTS, and no exported function does both:
//
//   proposeCreate()  the draft is ready and a human is looking at it. Validates the entity and
//                    the draft against the manifest, re-checks the create gate, and writes a
//                    `studio_create` row to `agent_actions` with status 'proposed'. NOTHING is
//                    created. This is the only half Vera can reach.
//
//   confirmCreate()  the human tapped Create. Re-derives the CALLER from the session (a passed
//                    profile id is never trusted), re-checks the gate AT THE MOMENT OF THE
//                    WRITE, claims the proposal with a conditional update so it can only ever
//                    be spent once, and only then runs the caller's own commit. The audit row
//                    is closed out 'executed' or 'failed'.
//
// WHY A COMMIT CALLBACK, NOT A WRITER PER ENTITY. Each entity already has a correct, tested
// create path with its own scoped authority, its own slug rules, its own meters and its own
// side effects. Re-implementing nine of those inside a governance layer would be how the
// governance layer becomes the bug. This layer adds the gate, the audit and the confirm around
// a commit it does not own, which is also why adopting it is a small change at each call site
// rather than a rewrite.
//
// THE DETERMINISTIC PATH IS UNTOUCHED. Nothing here consults `aiAvailable()`, the model, or a
// prompt. With the AI kill switch off, a member creates exactly what they created before, by
// exactly the same commit, with the audit row still written. Governance is not an AI feature;
// it is the thing that lets an AI feature be turned on later.
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { canCreate } from '@/lib/core/load-capabilities'
import { studioManifest } from '@/lib/studio/registry'
import type { ProvenanceLedger } from '@/lib/studio/kernel/ledger'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import {
  CREATE_AUTONOMY_TIER,
  CREATE_ENTITY_TOOL,
  CREATE_GATES,
  checkCreateDraft,
  createConfirmLabel,
  createGateFor,
  parseDraftArg,
  type CreateAutonomyTier,
  type CreateGate,
} from './create-tools'
import { createCommitFor, hasCreateCommit } from './create-commits'

function db(): SupabaseClient {
  return createAdminClient()
}

/** The audit `kind` every governed create is filed under. One key, so the ladder can ask a
 *  single question: how many creates were proposed, how many were confirmed, how many failed. */
export const CREATE_AUDIT_KIND = 'studio_create'

/** A proposal older than this is stale and cannot be confirmed. A draft a member walked away
 *  from a day ago is not a thing they are still consenting to make. */
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000

/**
 * The cap on AI-DRAFTED proposals per member per day. A runaway agent loop cannot bury a member
 * under drafts, and the cap is the one thing that would have to be raised before creation could
 * ever graduate up the ladder.
 *
 * Deliberately NOT applied to human-driven proposals: a member filling in wizards all afternoon
 * is a good day, not an anomaly, and throttling the deterministic path would be a governance
 * layer breaking the product it governs.
 */
const AI_PROPOSALS_PER_DAY = 20

// ── Inputs and outputs ───────────────────────────────────────────────────────────────────

export interface ProposeCreateInput {
  entity: string
  /** The drafted fields, keyed by the manifest's own field paths. */
  draft: Record<string, unknown>
  /** The provenance ledger, for an entity that verifies its facts. Absent === no ledger. */
  ledger?: ProvenanceLedger
  /** The Space this lands under, when it has one. Audit + the scoped gate's own lookup. */
  spaceId?: string | null
  /** Did a model draft any of this? Audit and the AI cap only. Governance is identical either way. */
  aiDrafted?: boolean
  /** One plain line on why this draft, readable by the member and by whoever reads the ledger. */
  rationale?: string
}

export interface CreateProposal {
  proposalId: string
  entity: string
  /** The entity's member-facing name, from its manifest. */
  label: string
  /** The button copy for the confirm. */
  confirmLabel: string
  /** Always 'suggest'. Carried so a surface renders the grade rather than assuming it. */
  tier: CreateAutonomyTier
}

export interface CreateCommitInput {
  entity: string
  draft: Record<string, unknown>
  /** The signed-in caller, re-derived from the session by this layer. Trustworthy. */
  actorProfileId: string
  spaceId: string | null
  /** The audit row this write is recorded against, for the commit's own bookkeeping. */
  proposalId: string
}

export interface ConfirmCreateInput<T> {
  proposalId: string
  /**
   * The draft AS CONFIRMED. Pass it whenever the member edited anything on the review board:
   * what they approved is what gets validated and written, not what was proposed. Omit to
   * confirm the proposed draft unchanged.
   */
  draft?: Record<string, unknown>
  ledger?: ProvenanceLedger
  /** The entity's own create path. This layer never writes the row itself. */
  commit: (input: CreateCommitInput) => Promise<T>
}

// ── Gate re-check ────────────────────────────────────────────────────────────────────────

/**
 * Re-check the create gate for the CURRENT caller. Run at propose AND again at confirm, because
 * a capability can lapse between the two (a trial ends, a role is removed) and the only check
 * that matters is the one taken at the moment of the write.
 *
 * A `scoped` gate returns allowed: this layer does not become a second authority for a Space
 * plan limit or a per-Space role ladder. It records which gate holds the line and requires the
 * commit to enforce it, which the commit already does today.
 */
async function passesGate(gate: CreateGate): Promise<{ allowed: boolean; reason?: string }> {
  if (gate.kind === 'scoped') return { allowed: true }
  return (await canCreate(gate.capability))
    ? { allowed: true }
    : { allowed: false, reason: 'You do not have what you need to make one of these yet.' }
}

// ── Propose ──────────────────────────────────────────────────────────────────────────────

/**
 * PHASE ONE. Validate a drafted entity and record the proposal. Creates nothing.
 *
 * Fail-closed at every step: no session, an unknown entity, a catalog-only entity, a missing
 * required field, an uncleared commercial fact, a lapsed capability, or a blown AI cap all end
 * here with a plain sentence and no audit row claiming a write that did not happen.
 */
export async function proposeCreate(input: ProposeCreateInput): Promise<ActionResult<CreateProposal>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')

  const manifest = studioManifest(input.entity)
  const gate = createGateFor(input.entity)
  if (!manifest || !gate) return fail(`"${input.entity}" is not a thing the Studio knows how to make.`)

  const check = checkCreateDraft(input.entity, input.draft, input.ledger)
  if (!check.ok) return fail(check.errors.join(' '))

  const gated = await passesGate(gate)
  if (!gated.allowed) return fail(gated.reason ?? 'You cannot make one of these yet.')

  if (input.aiDrafted === true && (await aiProposalsToday(caller.id)) >= AI_PROPOSALS_PER_DAY) {
    return fail('That is enough drafts for one day. Finish one of the ones waiting for you first.')
  }

  const { data, error } = await db()
    .from('agent_actions')
    .insert({
      kind: CREATE_AUDIT_KIND,
      status: 'proposed',
      rationale: (input.rationale ?? '').trim().slice(0, 500) || null,
      payload: {
        tool: CREATE_ENTITY_TOOL,
        entity: input.entity,
        draft: input.draft,
        space_id: input.spaceId ?? null,
        actor_profile_id: caller.id,
        ai_drafted: input.aiDrafted === true,
        gate: gate.kind === 'capability' ? gate.capability : `scoped:${input.entity}`,
        tier: CREATE_AUTONOMY_TIER,
      },
    })
    .select('id')
    .single()

  if (error || !data) return fail('That draft could not be saved. Try again in a moment.')

  return ok({
    proposalId: data.id as string,
    entity: input.entity,
    label: manifest.label,
    confirmLabel: createConfirmLabel(input.entity),
    tier: CREATE_AUTONOMY_TIER,
  })
}

/** How many AI-drafted create proposals this member has had in the last day. Fail-closed: a
 *  read error reads as AT the cap, so a broken count refuses rather than waves everything through. */
async function aiProposalsToday(profileId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  try {
    const { data, error } = await db()
      .from('agent_actions')
      .select('payload')
      .eq('kind', CREATE_AUDIT_KIND)
      .gte('created_at', since)
      .limit(500)
    if (error) return AI_PROPOSALS_PER_DAY
    return (data ?? []).filter((row) => {
      const p = (row as { payload?: Record<string, unknown> }).payload ?? {}
      return p.actor_profile_id === profileId && p.ai_drafted === true
    }).length
  } catch {
    return AI_PROPOSALS_PER_DAY
  }
}

// ── Confirm ──────────────────────────────────────────────────────────────────────────────

/**
 * PHASE TWO. The human tapped Create. Re-derives the caller, re-validates the confirmed draft,
 * re-checks the gate, claims the proposal exactly once, then runs the entity's own commit.
 *
 * THE SINGLE-USE CLAIM is a conditional update (`status = 'proposed'` in the WHERE), so two
 * taps, a double-submit, or a replayed request cannot commit twice: the second update matches
 * no row and is refused. It is also why the claim happens BEFORE the commit rather than after.
 */
export async function confirmCreate<T>(input: ConfirmCreateInput<T>): Promise<ActionResult<T>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')

  const client = db()
  const { data: row } = await client
    .from('agent_actions')
    .select('id, kind, status, payload, created_at')
    .eq('id', input.proposalId)
    .maybeSingle()

  const proposal = row as
    | { id: string; kind: string; status: string; payload: Record<string, unknown> | null; created_at: string | null }
    | null

  if (!proposal || proposal.kind !== CREATE_AUDIT_KIND) return fail('That draft is no longer here.')
  if (proposal.status !== 'proposed') return fail('That draft has already been used.')

  const payload = proposal.payload ?? {}
  // A proposal belongs to the person who made it. Nobody confirms someone else's draft, and the
  // id in the payload is only ever compared against a caller this layer derived itself.
  if (payload.actor_profile_id !== caller.id) return fail('That draft is not yours to confirm.')

  const age = Date.now() - Date.parse(proposal.created_at ?? '')
  if (!Number.isFinite(age) || age > PROPOSAL_TTL_MS) {
    await closeOut(client, proposal.id, 'dismissed', caller.id, { reason: 'expired' })
    return fail('That draft is stale now. Start it again and it will only take a moment.')
  }

  const entity = String(payload.entity ?? '')
  const gate = createGateFor(entity)
  if (!gate) return fail('That draft is for something the Studio no longer makes.')

  const draft = input.draft ?? parseDraftArg(payload.draft) ?? {}
  const check = checkCreateDraft(entity, draft, input.ledger)
  if (!check.ok) return fail(check.errors.join(' '))

  // THE RE-CHECK THAT MATTERS: the gate, taken now, against the caller who is confirming.
  const gated = await passesGate(gate)
  if (!gated.allowed) return fail(gated.reason ?? 'You cannot make one of these yet.')

  // Claim it. Conditional on the status it was read at, so it can be spent exactly once.
  const { data: claimed } = await client
    .from('agent_actions')
    .update({ status: 'approved', decided_by: caller.id, decided_at: new Date().toISOString() })
    .eq('id', proposal.id)
    .eq('status', 'proposed')
    .select('id')
    .maybeSingle()
  if (!claimed) return fail('That draft has already been used.')

  try {
    const result = await input.commit({
      entity,
      draft,
      actorProfileId: caller.id,
      spaceId: (payload.space_id as string | null) ?? null,
      proposalId: proposal.id,
    })
    await closeOut(client, proposal.id, 'executed', caller.id, { draft })
    return ok(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'That did not go through.'
    await closeOut(client, proposal.id, 'failed', caller.id, { error: message.slice(0, 500) })
    return fail(message)
  }
}

/** Close the audit row out. Best-effort: a bookkeeping failure never fails a write that already
 *  happened, and the row's previous state still says a human approved it. */
async function closeOut(
  client: SupabaseClient,
  id: string,
  status: 'executed' | 'failed' | 'dismissed',
  decidedBy: string,
  extra: Record<string, unknown>,
): Promise<void> {
  try {
    const { data } = await client.from('agent_actions').select('payload').eq('id', id).maybeSingle()
    const payload = ((data as { payload?: Record<string, unknown> } | null)?.payload ?? {}) as Record<string, unknown>
    await client
      .from('agent_actions')
      .update({
        status,
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        payload: { ...payload, ...extra, outcome: status },
      })
      .eq('id', id)
  } catch {
    /* audit bookkeeping is best-effort; the write itself already succeeded or failed on its own terms */
  }
}

// ── The member-visible side of a proposal (ADR-998) ──────────────────────────────────────
//
// ADR-988 wrote proposals nobody could read: a `studio_create` row sat at status 'proposed'
// with no surface, so the member whose draft it was could neither finish it nor throw it away,
// and a proposal Vera made simply expired in silence. These two reads and one write are what a
// surface needs, and they live HERE rather than in the route so the ownership rule, the TTL and
// the single-use claim are stated in exactly one file.

export interface PendingCreateProposal {
  proposalId: string
  entity: string
  /** The entity's member-facing name, from its manifest. Falls back to the raw id. */
  label: string
  confirmLabel: string
  draft: Record<string, unknown>
  spaceId: string | null
  /** Did a model draft this, or did the member? Shown, because it changes how it should read. */
  aiDrafted: boolean
  rationale: string | null
  createdAt: string
  /** When this stops being confirmable. A draft a member walked away from is not consent. */
  expiresAt: string
  /** Whether this surface can finish it here, or has to hand them back to the wizard. */
  commitAvailable: boolean
}

/**
 * The caller's OWN pending proposals, newest first. Never anyone else's: the filter is the
 * caller this function derived itself, and the payload's `actor_profile_id` is only ever
 * COMPARED against it. Expired rows are dropped from the read rather than shown as confirmable.
 */
export async function listMyCreateProposals(limit = 25): Promise<PendingCreateProposal[]> {
  const caller = await getCallerProfile()
  if (!caller) return []

  const since = new Date(Date.now() - PROPOSAL_TTL_MS).toISOString()
  const { data, error } = await db()
    .from('agent_actions')
    .select('id, status, payload, rationale, created_at')
    .eq('kind', CREATE_AUDIT_KIND)
    .eq('status', 'proposed')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100))
  if (error || !data) return []

  const rows = data as {
    id: string
    payload: Record<string, unknown> | null
    rationale: string | null
    created_at: string | null
  }[]

  const out: PendingCreateProposal[] = []
  for (const row of rows) {
    const payload = row.payload ?? {}
    if (payload.actor_profile_id !== caller.id) continue
    const entity = String(payload.entity ?? '')
    if (!createGateFor(entity)) continue
    const created = row.created_at ?? new Date().toISOString()
    out.push({
      proposalId: row.id,
      entity,
      label: studioManifest(entity)?.label ?? entity,
      confirmLabel: createConfirmLabel(entity),
      draft: parseDraftArg(payload.draft) ?? {},
      spaceId: (payload.space_id as string | null) ?? null,
      aiDrafted: payload.ai_drafted === true,
      rationale: (row.rationale ?? null) || null,
      createdAt: created,
      expiresAt: new Date(Date.parse(created) + PROPOSAL_TTL_MS).toISOString(),
      commitAvailable: hasCreateCommit(entity),
    })
  }
  return out
}

/** The entities `listMyCreateProposals` will actually SHOW: a key in CREATE_GATES that is still a
 *  creatable entity. Computed once at module load so the count below can apply the same filter the
 *  list applies, in SQL rather than in JS — the badge and the page must never disagree. */
const COUNTABLE_CREATE_ENTITIES: readonly string[] = Object.keys(CREATE_GATES).filter(
  (entity) => createGateFor(entity) !== null,
)

/**
 * How many open proposals the caller has — the same set `listMyCreateProposals` would return,
 * counted instead of read.
 *
 * WHY A SEPARATE FUNCTION AND NOT `listMyCreateProposals().length`. This runs in the app shell on
 * EVERY page load (the My Frequency menu, lib/nav/my-frequency.ts), and the list read pulls up to
 * 25 full `payload` jsonb blobs back over the wire and then filters them in JS. Here every filter
 * is expressed in SQL and the request is `head: true`, so Postgres answers with a count and no rows
 * at all. `agent_actions_status_idx (status, created_at desc)` covers the two selective predicates,
 * and "proposed in the last 24h" is inherently a tiny working set — a proposal is confirmed,
 * dismissed, or expired out of it within a day.
 *
 * SAME AUTHORITY AS THE LIST. The caller is re-derived from the session and never passed in, and
 * `actor_profile_id` is compared against it — a member can only ever count their own. React-cached
 * so the rail and the mobile drawer share one resolution per request.
 *
 * FAIL-SAFE: any error resolves to 0, which renders no badge. Navigation never blocks on this.
 */
export const countMyCreateProposals = cache(async (): Promise<number> => {
  try {
    const caller = await getCallerProfile()
    if (!caller) return 0

    const since = new Date(Date.now() - PROPOSAL_TTL_MS).toISOString()
    const { count, error } = await db()
      .from('agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('kind', CREATE_AUDIT_KIND)
      .eq('status', 'proposed')
      .gte('created_at', since)
      // jsonb arrow filters, the same shape loadPageViews uses (ADR-246 exception). These are the
      // two predicates the list applies in JS; applied here they keep the count honest.
      .eq('payload->>actor_profile_id', caller.id)
      .in('payload->>entity', COUNTABLE_CREATE_ENTITIES)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
})

/**
 * Throw a proposal away. The mirror of the confirm claim and deliberately the same shape: the
 * caller is re-derived, the proposal must be THEIRS, and the update is conditional on
 * `status = 'proposed'`, so a dismissed proposal can never be confirmed afterwards and a
 * confirmed one can never be dismissed out from under the write it already ran.
 */
export async function dismissCreateProposal(proposalId: string): Promise<ActionResult<void>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')

  const client = db()
  const { data: row } = await client
    .from('agent_actions')
    .select('id, kind, status, payload')
    .eq('id', proposalId)
    .maybeSingle()
  const proposal = row as
    | { id: string; kind: string; status: string; payload: Record<string, unknown> | null }
    | null

  if (!proposal || proposal.kind !== CREATE_AUDIT_KIND) return fail('That draft is no longer here.')
  if ((proposal.payload ?? {}).actor_profile_id !== caller.id) return fail('That draft is not yours.')
  if (proposal.status !== 'proposed') return fail('That draft has already been used.')

  const { data: claimed } = await client
    .from('agent_actions')
    .update({ status: 'dismissed', decided_by: caller.id, decided_at: new Date().toISOString() })
    .eq('id', proposal.id)
    .eq('status', 'proposed')
    .select('id')
    .maybeSingle()
  if (!claimed) return fail('That draft has already been used.')
  return ok()
}

/**
 * Confirm a proposal from the DRAFTS surface, using the entity's own create path from the commit
 * registry. Thin on purpose: every gate, the ownership check, the TTL and the single-use claim
 * are `confirmCreate`'s, unchanged. The only thing added here is looking up which commit to run,
 * and refusing plainly when the entity has none registered.
 *
 * An entity with no registered commit is NOT a failure of this layer. It means the authority that
 * decides is scoped to the entity's own action (a Space plan limit, a per-Space role ladder, a
 * seller gate), and the governance layer must not become a second authority for it (ADR-988 §4).
 * Those drafts can still be read and dismissed here; they are finished in their own wizard.
 */
export async function confirmProposalWithRegisteredCommit(
  proposalId: string,
  draft?: Record<string, unknown>,
): Promise<ActionResult<{ entity: string; href: string | null }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')

  const { data: row } = await db()
    .from('agent_actions')
    .select('kind, status, payload')
    .eq('id', proposalId)
    .maybeSingle()
  const proposal = row as
    | { kind: string; status: string; payload: Record<string, unknown> | null }
    | null
  if (!proposal || proposal.kind !== CREATE_AUDIT_KIND) return fail('That draft is no longer here.')
  if ((proposal.payload ?? {}).actor_profile_id !== caller.id) return fail('That draft is not yours to confirm.')

  const entity = String((proposal.payload ?? {}).entity ?? '')
  const commit = createCommitFor(entity)
  if (!commit) {
    const label = studioManifest(entity)?.label ?? 'this'
    return fail(`Finish this ${label} in its own builder. This is where you keep or bin the draft, not where it gets made.`)
  }

  // From here the governed layer owns everything: it re-derives the caller AGAIN, re-checks the
  // gate at the moment of the write, refuses a stale or already-spent proposal, and claims the
  // row exactly once before the commit runs.
  const res = await confirmCreate<{ href: string | null }>({
    proposalId,
    draft,
    commit: (input) => commit(input),
  })
  return 'error' in res ? res : ok({ entity, href: res.data.href })
}

// ── The Vera tool entry point ────────────────────────────────────────────────────────────

/**
 * What `create_entity` does when Vera calls it: it PROPOSES, and that is the whole of it.
 *
 * There is no confirm tool and no `approvedSend`-style graduation flag for creation, so no
 * sequence of model output reaches `confirmCreate`. The member has to open the draft and tap
 * Create in their own session. This function is the structural statement of that.
 */
export async function proposeCreateFromTool(
  actorProfileId: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  // The caller is re-derived inside proposeCreate; `actorProfileId` is the confirming session's
  // id as the tool loop knows it, and a mismatch means the loop is running for someone else.
  const caller = await getCallerProfile()
  if (!caller || caller.id !== actorProfileId) return { ok: false, error: 'Sign in first.' }

  const draft = parseDraftArg(args.draft)
  if (!draft) return { ok: false, error: 'That draft did not come through in one piece.' }

  const res = await proposeCreate({
    entity: String(args.entity ?? ''),
    draft,
    spaceId: typeof args.spaceId === 'string' ? args.spaceId : null,
    aiDrafted: true,
    rationale: typeof args.rationale === 'string' ? args.rationale : undefined,
  })
  return 'error' in res ? { ok: false, error: res.error } : { ok: true }
}
