import { describe, it, expect } from 'vitest'
import type { EntityManifest, FieldDef } from './manifest'
import { editPlan, railForm } from './edit-plan'

// ─────────────────────────────────────────────────────────────────────────────
// THE EDIT PLAN (ADR-1240): the rail's fields come from placement, never from a list of their own.
//
// A toy manifest with one field on each plane plus the two awkward cases the real catalog has: a
// spark field that is ALSO prose (on the inline plane, ADR-450) and a spark field that is not (on
// no edit plane at all).
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS: FieldDef[] = [
  { path: 'name', label: 'Name', kind: 'text', section: 'a', placement: 'spark', required: true },
  { path: 'why', label: 'Why', kind: 'longtext', section: 'a', placement: 'spark', prose: true },
  { path: 'blurb', label: 'Blurb', kind: 'longtext', section: 'a', placement: 'inline', prose: true },
  { path: 'nickname', label: 'Nickname', kind: 'text', section: 'b' },
  { path: 'phone', label: 'Phone', kind: 'phone', section: 'b', placement: 'rail' },
]

const TOY: EntityManifest = {
  entity: 'toy',
  label: 'Toy',
  verify: 'none',
  sections: [
    { key: 'a', title: 'A', desc: 'Content.' },
    { key: 'b', title: 'B', desc: 'Configuration.' },
  ],
  fields: FIELDS,
}

/** The same manifest with one field's placement changed, and nothing else. */
function placed(path: string, placement: FieldDef['placement']): EntityManifest {
  return { ...TOY, fields: TOY.fields.map((f) => (f.path === path ? { ...f, placement } : f)) }
}

describe('editPlan', () => {
  it('splits the manifest into its two edit planes, in manifest order, rail by default', () => {
    const plan = editPlan(TOY)
    expect(plan.inline.map((f) => f.path)).toEqual(['why', 'blurb'])
    expect(plan.rail.map((f) => f.path)).toEqual(['nickname', 'phone'])
  })
})

describe('railForm', () => {
  it('renders the written columns that sit on the rail plane, in MANIFEST order not the write order', () => {
    const form = railForm(TOY, ['phone', 'nickname'])
    expect(form.fields.map((f) => f.path)).toEqual(['nickname', 'phone'])
    expect(form.dropped).toEqual([])
  })

  it('takes label, kind, and required from the manifest, so the form carries nothing of its own', () => {
    const [nickname] = railForm(TOY, ['nickname']).fields
    expect(nickname).toMatchObject({ label: 'Nickname', kind: 'text' })
    expect(nickname.required).toBeUndefined()
  })

  it('drops a column the manifest does not declare, and says so', () => {
    expect(railForm(TOY, ['nickname', 'colour']).dropped).toEqual([{ path: 'colour', reason: 'unknown' }])
  })

  it('drops an inline field unless the rail is hosting the inline plane', () => {
    expect(railForm(TOY, ['blurb']).dropped).toEqual([{ path: 'blurb', reason: 'inline' }])
    const hosted = railForm(TOY, ['blurb', 'why'], { hostInline: true })
    expect(hosted.fields.map((f) => f.path)).toEqual(['why', 'blurb'])
    expect(hosted.dropped).toEqual([])
  })

  it('drops a spark-only field: asked at creation, on no edit plane', () => {
    expect(railForm(TOY, ['name'], { hostInline: true }).dropped).toEqual([{ path: 'name', reason: 'spark-only' }])
  })

  it('ignores columns the form does not write, however they are placed', () => {
    expect(railForm(TOY, ['phone']).fields.map((f) => f.path)).toEqual(['phone'])
  })

  // THE DRIFT TEST. The whole point of the seam: a placement changed on the manifest changes what the
  // rail renders, with no edit anywhere else. Both directions, so neither can be a coincidence of order.
  it('moves a field off the rail when its placement leaves the rail plane', () => {
    const before = railForm(TOY, ['nickname', 'phone']).fields.map((f) => f.path)
    const after = railForm(placed('phone', 'inline'), ['nickname', 'phone'])
    expect(before).toEqual(['nickname', 'phone'])
    expect(after.fields.map((f) => f.path)).toEqual(['nickname'])
    expect(after.dropped).toEqual([{ path: 'phone', reason: 'inline' }])
  })

  it('moves a field onto the rail when its placement arrives there', () => {
    expect(railForm(TOY, ['blurb']).fields).toEqual([])
    expect(railForm(placed('blurb', 'rail'), ['blurb']).fields.map((f) => f.path)).toEqual(['blurb'])
  })
})
