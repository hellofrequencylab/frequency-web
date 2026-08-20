import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Wiring guard: the seed list can DELETE an intake, but never a published one (LIVE-062) ──
// The Wave-1 seeder shipped list + review + publish with deleteListingIntake as an orphan.
// Source-level in the house archetype (components/events/series-wiring.test.ts) because both
// failure modes here are silent: unwiring the button just makes seeds immortal again, and
// widening the gate to 'applied' seeds quietly strands a live listing's images — publish
// reuses the staged listing-intake/<id>/ URLs, and the delete best-effort removes them.

const list = readFileSync('app/(main)/admin/listing-seeder/intake-list.tsx', 'utf8')
const button = readFileSync('app/(main)/admin/listing-seeder/delete-intake-button.tsx', 'utf8')
const actions = readFileSync('app/(main)/admin/listing-seeder/actions.ts', 'utf8')

describe('the seed card carries a delete affordance', () => {
  it('the list is non-trivial (guards a vacuous pass)', () => {
    expect(list.length).toBeGreaterThan(1000)
  })

  it('mounts DeleteIntakeButton in the EntityCard action slot', () => {
    expect(list).toContain("import { DeleteIntakeButton } from './delete-intake-button'")
    expect(list).toContain('<DeleteIntakeButton intakeId={it.id} />')
  })

  it("GATES the affordance off 'applied' seeds", () => {
    // deleteListingIntake deletes any row and best-effort removes the staged photos; a published
    // listing displays those exact URLs (lib/listing-seeder/publish.ts passes inputs.images
    // straight to the created listing), so an 'applied' seed must not offer the delete.
    expect(list).toContain("action={it.status !== 'applied' ? <DeleteIntakeButton")
  })
})

describe('the button expresses intent and nothing else', () => {
  it('confirms before calling the action', () => {
    const confirmAt = button.indexOf('window.confirm(')
    const callAt = button.indexOf('await deleteListingIntake(')
    expect(confirmAt).toBeGreaterThan(-1)
    expect(callAt).toBeGreaterThan(confirmAt)
  })

  it('imports the server action and surfaces its refusal', () => {
    expect(button).toContain("import { deleteListingIntake } from './actions'")
    expect(button).toContain('if (!res.ok) setErr(res.error)')
  })
})

describe('the gating premise holds in the action itself', () => {
  it('deleteListingIntake re-gates on structure/write and removes staged photos', () => {
    const body = actions.slice(actions.indexOf('export async function deleteListingIntake'))
    expect(body).toContain("requireStaffCap('structure', 'write')")
    expect(body).toContain('removeStoredImages(intakeId, images)')
  })

  it('publish still reuses the staged URLs (the reason the gate exists)', () => {
    // If publish ever starts COPYING photos onto the listing instead, this pins the moment the
    // UI gate can be revisited.
    const publish = readFileSync('lib/listing-seeder/publish.ts', 'utf8')
    expect(publish).toContain('inputs.images && inputs.images.length ? inputs.images : draft.images')
  })
})
