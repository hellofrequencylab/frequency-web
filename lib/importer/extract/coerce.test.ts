import { describe, it, expect } from 'vitest'

// The extraction coercer is the FIRST grounding gate (docs §4.1): a field the model labeled
// 'fact' whose cited snippet is NOT actually in the harvested sources is downgraded to 'inferred'
// (the model cannot launder a guess into a fact by claiming a citation that does not exist).

import {
  coerceExtraction,
  groundField,
  snippetIsGrounded,
  parsePrice,
  coerceKind,
  type RawExtraction,
} from './coerce'
import type { HarvestedSource } from '../intake'

const sources: HarvestedSource[] = [
  {
    id: 's1',
    kind: 'page',
    url: 'https://acme.test/contact',
    fetchedAt: 'now',
    title: 'Contact Acme',
    text: 'Acme Coffee is at 123 Main St, open 9 to 5. Call 555-1212.',
  },
]

describe('snippetIsGrounded', () => {
  it('matches a snippet present in a source (case/space-insensitive)', () => {
    expect(snippetIsGrounded('123 Main St', sources)).toBe(true)
    expect(snippetIsGrounded('123   MAIN st', sources)).toBe(true)
  })
  it('rejects a snippet absent from every source', () => {
    expect(snippetIsGrounded('999 Fake Blvd', sources)).toBe(false)
    expect(snippetIsGrounded('', sources)).toBe(false)
    expect(snippetIsGrounded(undefined, sources)).toBe(false)
  })
})

describe('groundField — the anti-laundering gate', () => {
  it('keeps a fact whose snippet IS grounded', () => {
    const e = groundField({ value: '123 Main St', snippet: '123 Main St', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.9 }, sources)
    expect(e.kind).toBe('fact')
    expect(e.confidence).toBe(0.9)
  })

  it('DOWNGRADES a fact whose snippet is NOT grounded, capping confidence', () => {
    const e = groundField({ value: '999 Fake Blvd', snippet: '999 Fake Blvd', kind: 'fact', confidence: 0.95 }, sources)
    expect(e.kind).toBe('inferred')
    expect(e.confidence).toBeLessThanOrEqual(0.4)
  })

  it('downgrades a fact that carries NO snippet and NO sourceUrl', () => {
    const e = groundField({ value: 'x', kind: 'fact', confidence: 0.9 }, sources)
    expect(e.kind).toBe('inferred')
  })

  // REGRESSION (finding #5): a matching sourceUrl is NOT sufficient grounding. A known page url does
  // not prove the specific claim appears on it, so a fact whose snippet is absent must be downgraded
  // even when the url matches a harvested source.
  it('does NOT clear a fact on a matching sourceUrl when the snippet is absent from the source', () => {
    const e = groundField(
      { value: 'Acme Coffee wins Best Cafe 2025', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.9 },
      sources,
    )
    expect(e.kind).toBe('inferred') // url match alone never clears
    expect(e.confidence).toBeLessThanOrEqual(0.4)
  })

  it('does NOT clear a fact whose snippet is not in the source even if the snippet field is set', () => {
    // snippet present but absent from any source, sourceUrl matches -> still downgraded.
    const e = groundField(
      { value: 'x', snippet: 'Best Cafe 2025 award', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.9 },
      sources,
    )
    expect(e.kind).toBe('inferred')
  })

  it('defaults an unlabeled field to generated (never a fact by omission)', () => {
    expect(coerceKind(undefined)).toBe('generated')
    expect(coerceKind('nonsense')).toBe('generated')
  })
})

describe('coerceExtraction — raw model shape to draft + ledger', () => {
  const raw: RawExtraction = {
    name: { value: 'Acme Coffee', snippet: 'Acme Coffee', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.9 },
    type: 'business',
    about: { value: 'A neighborhood cafe.', kind: 'generated', confidence: 0.6 },
    contact: {
      address: { value: '123 Main St', snippet: '123 Main St', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.9 },
      phone: { value: '999-0000', snippet: '999-0000', kind: 'fact', confidence: 0.9 }, // NOT in sources -> downgraded
      hours: { value: 'open 9 to 5', snippet: 'open 9 to 5', sourceUrl: 'https://acme.test/contact', kind: 'fact', confidence: 0.8 },
    },
    offerings: [
      { title: { value: 'Latte' }, price: { value: '$5', snippet: '5', kind: 'inferred', confidence: 0.5 } },
    ],
  }

  it('grounds the address (in sources) as a fact but downgrades the phantom phone', () => {
    const { draft, ledger } = coerceExtraction(raw, sources)
    expect(draft.name).toBe('Acme Coffee')
    expect(draft.contact?.address).toBe('123 Main St')
    expect(ledger['contact.address'][0].kind).toBe('fact')
    // The phone snippet '999-0000' is not in any source -> downgraded, never a fact.
    expect(ledger['contact.phone'][0].kind).toBe('inferred')
  })

  it('keys an offering price ledger entry per index and parses the price', () => {
    const { draft, ledger } = coerceExtraction(raw, sources)
    expect(draft.offerings?.[0].price).toBe(5)
    expect(ledger['offerings[0].price']).toBeDefined()
  })

  it('records about as generated (no fabricated citation)', () => {
    const { ledger } = coerceExtraction(raw, sources)
    expect(ledger.about[0].kind).toBe('generated')
  })

  it('falls back to the name hint when the model returns no name', () => {
    const { draft } = coerceExtraction({ type: 'business' }, sources, 'Hinted Co')
    expect(draft.name).toBe('Hinted Co')
    expect(draft.type).toBe('business')
  })

  it('folds an unknown type to business', () => {
    const { draft } = coerceExtraction({ name: { value: 'X' }, type: 'charity' } as unknown as RawExtraction, sources)
    expect(draft.type).toBe('business')
  })
})

describe('parsePrice', () => {
  it('parses common price strings to major units', () => {
    expect(parsePrice('$45')).toBe(45)
    expect(parsePrice('From 20')).toBe(20)
    expect(parsePrice('19.99')).toBe(19.99)
    expect(parsePrice('1,200')).toBe(1200)
  })
  it('returns null for a price-less string', () => {
    expect(parsePrice('call us')).toBeNull()
  })
})
