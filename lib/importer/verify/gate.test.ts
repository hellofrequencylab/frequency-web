import { describe, it, expect } from 'vitest'

// ── THE verification gate (docs/BUSINESS-IMPORTER.md §4). This is the trust spine of the
// whole importer, so the invariants are pinned exhaustively with zero IO:
//   • a fact with NO supporting snippet is never verified;
//   • a commercial fact without a cited+verified ledger entry is WITHHELD from the draft;
//   • the ledger kinds move correctly under each refuter verdict;
//   • a contradicted field is flagged red and blocks apply.

import {
  applyVerdict,
  applyVerdicts,
  commercialPathsInLedger,
  enumerateCommercialFieldPaths,
  fieldStatus,
  isCommercialPath,
  splitVerified,
  stripFieldPath,
  type FieldVerdict,
} from './gate'
import type { BusinessProfile, LedgerEntry, ProvenanceLedger } from '../schema'

const cited = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  kind: 'fact',
  confidence: 0.7,
  sourceUrl: 'https://acme.test/contact',
  snippet: '123 Main St',
  ...over,
})

describe('isCommercialPath', () => {
  it('recognizes the canonical commercial fields', () => {
    expect(isCommercialPath('contact.address')).toBe(true)
    expect(isCommercialPath('contact.phone')).toBe(true)
    expect(isCommercialPath('contact.email')).toBe(true)
    expect(isCommercialPath('contact.hours')).toBe(true)
    expect(isCommercialPath('rating')).toBe(true)
  })

  it('recognizes a concrete offering-price index against the wildcard canon', () => {
    expect(isCommercialPath('offerings[0].price')).toBe(true)
    expect(isCommercialPath('offerings[3].price')).toBe(true)
  })

  it('leaves non-commercial fields alone', () => {
    expect(isCommercialPath('about')).toBe(false)
    expect(isCommercialPath('tagline')).toBe(false)
    expect(isCommercialPath('offerings[0].title')).toBe(false)
    expect(isCommercialPath('contact.website')).toBe(false)
  })
})

describe('applyVerdict — the ledger reducer (docs §4.2)', () => {
  it('supported + a prior citation -> verified fact, confidence raised', () => {
    const out = applyVerdict(cited({ confidence: 0.6 }), {
      path: 'contact.address',
      verdict: 'supported',
      confidence: 0.9,
    })
    expect(out.kind).toBe('fact')
    expect(out.verifiedBy).toBe('auto')
    expect(out.confidence).toBe(0.9)
  })

  it('supported WITHOUT any citation cannot manufacture a fact', () => {
    // A field the model called supported but that carries no snippet + no sourceUrl.
    const out = applyVerdict({ kind: 'inferred', confidence: 0.5 }, {
      path: 'contact.phone',
      verdict: 'supported',
      confidence: 0.9,
    })
    expect(out.kind).not.toBe('fact')
    expect(out.verifiedBy).toBeUndefined()
  })

  it('unsupported -> never a fact, confidence capped, verification stripped', () => {
    const out = applyVerdict(cited({ verifiedBy: 'auto' }), {
      path: 'contact.address',
      verdict: 'unsupported',
      confidence: 0.9,
    })
    expect(out.kind).toBe('inferred')
    expect(out.verifiedBy).toBeUndefined()
    expect(out.confidence).toBeLessThanOrEqual(0.4)
  })

  it('contradicted -> confidence floored, verification stripped (the split flags it red)', () => {
    const out = applyVerdict(cited({ verifiedBy: 'auto', confidence: 0.9 }), {
      path: 'contact.address',
      verdict: 'contradicted',
    })
    expect(out.verifiedBy).toBeUndefined()
    expect(out.confidence).toBeLessThanOrEqual(0.1)
  })

  it('is total: a verdict for a field with no prior entry yields a fresh entry', () => {
    const out = applyVerdict(undefined, { path: 'rating', verdict: 'unsupported' })
    expect(out.kind).toBe('inferred')
    expect(out.verifiedBy).toBeUndefined()
  })

  it('carries the refuter snippet in when the extractor had none', () => {
    const out = applyVerdict({ kind: 'inferred', confidence: 0.4 }, {
      path: 'contact.hours',
      verdict: 'supported',
      snippet: 'Open 9 to 5',
      sourceUrl: 'https://acme.test',
      confidence: 0.8,
    })
    // Now it has a citation, so supported promotes it.
    expect(out.snippet).toBe('Open 9 to 5')
    expect(out.kind).toBe('fact')
    expect(out.verifiedBy).toBe('auto')
  })
})

describe('applyVerdicts — never mutates the input ledger', () => {
  it('returns a new ledger and leaves the original untouched', () => {
    const ledger: ProvenanceLedger = { 'contact.phone': [cited({ snippet: '555-1212' })] }
    const verdicts: FieldVerdict[] = [{ path: 'contact.phone', verdict: 'unsupported' }]
    const next = applyVerdicts(ledger, verdicts)
    expect(ledger['contact.phone'][0].kind).toBe('fact') // original intact
    expect(next['contact.phone'][0].kind).toBe('inferred') // reduced copy
    expect(next).not.toBe(ledger)
  })
})

describe('fieldStatus (docs §4.5)', () => {
  it('green only for a verified, confident commercial fact', () => {
    expect(fieldStatus('contact.address', cited({ verifiedBy: 'auto', confidence: 0.8 }))).toBe('green')
  })
  it('amber for an unverified commercial fact', () => {
    expect(fieldStatus('contact.address', cited({ verifiedBy: undefined }))).toBe('amber')
  })
  it('amber for a verified-but-low-confidence commercial fact', () => {
    expect(fieldStatus('contact.address', cited({ verifiedBy: 'auto', confidence: 0.5 }))).toBe('amber')
  })
  it('red for a floored (contradicted) fact', () => {
    expect(fieldStatus('contact.phone', cited({ confidence: 0.05 }))).toBe('red')
  })
  it('green for a verified non-commercial fact', () => {
    expect(fieldStatus('about', { kind: 'fact', verifiedBy: 'auto', confidence: 0.8, snippet: 'x' })).toBe('green')
  })
})

