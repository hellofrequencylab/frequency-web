import { describe, it, expect } from 'vitest'
import {
  GATED_IDENTITY_FIELDS,
  readSeedEditWins,
  detectEditedFields,
  gateIdentityPatch,
  nextAppliedIdentity,
  writeSeedEditWins,
  type IdentityValues,
  type SeedEditWinsMarker,
} from './edit-wins'

// EDIT-WINS ON RE-APPLY (P5, ADR-606). The property this suite pins: a re-apply preserves an operator's
// edit to the live Space by diffing against the snapshot the materializer last wrote.

const PLAN: IdentityValues = { name: 'Still Point', tagline: 'Come as you are', brandName: 'Still Point', brandAccent: 'sage' }

describe('readSeedEditWins', () => {
  it('reads an empty baseline from absent / malformed prefs', () => {
    for (const prefs of [undefined, null, {}, [], { importerEditWins: 7 }, 'x']) {
      const m = readSeedEditWins(prefs)
      expect(m.editedFields).toEqual([])
      expect(m.appliedIdentity).toEqual({})
    }
  })

  it('round-trips through writeSeedEditWins, keeping other keys', () => {
    const marker: SeedEditWinsMarker = { editedFields: ['tagline'], appliedIdentity: { name: 'A', tagline: null } }
    const prefs = writeSeedEditWins({ isDemo: true, theme: 'bold' }, marker)
    expect(prefs.isDemo).toBe(true)
    expect(prefs.theme).toBe('bold')
    const read = readSeedEditWins(prefs)
    expect(read.editedFields).toEqual(['tagline'])
    expect(read.appliedIdentity).toEqual({ name: 'A', tagline: null })
  })

  it('drops unknown edited-field names', () => {
    const read = readSeedEditWins({ importerEditWins: { editedFields: ['tagline', 'bogus', 42], appliedIdentity: {} } })
    expect(read.editedFields).toEqual(['tagline'])
  })
})

describe('detectEditedFields', () => {
  const baseline: SeedEditWinsMarker = { editedFields: [], appliedIdentity: { ...PLAN } }

  it('detects nothing when the live Space matches the snapshot', () => {
    expect(detectEditedFields(baseline, { ...PLAN })).toEqual([])
  })

  it('detects a field the operator changed on the live Space', () => {
    const live: IdentityValues = { ...PLAN, tagline: 'A calmer edit' }
    expect(detectEditedFields(baseline, live)).toEqual(['tagline'])
  })

  it('folds null / undefined / whitespace to equal (no false positive)', () => {
    const snap: SeedEditWinsMarker = { editedFields: [], appliedIdentity: { name: 'A', tagline: null } }
    expect(detectEditedFields(snap, { name: 'A ', tagline: '' })).toEqual([])
    expect(detectEditedFields(snap, { name: 'A', tagline: undefined })).toEqual([])
  })

  it('never infers an edit for a field with no baseline', () => {
    const snap: SeedEditWinsMarker = { editedFields: [], appliedIdentity: {} } // no snapshot at all
    expect(detectEditedFields(snap, { ...PLAN, tagline: 'anything' })).toEqual([])
  })

  it('keeps a previously-known edited field even if it now matches', () => {
    const snap: SeedEditWinsMarker = { editedFields: ['brandAccent'], appliedIdentity: { ...PLAN } }
    expect(detectEditedFields(snap, { ...PLAN })).toEqual(['brandAccent'])
  })
})

describe('gateIdentityPatch', () => {
  it('writes every field when nothing is edited', () => {
    const patch = gateIdentityPatch(PLAN, [])
    expect(Object.keys(patch).sort()).toEqual([...GATED_IDENTITY_FIELDS].sort())
    expect(patch.tagline).toBe('Come as you are')
  })

  it('omits an edited field so the operator value is preserved', () => {
    const patch = gateIdentityPatch(PLAN, ['tagline'])
    expect('tagline' in patch).toBe(false)
    expect(patch.name).toBe('Still Point')
  })
})

describe('nextAppliedIdentity', () => {
  it('records the plan value for un-edited fields and the live value for edited ones', () => {
    const live: IdentityValues = { ...PLAN, tagline: 'Operator wording' }
    const snap = nextAppliedIdentity(PLAN, live, ['tagline'])
    expect(snap.tagline).toBe('Operator wording') // keep diffing against what is actually live
    expect(snap.name).toBe('Still Point') // refreshed to the plan value
  })

  it('normalizes a missing value to null', () => {
    const snap = nextAppliedIdentity({ name: 'A' }, {}, [])
    expect(snap.tagline).toBeNull()
    expect(snap.name).toBe('A')
  })
})

describe('end-to-end diff → gate → next-snapshot', () => {
  it('a second re-apply keeps preserving the operator edit', () => {
    // First seed wrote the plan values.
    let marker: SeedEditWinsMarker = { editedFields: [], appliedIdentity: nextAppliedIdentity(PLAN, PLAN, []) }
    // Operator edits the tagline on the live Space.
    const liveAfterEdit: IdentityValues = { ...PLAN, tagline: 'Hand-tuned line' }
    // Re-apply #1: detect + gate.
    let edited = detectEditedFields(marker, liveAfterEdit)
    expect(edited).toEqual(['tagline'])
    let patch = gateIdentityPatch(PLAN, edited)
    expect('tagline' in patch).toBe(false)
    marker = { editedFields: edited, appliedIdentity: nextAppliedIdentity(PLAN, liveAfterEdit, edited) }
    // The live Space still has the operator tagline; everything else is the plan value.
    // Re-apply #2 with the SAME plan: tagline stays preserved, nothing new edited.
    edited = detectEditedFields(marker, liveAfterEdit)
    expect(edited).toEqual(['tagline'])
    patch = gateIdentityPatch(PLAN, edited)
    expect('tagline' in patch).toBe(false)
    expect(patch.name).toBe('Still Point')
  })
})
