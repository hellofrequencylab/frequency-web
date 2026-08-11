import { describe, it, expect } from 'vitest'

// The kernel's own contract, tested WITHOUT any real entity: a throwaway manifest proves the
// machinery is entity-agnostic. If one of these breaks, it breaks for every wizard at once,
// which is exactly the property the split was for.
//
// The business-specific behaviour is covered where it belongs, against the real manifest:
// app/(main)/admin/business-seeder/review-model.test.ts (which this extraction left untouched).

import { buildFieldModel, inlineFields, railFields, sparkFields } from './review-kernel'
import type { EntityManifest } from './manifest'
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
