import { describe, it, expect } from 'vitest'

// The kernel's own contract, tested WITHOUT any real entity: a throwaway manifest proves the
// machinery is entity-agnostic. If one of these breaks, it breaks for every wizard at once,
// which is exactly the property the split was for.
//
// The business-specific behaviour is covered where it belongs, against the real manifest:
// app/(main)/admin/business-seeder/review-model.test.ts (which this extraction left untouched).

import { buildFieldModel, inlineFields, railFields, sparkFields } from './review-kernel'
import { REPEAT_ITEM_SELF, type EntityManifest } from './manifest'
import type { ProvenanceLedger } from './ledger'

const TOY: EntityManifest = {
  entity: 'toy',
  label: 'Toy',
  verify: 'citation',
  sections: [
    { key: 'identity', title: 'Identity', desc: 'What it is.' },
    { key: 'money', title: 'Money', desc: 'What it costs.' },
    { key: 'empty', title: 'Empty', desc: 'Nothing declares into this one.' },
  ],
  fields: [
    { path: 'name', label: 'Name', kind: 'text', section: 'identity', placement: 'spark', required: true },
    { path: 'nickname', label: 'Nickname', kind: 'text', section: 'identity', omitWhenEmpty: true },
    { path: 'blurb', label: 'Blurb', kind: 'longtext', section: 'identity', placement: 'inline', prose: true },
    { path: 'shop.phone', label: 'Phone', kind: 'phone', section: 'money', commercial: true },
  ],
  repeats: [
    {
      arrayPath: 'items',
      section: 'money',
      itemLabel: (item, i) => String(item.title ?? '') || `Item ${i + 1}`,
      fields: [
        { path: 'title', label: 'title', kind: 'text' },
        { path: 'price', label: 'price', kind: 'price', commercial: true },
      ],
    },
  ],
}

const draft = {
  name: 'Widget',
  blurb: 'A thing that works.',
  shop: { phone: '(555) 010-0000' },
  items: [{ title: 'Small', price: 10 }, { price: 20 }],
}

describe('buildFieldModel — structure', () => {
  it('emits declared fields in order and drops sections nothing declares into', () => {
    const model = buildFieldModel(TOY, draft)
    expect(model.sections.map((s) => s.key)).toEqual(['identity', 'money'])
  })

  it('omits an omitWhenEmpty field that reads empty, and keeps the rest visible', () => {
    const paths = buildFieldModel(TOY, draft).sections.flatMap((s) => s.fields.map((f) => f.path))
    expect(paths).not.toContain('nickname') // omitWhenEmpty + no value
    expect(paths).toContain('name')
  })

  it('expands a repeat into indexed ledger paths, one row set per item', () => {
    const paths = buildFieldModel(TOY, draft).sections.flatMap((s) => s.fields.map((f) => f.path))
    expect(paths).toContain('items[0].price')
    expect(paths).toContain('items[1].price')
  })

  it('labels repeat rows with the item name, falling back to a positional label', () => {
    const fields = buildFieldModel(TOY, draft).sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.path === 'items[0].price')?.label).toBe('Small · price')
    expect(fields.find((f) => f.path === 'items[1].price')?.label).toBe('Item 2 · price')
  })

  it('reads a nested dotted path off the draft', () => {
    const fields = buildFieldModel(TOY, draft).sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.path === 'shop.phone')?.value).toBe('(555) 010-0000')
  })

  it('survives a draft missing every declared path', () => {
    const model = buildFieldModel(TOY, {})
    expect(model.summary.blocked).toBe(false)
    expect(model.sections.flatMap((s) => s.fields).every((f) => f.value === '')).toBe(true)
  })
})

describe('buildFieldModel — the gate', () => {
  it('withholds an unverified commercial fact and clears a verified one', () => {
    const ledger: ProvenanceLedger = {
      'shop.phone': [{ kind: 'inferred', confidence: 0.4 }],
      'items[0].price': [{ kind: 'fact', confidence: 0.9, verifiedBy: 'auto', sourceUrl: 'https://toy.test' }],
    }
    const fields = buildFieldModel(TOY, draft, ledger).sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.path === 'shop.phone')?.withheld).toBe(true)
    expect(fields.find((f) => f.path === 'items[0].price')?.withheld).toBe(false)
    expect(fields.find((f) => f.path === 'items[0].price')?.signal).toBe('green')
  })

  it('blocks the apply on a contradicted commercial fact', () => {
    const model = buildFieldModel(TOY, draft, { 'shop.phone': [{ kind: 'inferred', confidence: 0 }] })
    const phone = model.sections.flatMap((s) => s.fields).find((f) => f.path === 'shop.phone')!
    expect(phone.signal).toBe('red')
    expect(phone.blocksApply).toBe(true)
    expect(model.summary.blocked).toBe(true)
  })

  it('trusts hand-supplied prose (no ledger entry) but holds generated prose', () => {
    const clean = buildFieldModel(TOY, draft).sections.flatMap((s) => s.fields).find((f) => f.path === 'blurb')!
    expect(clean.withheld).toBe(false)
    expect(clean.generated).toBe(false)

    const drafted = buildFieldModel(TOY, draft, { blurb: [{ kind: 'generated', confidence: 0.8 }] })
      .sections.flatMap((s) => s.fields)
      .find((f) => f.path === 'blurb')!
    expect(drafted.withheld).toBe(true)
    expect(drafted.generated).toBe(true)
  })

  it('never withholds an EMPTY gated field (there is nothing to hold back)', () => {
    const model = buildFieldModel(TOY, { name: 'Widget' }, { 'shop.phone': [{ kind: 'inferred', confidence: 0.1 }] })
    expect(model.sections.flatMap((s) => s.fields).find((f) => f.path === 'shop.phone')?.withheld).toBe(false)
  })

  it('counts the roll-up over every emitted row, repeats included', () => {
    const model = buildFieldModel(TOY, draft)
    const rows = model.sections.flatMap((s) => s.fields).length
    expect(model.summary.total).toBe(rows)
    expect(model.summary.green + model.summary.amber + model.summary.red).toBe(rows)
  })
})

