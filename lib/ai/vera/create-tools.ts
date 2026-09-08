// ─────────────────────────────────────────────────────────────────────────────
// THE GOVERNED CREATE-TOOL SURFACE (ADR-988; ADR-986 Studio, ADR-066 + ADR-028 Vera).
//
// Creation is the highest-volume write on the platform, and until now it was the ONE write
// that skipped governance entirely: a wizard called its own server action, so the write never
// reached the audit log the autonomy ladder is supposed to be earned against, and the consent,
// caps and propose-and-confirm gate that every other AI-adjacent write passes were simply not
// in the path.
//
// This file is the PURE half of the fix. It declares what a governed create IS:
//   * WHICH entities may be created  — DERIVED from the Studio catalog, never re-listed here.
//   * At WHAT autonomy grade         — `suggest`, and `auto` is not representable (see below).
//   * Under WHICH gate               — one declared gate per entity, drift-guarded by test.
//   * With WHAT draft                — the manifest's own required fields + the kernel's own
//                                      commercial-fact clearance rule, re-checked server-side.
//
// PURE (types, data, and total functions). No React, no Next, no Supabase, no IO. The server
// half — the audit rows, the caller re-derivation, the two-phase commit — lives beside it in
// create-entity.ts, which is the only file that touches a database.
//
// THREE STRUCTURAL DEFENSES, none of them a prompt:
//
//  1. THE SURFACE IS DERIVED. `creatableEntityIds()` reads STUDIO_ENTITIES. A tool that could
//     name an entity the catalog does not know is exactly the drift ADR-986 exists to kill, so
//     the tool's own parameter description is generated from the catalog too.
//
//  2. `auto` IS UNREPRESENTABLE. `CreateAutonomyTier` is `Exclude<AutonomyTier, 'auto'>`, so a
//     future edit that grades creation `auto` does not fail a test, it fails to compile. The
//     vocabulary is the existing playbook one (lib/playbooks/registry.ts); nothing new was
//     invented. `create_entity` is also absent from `PlaybookActionTool`, so the one code path
//     that CAN auto-execute a governed tool cannot name this one.
//
//  3. THE MODEL CAN ONLY PROPOSE. The tool key registered in Vera's allow-list resolves, in
//     execute.ts, to a PROPOSE. There is no confirm tool, so no sequence of model output
//     commits an entity. A human calls the confirm half directly, from their own session.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldDef } from '@/lib/studio/kernel/manifest'
import { isCatalogOnly } from '@/lib/studio/kernel/manifest'
import type { ProvenanceLedger } from '@/lib/studio/kernel/ledger'
import { buildFieldModel } from '@/lib/studio/kernel/review-kernel'
import { STUDIO_ENTITIES, studioManifest } from '@/lib/studio/registry'
import { effectiveAutonomyTier, type AutonomyTier } from '@/lib/playbooks/registry'
import { jsonObject, parseModelJson, validateModelValue } from '@/lib/ai/schema'
// TYPE-ONLY, deliberately: lib/core/load-capabilities.ts is a server seam (it reaches for the
// admin client and React `cache`), and an `import type` is erased, so naming a capability the
// policy layer does not know is a COMPILE error while this file stays pure and testable.
import type { CreateCapability } from '@/lib/core/load-capabilities'
import type { VeraToolDef } from './tools'

// ── The tool key ─────────────────────────────────────────────────────────────────────────

/** The one governed create tool. ONE tool for every entity, because the catalog is what varies. */
export const CREATE_ENTITY_TOOL = 'create_entity'

// ── Autonomy (the existing vocabulary, narrowed) ──────────────────────────────────────────

/**
 * The autonomy grades a CREATE may hold. `auto` is excluded at the type level: creating a
 * Circle, an Event, a Journey, a listing or a Space is a member-facing, publicly visible,
 * non-trivially-reversible write, which is precisely the case the suggest-by-default law in
 * lib/playbooks/registry.ts reserves for a human tap. Deleting a thing a member did not mean
 * to make is not an Undo, it is an apology.
 */
export type CreateAutonomyTier = Exclude<AutonomyTier, 'auto'>

/** The declared grade of every governed create. Propose, then a human confirms. Always. */
export const CREATE_AUTONOMY_TIER: CreateAutonomyTier = 'suggest'

/**
 * The EFFECTIVE grade under a Space's autonomy slider. Runs the shared decision
 * (`effectiveAutonomyTier`) so creation can never disagree with the rest of the ladder, then
 * narrows the result back to the create tiers. A `safe_auto` Space raises playbooks, not
 * creates: the design tier is already `suggest`, and `effectiveAutonomyTier` never raises.
 */
