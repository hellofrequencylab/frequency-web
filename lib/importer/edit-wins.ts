// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — EDIT-WINS ON RE-APPLY (P5, docs/BUSINESS-IMPORTER.md §5). PURE
// (no AI / IO): the diff logic that lets a re-apply preserve an operator's edits to the LIVE Space.
//
// The problem (the old TODO(P5) in materialize.ts): a re-apply of a seeded Space OVERWROTE the
// identity columns (name / tagline / brand name / brand accent) with the fresh draft, clobbering any
// edit the operator made on the live Space after the first seed.
//
// The fix (mirrors the shipped re-research edit-wins, draft._editedProse / nextEditedProse): the
// materializer stamps a MARKER on the Space's preferences jsonb (NO new column) recording the identity
// values IT last wrote (`appliedIdentity`) plus any fields already known-edited (`editedFields`). On the
// NEXT apply, we DIFF the live Space value against that snapshot: a field whose live value no longer
// matches what we wrote is an OPERATOR EDIT, so it is added to `editedFields` and SKIPPED on the write
// (edit-wins). Everything un-edited is refreshed from the draft as before. Backwards-compatible: with no
// prior marker (a Space seeded before this shipped, or a fresh create), nothing is treated as edited.
//
// SCOPE: the four operator-editable identity columns the materializer's updateSpaceIdentity overwrites
// AND that ride the Space object (name / tagline / brandName / brandAccent). No em dashes (§10).
// ─────────────────────────────────────────────────────────────────────────────

/** The identity columns a re-apply gates for edit-wins. Each key names both a plan.identity field and
 *  a Space object field, so the diff compares like for like. */
export const GATED_IDENTITY_FIELDS = ['name', 'tagline', 'brandName', 'brandAccent'] as const
export type GatedIdentityField = (typeof GATED_IDENTITY_FIELDS)[number]

/** The identity values, as read off the live Space or built from the draft's plan. */
export type IdentityValues = Partial<Record<GatedIdentityField, string | null>>

/** The marker stored at `preferences.importerEditWins`. `appliedIdentity` is what the materializer last
 *  wrote (the diff baseline); `editedFields` is the accumulated set of operator-edited fields. */
export interface SeedEditWinsMarker {
  editedFields: string[]
  appliedIdentity: IdentityValues
}

/** Compare two identity values with null/undefined/whitespace folded to the empty string. PURE. */
function sameValue(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim() === (b ?? '').trim()
}

/** Read the edit-wins marker off a Space's preferences jsonb. Total + defensive: an absent / malformed
 *  marker reads as an empty baseline (nothing edited, no snapshot). PURE. */
export function readSeedEditWins(prefs: unknown): SeedEditWinsMarker {
  const root = prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? (prefs as Record<string, unknown>) : {}
  const raw = root.importerEditWins
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}

  const editedFields = Array.isArray(obj.editedFields)
    ? obj.editedFields.filter(
        (v): v is GatedIdentityField => typeof v === 'string' && (GATED_IDENTITY_FIELDS as readonly string[]).includes(v),
      )
    : []

  const appliedRaw =
    obj.appliedIdentity && typeof obj.appliedIdentity === 'object' && !Array.isArray(obj.appliedIdentity)
      ? (obj.appliedIdentity as Record<string, unknown>)
      : {}
  const appliedIdentity: IdentityValues = {}
  for (const f of GATED_IDENTITY_FIELDS) {
    const v = appliedRaw[f]
    if (typeof v === 'string') appliedIdentity[f] = v
    else if (v === null) appliedIdentity[f] = null
  }

  return { editedFields: Array.from(new Set(editedFields)), appliedIdentity }
}

/** The fields the operator has edited: the prior known set UNIONED with any field whose live value now
 *  differs from what the materializer last wrote (`appliedIdentity`). A field with NO baseline is never
 *  inferred edited (we cannot tell). Order-stable + de-duped. PURE. */
export function detectEditedFields(prior: SeedEditWinsMarker, live: IdentityValues): GatedIdentityField[] {
  const set = new Set<GatedIdentityField>(
    prior.editedFields.filter((f): f is GatedIdentityField => (GATED_IDENTITY_FIELDS as readonly string[]).includes(f)),
  )
  for (const f of GATED_IDENTITY_FIELDS) {
    const baseline = prior.appliedIdentity[f]
    if (baseline === undefined) continue // no baseline yet: cannot tell an operator edit from a fresh seed
    if (!sameValue(baseline, live[f])) set.add(f)
  }
  return GATED_IDENTITY_FIELDS.filter((f) => set.has(f))
}

/** The identity patch to WRITE on a re-apply: the plan values for every field EXCEPT the edited ones
 *  (edit-wins skips those, preserving the operator's value). A field present in the result is written;
 *  an absent field is left as the operator left it. PURE. */
export function gateIdentityPatch(planValues: IdentityValues, edited: readonly string[]): IdentityValues {
  const editedSet = new Set(edited)
  const out: IdentityValues = {}
  for (const f of GATED_IDENTITY_FIELDS) {
    if (editedSet.has(f)) continue
    out[f] = planValues[f] ?? null
  }
  return out
}

/** The NEXT snapshot baseline after a write: for an edited field, the operator's live value (so a future
 *  re-apply keeps diffing against what is actually on the Space); for an un-edited field, the plan value
 *  we just wrote. PURE. */
export function nextAppliedIdentity(
  planValues: IdentityValues,
  live: IdentityValues,
  edited: readonly string[],
): IdentityValues {
  const editedSet = new Set(edited)
  const snap: IdentityValues = {}
  for (const f of GATED_IDENTITY_FIELDS) {
    snap[f] = editedSet.has(f) ? (live[f] ?? null) : (planValues[f] ?? null)
  }
  return snap
}

/** Merge the edit-wins marker into a preferences object (read-modify-write; every other key preserved).
 *  PURE. */
export function writeSeedEditWins(
  prefs: Record<string, unknown>,
  marker: SeedEditWinsMarker,
): Record<string, unknown> {
  return {
    ...prefs,
    importerEditWins: { editedFields: marker.editedFields, appliedIdentity: marker.appliedIdentity },
  }
}