describe('placement filters — one list serves create and edit (ADR-450 §2)', () => {
  it('asks the Spark for spark-placed fields plus anything required', () => {
    expect(sparkFields(TOY).map((f) => f.path)).toEqual(['name'])
  })

  it('splits the editor into the inline canvas and the rail, with rail as the default', () => {
    expect(inlineFields(TOY).map((f) => f.path)).toEqual(['blurb'])
    expect(railFields(TOY).map((f) => f.path)).toEqual(['nickname', 'shop.phone'])
  })

  it('covers every declared field exactly once across the three planes', () => {
    const seen = [...sparkFields(TOY), ...inlineFields(TOY), ...railFields(TOY)].map((f) => f.path)
    expect(new Set(seen).size).toBe(TOY.fields.length)
  })
})

// ── The two repeat shapes the first nine manifests could not express (ADR-992) ───────────────
//
// PATH FIDELITY is the property under test throughout: the string a row carries has to be the
// REAL location of the value on the draft, because that same string is the ledger key the server
// re-checks before anything publishes. A row key that is merely stable would mis-key the day the
// entity grows a ledger, silently, in the direction of publishing an unverified fact.

const SHAPES: EntityManifest = {
  entity: 'shapes',
  label: 'Shapes',
  verify: 'citation',
  sections: [
    { key: 'map', title: 'Keyed', desc: 'One entry per key.' },
    { key: 'scalars', title: 'Scalars', desc: 'A bare list.' },
  ],
  fields: [],
  repeats: [
    {
      arrayPath: 'perPillar',
      over: 'map',
      section: 'map',
      itemLabel: (_item, index, key) => `${key} (#${index + 1})`,
      fields: [
        { path: 'instructions', label: 'instructions', kind: 'longtext', prose: true },
        { path: 'fee', label: 'fee', kind: 'price', commercial: true },
      ],
    },
    {
      arrayPath: 'agreements',
      section: 'scalars',
      itemLabel: (_item, index) => `Agreement ${index + 1}`,
      fields: [{ path: REPEAT_ITEM_SELF, label: 'wording', kind: 'text' }],
    },
  ],
}

const shapesDraft = {
  perPillar: {
    spirit: { instructions: 'Sit first.', fee: 20 },
    body: { instructions: 'Walk it.', fee: 10 },
  },
  agreements: ['We start on time.', 'What is said here stays here.'],
}