export function effectiveCreateTier(autoAllowed: boolean): CreateAutonomyTier {
  const tier = effectiveAutonomyTier(CREATE_AUTONOMY_TIER, autoAllowed)
  // Total by construction: `effectiveAutonomyTier` only ever DOWNGRADES `auto` -> `suggest`,
  // and the input is never `auto`. The guard is here so a future change to that function
  // cannot silently widen creation.
  return tier === 'auto' ? 'suggest' : tier
}

/** Whether a governed create would ever execute without a human tap. Always false, at any
 *  slider position. Asserted by test so the answer cannot quietly become "it depends". */
export function createEverAutoExecutes(autoAllowed: boolean): boolean {
  // Widened to the full tier union on purpose: `CreateAutonomyTier` cannot even HOLD 'auto', so
  // the comparison is only expressible after the upcast. That is the point being asserted.
  return (effectiveCreateTier(autoAllowed) as AutonomyTier) === 'auto'
}

// ── The derived surface ──────────────────────────────────────────────────────────────────

/**
 * The entities a governed create covers: every registered manifest that has a GUIDED flow.
 *
 * Derived, not listed. Catalog-only entities (a Channel, a Room, a Hub, a Nexus, a Broadcast)
 * are excluded because the exclusion is what their manifest already says: they declare no
 * source material to accept and nothing to steer, so nothing drafts them. A human types two
 * fields into a modal and taps Create, which IS the propose-and-confirm gate, performed by the
 * person. Wrapping that in a proposal row would audit a human typing their own name.
 */
export function creatableEntities(): readonly EntityManifest[] {
  return STUDIO_ENTITIES.filter((m) => !isCatalogOnly(m))
}

/** Every entity id a governed create covers, in catalog order. */
export function creatableEntityIds(): string[] {
  return creatableEntities().map((m) => m.entity)
}

/** Whether an entity id is one this tool may create. Total: unknown and catalog-only both false. */
export function isCreatableEntity(entity: string): boolean {
  const m = studioManifest(entity)
  return !!m && !isCatalogOnly(m)
}

// ── The gate (one per entity, drift-guarded) ─────────────────────────────────────────────

/**
 * WHICH authority says yes to creating this entity. Two kinds, because the platform genuinely
 * has two:
 *
 *  - `capability` — a GLOBAL creation gate in the policy layer (lib/core/capabilities.ts). The
 *    governed layer re-checks it itself, twice: once when the draft is proposed, once at the
 *    moment of the write.
 *  - `scoped`     — the authority is per-scope and lives with the entity: a Space plan limit
 *    (lib/pricing/space-limits.ts), a per-Space role ladder (lib/spaces/entitlements.ts), a
 *    seller gate. The governed layer does NOT become a second authority for these; it records
 *    that the scoped gate is the one that decides and requires the commit to enforce it.
 *
 * Declaring `scoped` is a statement, not a hole: `why` has to say which gate holds the line,
 * and the drift-guard test requires EVERY creatable entity to appear here. A new manifest
 * therefore cannot land with no gate at all, which is the failure mode worth guarding.
 */
export type CreateGate =
  | { kind: 'capability'; capability: CreateCapability }
  | { kind: 'scoped'; why: string }

export const CREATE_GATES: Readonly<Record<string, CreateGate>> = {
  // The four global creation capabilities (ADR-414 / ADR-810 / ADR-908).
  circle: { kind: 'capability', capability: 'circle.create' },
  event: { kind: 'capability', capability: 'event.create' },
  journey: { kind: 'capability', capability: 'journey.create' },
  practice: { kind: 'capability', capability: 'practice.create' },
  // Scoped authorities. Each names the gate that actually decides.
  space: {
    kind: 'scoped',
    why: 'The Space plan limit decides (lib/pricing/space-limits.ts canCreateSpace): one free Space, more on a paid plan.',
  },
  business: {
    kind: 'scoped',
    why: 'A researched Space. Same plan limit as a Space, plus the Seeder is operator-run and its provenance ledger must clear.',
  },
  listing: {
    kind: 'scoped',
    why: 'The marketplace seller gate on the owning Space decides (lib/spaces/entitlements.ts), not a global capability.',
  },
  housing: {
    kind: 'scoped',
    why:
      'Signed in with a profile is the whole gate: createHousingListingAction (app/(main)/marketplace/actions.ts) ' +
      'redirects to /sign-in and does nothing else. Housing is a NEIGHBOUR board, not a seller surface, so ' +
      'unlike `listing` there is no owning Space and no seller entitlement to consult. Stated here rather ' +
      'than left absent, because "no gate" and "nobody wrote the gate down" have to look different.',
  },
  product: {
    kind: 'scoped',
    why: 'The owning Space role ladder decides who may add a product (lib/spaces/entitlements.ts).',
  },
  service: {
    kind: 'scoped',
    why: 'The owning Space role ladder decides who may add a service (lib/spaces/entitlements.ts).',
  },
}

