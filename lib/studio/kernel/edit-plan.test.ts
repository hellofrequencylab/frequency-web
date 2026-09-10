import { describe, it, expect } from 'vitest'
import { repeatLabel, validateManifest, type EntityManifest, type FieldDef, type RepeatDef } from './manifest'
import { editPlan, railForm, railRepeats } from './edit-plan'

// ─────────────────────────────────────────────────────────────────────────────
// THE EDIT PLAN (ADR-1240): the rail's fields come from placement, never from a list of their own.
//
// A toy manifest with one field on each plane plus the two awkward cases the real catalog has: a
// spark field that is ALSO prose (on the inline plane, ADR-450) and a spark field that is not (on
// no edit plane at all until it declares one, ADR-1281).
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

  it('carries no repeat group for a manifest that declares none', () => {
    expect(railForm(TOY, ['nickname']).repeats).toEqual([])
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


// ── The ruling ADR-1240 deferred (ADR-1281): where a NON-PROSE spark field is edited later ──────
//
// `name` above is asked at creation and is not prose, so nothing derives a later plane for it and
// `railForm` drops it as `spark-only`. The manifest says where it goes, with `editPlane`, and the
// selectors honour that one word. Prose keeps deriving its plane; everything else keeps its
// placement; and the validator refuses the declaration anywhere it would restate a derived fact.

/** The same manifest with one field's `editPlane` set, and nothing else. */
function editedOn(path: string, editPlane: FieldDef['editPlane']): EntityManifest {
  return { ...TOY, fields: TOY.fields.map((f) => (f.path === path ? { ...f, editPlane } : f)) }
}

describe('editPlane (ADR-1281)', () => {
  it('puts a non-prose spark field on the rail when it says so, in manifest order, and the drop is gone', () => {
    const m = editedOn('name', 'rail')
    expect(editPlan(m).rail.map((f) => f.path)).toEqual(['name', 'nickname', 'phone'])
    expect(editPlan(m).inline.map((f) => f.path)).toEqual(['why', 'blurb'])
    const form = railForm(m, ['name', 'nickname'])
    expect(form.fields.map((f) => f.path)).toEqual(['name', 'nickname'])
    expect(form.dropped).toEqual([])
  })

  it('puts a non-prose spark field on the inline canvas when it says so, so a rail only hosts it', () => {
    const m = editedOn('name', 'inline')
    expect(editPlan(m).inline.map((f) => f.path)).toEqual(['name', 'why', 'blurb'])
    expect(editPlan(m).rail.map((f) => f.path)).toEqual(['nickname', 'phone'])
    expect(railForm(m, ['name']).dropped).toEqual([{ path: 'name', reason: 'inline' }])
    expect(railForm(m, ['name'], { hostInline: true }).fields.map((f) => f.path)).toEqual(['name'])
  })

  it('leaves a non-prose spark field on no edit plane when it declares none (the spark-only case stands)', () => {
    expect(railForm(TOY, ['name'], { hostInline: true }).dropped).toEqual([{ path: 'name', reason: 'spark-only' }])
    expect(editPlan(TOY).rail.map((f) => f.path)).toEqual(['nickname', 'phone'])
  })

  it('is still asked in the Spark: a later plane never removes a field from creation', () => {
    const m = editedOn('name', 'rail')
    const name = m.fields.find((f) => f.path === 'name')
    expect(name?.placement).toBe('spark')
    expect(validateManifest(m)).toEqual([])
  })

  it('is refused where the plane is already derived: a rail field, an inline field, and prose', () => {
    expect(validateManifest(editedOn('nickname', 'rail'))).toEqual([
      expect.stringContaining('"nickname" declares `editPlane` without `placement: \'spark\''),
    ])
    expect(validateManifest(editedOn('blurb', 'rail'))).toEqual([
      expect.stringContaining('"blurb" declares `editPlane` without `placement: \'spark\''),
    ])
    expect(validateManifest(editedOn('why', 'rail'))).toEqual([expect.stringContaining('"why" is prose and declares `editPlane`')])
  })

  it('is refused with a value that is not one of the two edit planes', () => {
    const m = editedOn('name', 'spark' as unknown as FieldDef['editPlane'])
    expect(validateManifest(m)).toEqual([expect.stringContaining('"name" declares `editPlane: "spark"`')])
  })
})


// ── The repeat groups a rail form renders (ADR-1309) ────────────────────────────────────────────
//
// A repeat is a TABLE OF ROWS, not a column, so `railForm` walked `manifest.fields` and nothing
// else: every repeated collection an entity declared (an Event's ticket tiers, its set times, its
// links) was reviewable on the board and editable NOWHERE. `railRepeats` is the same seam for a
// collection — the save path names it, the manifest says what a row contains.

const REPEATS: RepeatDef[] = [
  {
    arrayPath: 'slots',
    section: 'a',
    itemLabel: (item, index) => String(item.title ?? '') || `Slot ${index + 1}`,
    fields: [
      { path: 'time', label: 'time', kind: 'text' },
      { path: 'title', label: 'what happens', kind: 'text' },
    ],
  },
  {
    arrayPath: 'notes',
    section: 'b',
    itemLabel: (_item, index) => `Note ${index + 1}`,
    fields: [{ path: 'body', label: 'note', kind: 'text' }],
  },
  {
    // A KEYED collection: one entry per id, no order to drag and no row to add.
    arrayPath: 'byPillar',
    over: 'map',
    section: 'b',
    itemLabel: (_item, _index, key) => key,
    fields: [{ path: 'howTo', label: 'how to', kind: 'text' }],
  },
]

const WITH_REPEATS: EntityManifest = { ...TOY, repeats: REPEATS }

describe('railRepeats', () => {
  it('returns the groups the save path persists, in manifest order, and nothing else', () => {
    expect(railRepeats(WITH_REPEATS, ['notes', 'slots']).map((r) => r.arrayPath)).toEqual(['slots', 'notes'])
    expect(railRepeats(WITH_REPEATS, ['nickname']).map((r) => r.arrayPath)).toEqual([])
    expect(railRepeats(TOY, ['slots'])).toEqual([])
  })

  it('hands back the manifest object itself, so the group carries its own fields and itemLabel', () => {
    const [slots] = railRepeats(WITH_REPEATS, ['slots'])
    expect(slots).toBe(REPEATS[0])
    expect(slots.fields.map((f) => f.path)).toEqual(['time', 'title'])
  })

  it('leaves a KEYED collection out: an ordered list editor is the wrong control, not a partial one', () => {
    expect(railRepeats(WITH_REPEATS, ['byPillar'])).toEqual([])
  })
})

describe('railForm with repeats', () => {
  it('carries the written groups beside the fields, keeping each plane separate', () => {
    const form = railForm(WITH_REPEATS, ['nickname', 'slots'])
    expect(form.fields.map((f) => f.path)).toEqual(['nickname'])
    expect(form.repeats.map((r) => r.arrayPath)).toEqual(['slots'])
    expect(form.dropped).toEqual([])
  })

  it('says so rather than silently omitting a written KEYED collection', () => {
    expect(railForm(WITH_REPEATS, ['byPillar']).dropped).toEqual([{ path: 'byPillar', reason: 'keyed-repeat' }])
    expect(railForm(WITH_REPEATS, ['byPillar']).repeats).toEqual([])
  })

  it('still calls a path the manifest declares nowhere unknown, repeats or not', () => {
    expect(railForm(WITH_REPEATS, ['colour']).dropped).toEqual([{ path: 'colour', reason: 'unknown' }])
  })
})

describe('repeatLabel', () => {
  it('prefers what the manifest calls the collection', () => {
    expect(repeatLabel({ ...REPEATS[0], label: 'Schedule' })).toBe('Schedule')
  })

  it('reads the last path segment as words when the manifest names none', () => {
    expect(repeatLabel(REPEATS[0])).toBe('Slots')
    expect(repeatLabel({ ...REPEATS[0], arrayPath: 'details.focusDetails' })).toBe('Focus details')
    expect(repeatLabel({ ...REPEATS[0], arrayPath: 'profileData.socials' })).toBe('Socials')
    expect(repeatLabel({ ...REPEATS[0], arrayPath: 'focus_details' })).toBe('Focus details')
  })
})