describe('enumerateCommercialFieldPaths', () => {
  it('lists exactly the populated commercial fields, expanding offerings per index', () => {
    const draft: BusinessProfile = {
      name: 'Acme',
      type: 'business',
      contact: { address: '123 Main', phone: '555', email: '', hours: '9-5' },
      rating: { value: '4.8' },
      offerings: [{ title: 'A', price: 20 }, { title: 'B' }, { title: 'C', price: 40 }],
    }
    expect(enumerateCommercialFieldPaths(draft).sort()).toEqual(
      ['contact.address', 'contact.hours', 'contact.phone', 'offerings[0].price', 'offerings[2].price', 'rating'].sort(),
    )
  })
})

describe('splitVerified — THE gate (docs §4.3 / §4.4)', () => {
  const draft = (): BusinessProfile => ({
    name: 'Acme Coffee',
    type: 'business',
    about: 'A neighborhood cafe.',
    contact: { address: '123 Main St', phone: '555-1212', hours: 'Open 9 to 5' },
    rating: { value: '4.8', count: '120' },
    offerings: [{ title: 'Latte', price: 5 }],
  })

  it('WITHHOLDS every commercial fact that is not a verified fact', () => {
    // No ledger at all -> nothing is cleared -> every commercial fact stripped.
    const { verifiedDraft, commercialPolicy } = splitVerified(draft(), {})
    expect(verifiedDraft.contact?.address).toBeUndefined()
    expect(verifiedDraft.contact?.phone).toBeUndefined()
    expect(verifiedDraft.contact?.hours).toBeUndefined()
    expect(verifiedDraft.rating).toBeUndefined()
    expect(verifiedDraft.offerings?.[0].price).toBeUndefined()
    // Non-commercial copy survives.
    expect(verifiedDraft.about).toBe('A neighborhood cafe.')
    expect(verifiedDraft.offerings?.[0].title).toBe('Latte')
    expect(commercialPolicy).toBe('withhold')
  })

  it('KEEPS a commercial fact once it is a verified, cited fact', () => {
    const ledger: ProvenanceLedger = {
      'contact.address': [cited({ verifiedBy: 'auto', confidence: 0.9, snippet: '123 Main St' })],
    }
    const { verifiedDraft, commercialPolicy } = splitVerified(draft(), ledger)
    expect(verifiedDraft.contact?.address).toBe('123 Main St')
    // The others (no ledger) are still withheld, so the policy is still withhold.
    expect(verifiedDraft.contact?.phone).toBeUndefined()
    expect(commercialPolicy).toBe('withhold')
  })

  it('clears the policy to allow ONLY when every populated commercial fact is verified', () => {
    const ledger: ProvenanceLedger = {
      'contact.address': [cited({ verifiedBy: 'auto', confidence: 0.9 })],
      'contact.phone': [cited({ verifiedBy: 'auto', confidence: 0.9, snippet: '555-1212' })],
      'contact.hours': [cited({ verifiedBy: 'auto', confidence: 0.9, snippet: 'Open 9 to 5' })],
      rating: [cited({ verifiedBy: 'auto', confidence: 0.9, snippet: '4.8' })],
      'offerings[0].price': [cited({ verifiedBy: 'auto', confidence: 0.9, snippet: '5' })],
    }
    const { verifiedDraft, commercialPolicy } = splitVerified(draft(), ledger)
    expect(commercialPolicy).toBe('allow')
    expect(verifiedDraft.contact?.address).toBe('123 Main St')
    expect(verifiedDraft.offerings?.[0].price).toBe(5)
  })

  it('flags a CONTRADICTED commercial fact red, withholds it, and blocks apply for it', () => {
    const ledger: ProvenanceLedger = {
      'contact.address': [cited({ verifiedBy: undefined, confidence: 0.05 })], // contradicted (floored)
    }
    const { verifiedDraft, flags, blocked } = splitVerified(draft(), ledger)
    expect(verifiedDraft.contact?.address).toBeUndefined() // stripped
    expect(blocked).toContain('contact.address')
    const flag = flags.find((f) => f.path === 'contact.address')
    expect(flag?.status).toBe('red')
  })

  it('does not mutate the input draft', () => {
    const d = draft()
    splitVerified(d, {})
    expect(d.contact?.address).toBe('123 Main St') // input untouched
  })
})

describe('stripFieldPath', () => {
  it('removes exactly the addressed commercial value', () => {
    const d: BusinessProfile = {
      name: 'X',
      type: 'business',
      contact: { address: 'a', phone: 'p' },
      offerings: [{ title: 'o', price: 9 }],
    }
    stripFieldPath(d, 'contact.address')
    stripFieldPath(d, 'offerings[0].price')
    expect(d.contact?.address).toBeUndefined()
    expect(d.contact?.phone).toBe('p') // sibling intact
    expect(d.offerings?.[0].price).toBeUndefined()
    expect(d.offerings?.[0].title).toBe('o')
  })
})

describe('commercialPathsInLedger', () => {
  it('selects only the commercial ledger keys', () => {
    const ledger: ProvenanceLedger = {
      'contact.phone': [cited()],
      about: [{ kind: 'generated', confidence: 0.5 }],
      'offerings[0].price': [cited()],
      'offerings[0].title': [cited()],
    }
    expect(commercialPathsInLedger(ledger).sort()).toEqual(['contact.phone', 'offerings[0].price'])
  })
})