/** The declared gate for an entity, or null when it is unknown or catalog-only. Total. */
export function createGateFor(entity: string): CreateGate | null {
  if (!isCreatableEntity(entity)) return null
  return CREATE_GATES[entity] ?? null
}

// ── The per-road scoped gate (ADR-1280) ──────────────────────────────────────────────────
//
// CREATE_GATES declares ONE gate per entity, and for four entities that gate is a global
// capability. One road disagrees with its entity on purpose: the Space Practice road is open to
// anyone who MANAGES the Space (owner / admin / editor), so a free member running a Space can
// build the practices their members do, while `practice.create` is the Crew-only gate on the
// public library. Re-checking the entity's capability at that road's write would refuse a create
// the road has always accepted, which is why it sat in UNROUTED for 28 days.
//
// A road may therefore declare the gate it ALREADY enforces, in the same shape a `scoped` entry
// in CREATE_GATES takes, and the layer records that gate instead of re-applying the entity's.
// This is a statement, not a hole, for the same reason the entity-level `scoped` arm is one:
// `why` has to name the check the road runs ahead of the layer, the audit row records it beside
// the entity, and scripts/check-creates.mjs names every road that declares one (ROAD_GATES),
// so a road cannot quietly opt out of a capability by writing three words in a call.

/** A gate a ROAD declares for itself. Only ever the scoped shape: a road cannot pick a
 *  capability, because the capability it could name is the one the entity already declares. */
export type RoadGate = { kind: 'scoped'; why: string }

/**
 * The gate that holds the line for THIS create: the road's own scoped gate when it declared one,
 * otherwise the entity's. Total: an unknown or catalog-only entity is null with or without a
 * road gate, so a road cannot make an uncreatable entity creatable by scoping it.
 */
export function resolveCreateGate(entity: string, roadGate?: RoadGate | null): CreateGate | null {
  const declared = createGateFor(entity)
  if (!declared) return null
  if (roadGate && roadGate.kind === 'scoped' && roadGate.why.trim().length > 0) {
    return { kind: 'scoped', why: roadGate.why }
  }
  return declared
}

/**
 * Read a road gate back off a stored audit payload. Fail-closed: anything that is not exactly
 * the scoped shape with a non-empty reason reads as "no road gate", so the confirm re-applies
 * the entity's own gate rather than trusting a malformed record.
 */
export function readRoadGate(raw: unknown): RoadGate | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.kind !== 'scoped' || typeof r.why !== 'string' || r.why.trim().length === 0) return null
  return { kind: 'scoped', why: r.why }
}

// ── The create stage (ADR-1280) ──────────────────────────────────────────────────────────
//
// A draft-status row IS a create: it inserts a row a member owns, and it is real, unaudited
// create volume until the layer sees it. What a draft may lack is a field the manifest defers
// to publish (`requiredAt: 'publish'`). The stage says which check applies. It defaults to
// 'publish', the strict reading, so every caller that does not say otherwise keeps requiring
// everything it required before.

/** Whether the create being checked is a draft-status insert or a live one. */
export type CreateStage = 'draft' | 'publish'

/** Whether a manifest field must be present at this stage. PURE. A field with no `requiredAt`
 *  is enforced at the create, the meaning `required` has always had. */
export function requiredAtStage(field: Pick<FieldDef, 'required' | 'requiredAt'>, stage: CreateStage): boolean {
  if (!field.required) return false
  return stage === 'publish' || (field.requiredAt ?? 'create') === 'create'
}

// ── The tool definition (derived from the catalog) ────────────────────────────────────────

/** The member-facing confirm label for an entity's create. Voice canon: plain, no dashes. */
export function createConfirmLabel(entity: string): string {
  const label = studioManifest(entity)?.label
  return label ? `Create this ${label}` : 'Create this'
}

/**
 * The `create_entity` tool, BUILT from the Studio catalog. The entity parameter's description
 * lists the live ids, so adding a manifest widens the tool and removing one narrows it, with no
 * second list to keep in step. A write tool, so `requiresConfirmation` is true for it and the
 * existing validator enforces its params like any other.
 */