describe('a KEYED-MAP repeat', () => {
  it('expands one row set per key, at the real dotted path', () => {
    const paths = buildFieldModel(SHAPES, shapesDraft).sections.flatMap((s) => s.fields.map((f) => f.path))
    expect(paths).toContain('perPillar.body.instructions')
    expect(paths).toContain('perPillar.spirit.fee')
    // NOT the array convention: there is no index to speak of on a map.
    expect(paths.some((p) => p.includes('perPillar['))).toBe(false)
  })

  it('reads each entry off its own key', () => {
    const fields = buildFieldModel(SHAPES, shapesDraft).sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.path === 'perPillar.body.instructions')?.value).toBe('Walk it.')
    expect(fields.find((f) => f.path === 'perPillar.spirit.instructions')?.value).toBe('Sit first.')
  })

  it('orders keys deterministically, so the board renders the same rows twice', () => {
    const keyed = buildFieldModel(SHAPES, shapesDraft)
      .sections.flatMap((s) => s.fields)
      .filter((f) => f.path.startsWith('perPillar.'))
      .map((f) => f.path)
    // A map has no author order, so the kernel sorts. 'body' before 'spirit' whatever the draft did.
    expect(keyed[0]).toBe('perPillar.body.instructions')
    expect(buildFieldModel(SHAPES, { ...shapesDraft }).sections.flatMap((s) => s.fields.map((f) => f.path))).toEqual(
      buildFieldModel(SHAPES, shapesDraft).sections.flatMap((s) => s.fields.map((f) => f.path)),
    )
  })

  it('hands itemLabel the key, not just a position', () => {
    const fields = buildFieldModel(SHAPES, shapesDraft).sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.path === 'perPillar.body.fee')?.label).toBe('body (#1) · fee')
  })

  it('gates each entry independently, keyed by the path of that entry', () => {
    const ledger: ProvenanceLedger = {
      'perPillar.body.fee': [{ kind: 'fact', confidence: 0.9, verifiedBy: 'human' }],
      'perPillar.spirit.fee': [{ kind: 'inferred', confidence: 0.3 }],
    }
    const fields = buildFieldModel(SHAPES, shapesDraft, ledger).sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.path === 'perPillar.body.fee')?.withheld).toBe(false)
    expect(fields.find((f) => f.path === 'perPillar.spirit.fee')?.withheld).toBe(true)
  })

  it('reads an array, a null, or a scalar under a map repeat as no rows rather than throwing', () => {
    for (const perPillar of [[], ['x'], null, 'nope', 42]) {
      const model = buildFieldModel(SHAPES, { perPillar })
      expect(model.sections.flatMap((s) => s.fields).some((f) => f.path.startsWith('perPillar'))).toBe(false)
    }
  })
})

describe('a repeat of BARE SCALARS', () => {
  it('keys each row by the path of the item itself, with no invented sub-key', () => {
    const paths = buildFieldModel(SHAPES, shapesDraft).sections.flatMap((s) => s.fields.map((f) => f.path))
    expect(paths).toContain('agreements[0]')
    expect(paths).toContain('agreements[1]')
    expect(paths.some((p) => p.startsWith('agreements[') && p.includes('.'))).toBe(false)
  })

  it('reads the item ITSELF as the value', () => {
    const fields = buildFieldModel(SHAPES, shapesDraft).sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.path === 'agreements[0]')?.value).toBe('We start on time.')
    expect(fields.find((f) => f.path === 'agreements[1]')?.value).toBe('What is said here stays here.')
  })

  it('keys a ledger at that same path (the reason the shape exists)', () => {
    const fields = buildFieldModel(SHAPES, shapesDraft, {
      'agreements[0]': [{ kind: 'generated', confidence: 0.8 }],
    }).sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.path === 'agreements[0]')?.generated).toBe(true)
    expect(fields.find((f) => f.path === 'agreements[1]')?.generated).toBe(false)
  })
})

// ── The diff (ADR-994) ───────────────────────────────────────────────────────────────────────────
// A review board that cannot say what MOVED is only useful the first time. On a redraw the author's
// job changes from "is this right?" to "is this better?", which they can only answer if the change
// is visible without hunting for it.

describe('buildFieldModel — reviewing a redraw', () => {
  const before = { name: 'Widget', blurb: 'A thing that works.', shop: { phone: '(555) 010-0000' } }
  const after = { name: 'Widget', blurb: 'A thing that really works.', shop: { phone: '(555) 010-0000' } }

  it('marks only the field that moved, and carries its prior value', () => {
    const fields = buildFieldModel(TOY, after, {}, before).sections.flatMap((s) => s.fields)
    const blurb = fields.find((f) => f.path === 'blurb')!
    expect(blurb.changed).toBe(true)
    expect(blurb.previous).toBe('A thing that works.')

    const name = fields.find((f) => f.path === 'name')!
    expect(name.changed).toBe(false)
    expect(name.previous).toBe('Widget')
  })

  it('reports nothing as changed when no previous draft is supplied', () => {
    const fields = buildFieldModel(TOY, after).sections.flatMap((s) => s.fields)
    expect(fields.every((f) => f.changed === false)).toBe(true)
    // Absent means "nothing to compare", NOT "unchanged" — so `previous` must stay undefined
    // rather than defaulting to the current value, which would read as a confirmed no-op.
    expect(fields.every((f) => f.previous === undefined)).toBe(true)
  })

  it('treats a field that did not exist before as changed, not as unchanged', () => {
    const fields = buildFieldModel(TOY, { ...after, nickname: 'Widge' }, {}, before)
      .sections.flatMap((s) => s.fields)
    const nick = fields.find((f) => f.path === 'nickname')!
    expect(nick.changed).toBe(true)
    expect(nick.previous).toBe('')
  })

  it('pairs ARRAY repeat rows by index', () => {
    const prev = { ...before, items: [{ title: 'Small', price: 10 }] }
    const next = { ...after, items: [{ title: 'Small', price: 12 }] }
    const price = buildFieldModel(TOY, next, {}, prev).sections.flatMap((s) => s.fields)
      .find((f) => f.path === 'items[0].price')!
    expect(price.changed).toBe(true)
    expect(price.previous).toBe('10')
  })
})
