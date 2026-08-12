// The Event Seeder's pure layer (ADR-989): a read becomes a draft, the draft seeds a ledger,
// and one path reads/writes cleanly — including inside a repeat, which is where a hand-rolled
// field walker would have gone wrong.

import { describe, it, expect } from 'vitest'
import { buildFieldModel } from '@/lib/studio/kernel/review-kernel'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import {
  eventSeedDraftFromExtraction,
  isSeededPath,
  readDraftValue,
  seedEventLedger,
  seededFieldsOnly,
  setDraftValue,
  SEEDED_FIELD_PATHS,
} from './draft'

const RAW = {
  title: 'Sunrise Ecstatic Dance',
  description: 'A barefoot dance to meet the sun, no experience needed.',
  startsAt: '2027-03-04T06:30:00',
  endsAt: '',
  location: 'Playa Chiquita, Puerto Viejo',
  isFree: false,
  priceCents: 2500,
  organizerName: 'Casa Luna',
  organizerContact: 'hola@casaluna.cr',
  domain: 'body',
  tags: ['dance', 'morning'],
  details: {
    tickets: [
      { label: 'Early bird', priceCents: 2000 },
      { label: 'Door', priceCents: 3000 },
    ],
    lineup: [{ name: 'DJ Marea', role: 'dj' }],
    features: ['tea', 'live set'],
  },
}

describe('a read becomes a draft', () => {
  it('carries the manifest paths and drops the scan-only fields', () => {
    const draft = eventSeedDraftFromExtraction(RAW)
    expect(draft.title).toBe('Sunrise Ecstatic Dance')
    expect(draft.priceCents).toBe(2500)
    expect(draft.domain).toBe('body')
    expect(draft.details.tickets).toHaveLength(2)
    // The poster geometry never survives into a staged draft.
    expect('cover' in draft).toBe(false)
    expect('corners' in draft).toBe(false)
    expect('quality' in draft).toBe(false)
  })

  it('survives junk without throwing', () => {
    const draft = eventSeedDraftFromExtraction({ title: 42, details: 'nope' })
    expect(draft.title).toBe('')
    expect(draft.details).toEqual({})
  })
})

describe('the seeded ledger is honest by default', () => {
  const draft = eventSeedDraftFromExtraction(RAW)
  const ledger = seedEventLedger(draft, { snippet: 'Dance at sunrise Thursday, 25 at the door', confidence: 'high' })

  it('marks what the model read as inferred, and its prose as generated', () => {
    expect(ledger.title[0].kind).toBe('inferred')
    expect(ledger.description[0].kind).toBe('generated')
  })

  it('never claims a verification nobody made', () => {
    for (const entries of Object.values(ledger)) {
      for (const entry of entries) expect(entry.verifiedBy).toBeUndefined()
    }
  })

  it('cites the message on every entry, including inside a repeat', () => {
    expect(ledger['details.tickets[0].priceCents'][0].snippet).toContain('25 at the door')
  })

  it('records nothing for a field the read left empty', () => {
    expect(ledger.endsAt).toBeUndefined()
  })

  it('opens every field as amber in the manifest model, so nothing looks confirmed', () => {
    const model = seededFieldsOnly(buildFieldModel(EVENT_MANIFEST, draft as unknown as Record<string, unknown>, ledger))
    expect(model.summary.green).toBe(0)
    expect(model.summary.blocked).toBe(false)
  })
})

describe('the board renders the manifest, narrowed to what this door carries', () => {
  const draft = eventSeedDraftFromExtraction(RAW)
  const model = seededFieldsOnly(buildFieldModel(EVENT_MANIFEST, draft as unknown as Record<string, unknown>, {}))
  const paths = model.sections.flatMap((s) => s.fields).map((f) => f.path)

  it('keeps the fields the writer carries', () => {
    expect(paths).toContain('title')
    expect(paths).toContain('description')
    expect(paths).toContain('startsAt')
    expect(paths).toContain('details.tickets[0].label')
  })

  it('drops the fields the writer would silently ignore', () => {
    expect(paths).not.toContain('scopeId')
    expect(paths).not.toContain('visibility')
    expect(paths).not.toContain('recurrenceType')
    expect(paths).not.toContain('coverImagePath')
  })

  it('takes its labels and grouping from the manifest, not from this module', () => {
    const title = model.sections.flatMap((s) => s.fields).find((f) => f.path === 'title')
    expect(title?.label).toBe('Title')
    expect(title?.section).toBe('identity')
  })

  it('every carried path is a path the manifest actually declares', () => {
    const declared = new Set(EVENT_MANIFEST.fields.map((f) => f.path))
    for (const path of SEEDED_FIELD_PATHS) expect(declared.has(path)).toBe(true)
  })

  it('counts only what is on screen', () => {
    expect(model.summary.total).toBe(paths.length)
  })
})

describe('reading and writing one path', () => {
  it('reads a scalar, a list, a boolean, and money', () => {
    const draft = eventSeedDraftFromExtraction(RAW) as unknown as Record<string, unknown>
    expect(readDraftValue(draft, 'title')).toBe('Sunrise Ecstatic Dance')
    expect(readDraftValue(draft, 'details.features')).toBe('tea, live set')
    expect(readDraftValue(draft, 'isFree')).toBe('No')
    expect(readDraftValue(draft, 'priceCents')).toBe('$25')
    expect(readDraftValue(draft, 'details.tickets[1].label')).toBe('Door')
  })

  it('writes money as cents, a list as an array, and a yes as a boolean', () => {
    const draft = eventSeedDraftFromExtraction(RAW) as unknown as Record<string, unknown>
    expect(setDraftValue(draft, 'priceCents', '$12.50')).toBe(true)
    expect(draft.priceCents).toBe(1250)
    expect(setDraftValue(draft, 'details.features', 'tea, mats, water')).toBe(true)
    expect((draft.details as { features: string[] }).features).toEqual(['tea', 'mats', 'water'])
    expect(setDraftValue(draft, 'isFree', 'yes')).toBe(true)
    expect(draft.isFree).toBe(true)
  })

  it('writes inside a repeat by its indexed path', () => {
    const draft = eventSeedDraftFromExtraction(RAW) as unknown as Record<string, unknown>
    expect(setDraftValue(draft, 'details.tickets[0].label', 'Sliding scale')).toBe(true)
    expect(readDraftValue(draft, 'details.tickets[0].label')).toBe('Sliding scale')
  })

  it('clears a field rather than deleting its shape', () => {
    const draft = eventSeedDraftFromExtraction(RAW) as unknown as Record<string, unknown>
    setDraftValue(draft, 'organizerContact', '')
    expect(draft.organizerContact).toBe('')
    setDraftValue(draft, 'priceCents', '')
    expect(draft.priceCents).toBeNull()
  })

  it('refuses a path that resolves to nothing instead of inventing a container', () => {
    const draft = eventSeedDraftFromExtraction(RAW) as unknown as Record<string, unknown>
    expect(setDraftValue(draft, 'details.tickets[9].label', 'Ghost')).toBe(false)
    expect(setDraftValue(draft, 'nope.deeper.still', 'x')).toBe(false)
    expect(readDraftValue(draft, 'nope.deeper.still')).toBe('')
  })

  it('knows which paths this door carries', () => {
    expect(isSeededPath('title')).toBe(true)
    expect(isSeededPath('details.lineup[3].name')).toBe(true)
    expect(isSeededPath('visibility')).toBe(false)
  })
})