export function createEntityToolDef(): VeraToolDef {
  return {
    key: CREATE_ENTITY_TOOL,
    description:
      'PROPOSE a new thing for the member to create, drafted from what they told you. This never creates anything on its own: it puts a draft in front of them to read, change, and approve, and only their tap makes it real. Known kinds: ' +
      creatableEntityIds().join(', ') +
      '.',
    mode: 'write',
    confirmLabel: 'Review this draft',
    params: [
      {
        name: 'entity',
        type: 'string',
        required: true,
        description: `What kind of thing to draft. One of: ${creatableEntityIds().join(' | ')}.`,
      },
      {
        name: 'draft',
        type: 'string',
        required: true,
        description:
          'The drafted fields as a JSON object, keyed by the field paths the kind declares (for example {"name":"Sunrise Swim","about":"..."}). Fill what you know and leave the rest out.',
      },
      {
        name: 'spaceId',
        type: 'string',
        required: false,
        description: 'The Space this belongs under, when it has one. Omit for a member-owned thing.',
      },
      {
        name: 'rationale',
        type: 'string',
        required: false,
        description: 'One plain line on why this draft, for the audit trail the member can read.',
      },
    ],
  }
}

// ── Draft validation (the same rules the review board paints) ─────────────────────────────

/** Walk a dotted path off a record. Mirrors the kernel's own reader. PURE + total. */
function at(scope: Record<string, unknown>, path: string): unknown {
  let cur: unknown = scope
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** Whether a draft value counts as supplied. Empty string and whitespace do not. PURE. */
function present(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

export interface CreateDraftCheck {
  ok: boolean
  /** Plain sentences, all of them, so a caller can show every problem in one pass. */
  errors: string[]
}

/**
 * Validate a proposed draft against its manifest. PURE and total, so the same function runs on
 * the review board and again on the server at the moment of the write, and the two can never
 * disagree about what "ready" means.
 *
 * Three rules, all of them the kernel's own:
 *   1. the entity must be a KNOWN, creatable one (an unknown id is rejected, never coerced);
 *   2. every `required` field the manifest declares must be present — at the STAGE being
 *      checked (ADR-1280): a `draft` create may omit a field the manifest marks
 *      `requiredAt: 'publish'`; a `publish` create, the default, may omit nothing;
 *   3. no commercial fact may be red — `buildFieldModel(...).summary.blocked` is the one
 *      clearance rule, and this re-runs it rather than restating it. Passing no ledger is the
 *      honest default for an entity with `verify: 'none'`, and correctly BLOCKS an entity that
 *      declares commercial facts (a Space, a listing) until its ledger clears them.
 */
export function checkCreateDraft(
  entity: string,
  draft: Record<string, unknown>,
  ledger: ProvenanceLedger = {},
  stage: CreateStage = 'publish',
): CreateDraftCheck {
  const manifest = studioManifest(entity)
  if (!manifest) {
    return { ok: false, errors: [`"${entity}" is not a thing the Studio knows how to make.`] }
  }
  if (isCatalogOnly(manifest)) {
    return {
      ok: false,
      errors: [`A ${manifest.label} has no guided flow, so it is made on its own screen rather than drafted here.`],
    }
  }
  if (!createGateFor(entity)) {
    return { ok: false, errors: [`${manifest.label} has no declared create gate, so nothing may be made through here.`] }
  }

  const errors: string[] = []
  for (const f of manifest.fields) {
    if (requiredAtStage(f, stage) && !present(at(draft, f.path))) errors.push(`${manifest.label} needs a ${f.label}.`)
  }

  const model = buildFieldModel(manifest, draft, ledger)
  if (model.summary.blocked) {
    const red = model.sections
      .flatMap((s) => s.fields)
      .filter((f) => f.blocksApply)
      .map((f) => f.label)
    errors.push(
      red.length
        ? `These need a source or a human check before they can publish: ${red.join(', ')}.`
        : 'Something here needs a source or a human check before it can publish.',
    )
  }

  return { ok: errors.length === 0, errors }
}

// ── Tool-arg coercion ────────────────────────────────────────────────────────────────────

/**
 * Read the `draft` tool argument, which arrives as a JSON STRING because the bounded tool
 * surface only carries scalars (tools.ts `ParamType`). Fail-closed: anything that is not a
 * plain JSON object reads as null, and the caller refuses rather than creating an empty thing.
 */
export function parseDraftArg(raw: unknown): Record<string, unknown> | null {
  // One schema (ADR-1287) for both shapes the argument arrives in: an object the SDK already
  // parsed, or the JSON string the scalar-only tool surface carries.
  const res = typeof raw === 'string' ? parseModelJson(raw, jsonObject) : validateModelValue(raw, jsonObject)
  return res.ok ? res.data : null
}
