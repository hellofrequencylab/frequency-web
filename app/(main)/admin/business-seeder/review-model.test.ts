import { describe, it, expect } from 'vitest'

// The review model is the heart of the operator review board: it turns a draft + ledger into
// the field-by-field board, painting each field's confidence signal (✅/⚠️/🔴), marking AI copy,
// and flagging WITHHELD commercial facts. These assertions lock its gate to the SAME rules the
// materializer's Gate B enforces (docs §4.3), so the board can never promise a field will
// publish that Apply would withhold.

import { buildReviewModel } from './review-model'
import type { BusinessProfile, ProvenanceLedger } from '@/lib/importer/schema'

function fieldByPath(model: ReturnType<typeof buildReviewModel>, path: string) {
  return model.sections.flatMap((s) => s.fields).find((f) => f.path === path)
}

const baseDraft: BusinessProfile = {
  name: 'Acme Yoga',
  type: 'business',
  tagline: 'Breathe better here.',
  about: 'A neighborhood studio.',
  contact: { phone: '(555) 123-4567', address: '1 Main St', email: 'hi@acme.test', website: 'acme.test' },
  offerings: [{ title: 'Drop-in class', price: 25, currency: 'USD', priceModel: 'fixed' }],
  rating: { value: '4.8', count: '126' },
}

describe('buildReviewModel — confidence signals', () => {
  it('paints a verified fact GREEN', () => {
    const ledger: ProvenanceLedger = {
      'contact.phone': [{ kind: 'fact', confidence: 0.9, verifiedBy: 'auto', sourceUrl: 'https://acme.test', snippet: 'Call (555) 123-4567' }],
    }
    const model = buildReviewModel(baseDraft, ledger)
    const phone = fieldByPath(model, 'contact.phone')!
    expect(phone.signal).toBe('green')
    expect(phone.withheld).toBe(false)
    expect(phone.provenance?.sourceUrl).toBe('https://acme.test')
  })

  it('paints an unverified commercial fact AMBER and WITHHOLDS it', () => {
    const ledger: ProvenanceLedger = {
      'contact.phone': [{ kind: 'inferred', confidence: 0.4 }],
    }
    const model = buildReviewModel(baseDraft, ledger)
    const phone = fieldByPath(model, 'contact.phone')!
    expect(phone.signal).toBe('amber')
    expect(phone.withheld).toBe(true) // uncleared commercial fact -> withheld
    expect(phone.blocksApply).toBe(false)
  })

  it('paints a contradicted commercial fact RED and blocks Apply', () => {
    const ledger: ProvenanceLedger = {
      'contact.address': [{ kind: 'inferred', confidence: 0 }],
    }
    const model = buildReviewModel(baseDraft, ledger)
    const addr = fieldByPath(model, 'contact.address')!
    expect(addr.signal).toBe('red')
    expect(addr.blocksApply).toBe(true)
    expect(model.summary.blocked).toBe(true)
  })

  it('marks AI-generated prose and withholds it until verified', () => {
    const ledger: ProvenanceLedger = {
      tagline: [{ kind: 'generated', confidence: 0.7 }],
    }
    const model = buildReviewModel(baseDraft, ledger)
    const tagline = fieldByPath(model, 'tagline')!
    expect(tagline.generated).toBe(true)
    expect(tagline.withheld).toBe(true) // generated prose held until a verified fact
  })

  it('publishes hand-supplied prose that carries NO ledger entry', () => {
    const model = buildReviewModel(baseDraft, {})
    const about = fieldByPath(model, 'about')!
    expect(about.withheld).toBe(false) // no entry => hand-supplied => trusted
    expect(about.generated).toBe(false)
  })
})

describe('buildReviewModel — offerings gate', () => {
  it('withholds an offering price whose ledger entry is unverified', () => {
    const ledger: ProvenanceLedger = {
      'offerings[0].price': [{ kind: 'inferred', confidence: 0.3 }],
    }
    const model = buildReviewModel(baseDraft, ledger)
    const price = fieldByPath(model, 'offerings[0].price')!
    expect(price.commercial).toBe(true)
    expect(price.withheld).toBe(true)
  })

  it('clears an offering price backed by a verified fact', () => {
    const ledger: ProvenanceLedger = {
      'offerings[0].price': [{ kind: 'fact', confidence: 0.95, verifiedBy: 'auto', sourceUrl: 'https://acme.test/classes' }],
    }
    const model = buildReviewModel(baseDraft, ledger)
    const price = fieldByPath(model, 'offerings[0].price')!
    expect(price.signal).toBe('green')
    expect(price.withheld).toBe(false)
  })
})

describe('buildReviewModel — summary roll-up', () => {
  it('counts signals and withheld facts', () => {
    const ledger: ProvenanceLedger = {
      'contact.phone': [{ kind: 'fact', confidence: 0.9, verifiedBy: 'auto' }],
      'contact.address': [{ kind: 'inferred', confidence: 0.2 }],
      rating: [{ kind: 'inferred', confidence: 0 }],
    }
    const model = buildReviewModel(baseDraft, ledger)
    expect(model.summary.green).toBeGreaterThanOrEqual(1)
    expect(model.summary.red).toBeGreaterThanOrEqual(1) // rating contradicted
    expect(model.summary.withheld).toBeGreaterThanOrEqual(1) // address withheld
    expect(model.summary.blocked).toBe(true)
  })
})
