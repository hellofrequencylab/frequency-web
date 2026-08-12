// The Event Seeder's pure layer (ADR-989): a read becomes a draft, the draft seeds a ledger,
// and one path reads/writes cleanly — including inside a repeat, which is where a hand-rolled
// field walker would have gone wrong.

import { describe, it, expect } from 'vitest'
import { buildFieldModel } from '@/lib/studio/kernel/review-kernel'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import {
  canonicalSeededPath,
  confirmEventLedger,
  eventSeedDraftFromExtraction,
  isSeededPath,
  mergePosterLinks,
  readDraftValue,
  seedEventLedger,
  seededFieldsOnly,
  setDraftValue,
  SEEDED_FIELD_PATHS,
} from './draft'
import type { EventLink } from '@/lib/events/types'
import type { ProvenanceLedger } from '@/lib/studio/kernel/ledger'

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
    // A declared tier that this draft does not have: allowed by name, refused by the walk.
    expect(setDraftValue(draft, 'details.tickets[5].label', 'Ghost')).toBe(false)
    expect((draft.details as { tickets: unknown[] }).tickets).toHaveLength(2)
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

describe('the scan door folds in the links only a browser can read', () => {
  const link = (url: string, label = 'Tickets'): EventLink => ({ label, url, kind: 'tickets' })

  it('adds a QR link the model never saw in print', () => {
    const details = mergePosterLinks({ links: [link('https://a.test/one')] }, [link('https://b.test/qr')])
    expect(details.links?.map((l) => l.url)).toEqual(['https://a.test/one', 'https://b.test/qr'])
  })

  it('does not list the same booking link twice', () => {
    const details = mergePosterLinks({ links: [link('https://a.test/one')] }, [link('https://a.test/one', 'QR')])
    expect(details.links).toHaveLength(1)
  })

  it('starts a links row on a read that had none, and leaves the rest of the details alone', () => {
    const details = mergePosterLinks({ features: ['tea'] }, [link('https://b.test/qr')])
    expect(details.links?.map((l) => l.url)).toEqual(['https://b.test/qr'])
    expect(details.features).toEqual(['tea'])
  })

  it('is a no-op with nothing to add, and never grows past the cap the details column keeps', () => {
    const base = { links: [link('https://a.test/one')] }
    expect(mergePosterLinks(base, [])).toBe(base)
    const many = Array.from({ length: 14 }, (_, i) => link(`https://q.test/${i}`))
    expect(mergePosterLinks(base, many).links).toHaveLength(10)
  })
})

// ── The write allowlist, and prototype pollution (CodeQL, ADR-989 branch) ────────────────────────
// A staged intake's field paths come from a chat export and arrive back from a browser, so a path is
// untrusted input twice over. Two guards stand behind these tests, and each one is load-bearing:
//   1. the writable allowlist (canonicalSeededPath), checked immediately before every assignment —
//      this board writes the paths the apply carries and nothing else, so an undeclared path is a
//      bug (the edit would be dropped at apply) before it is a security hole; and
//   2. the forbidden-key check in segments(), which also covers every READER of a path.

describe('setDraftValue — a path may never reach the prototype', () => {
  it('refuses __proto__, constructor and prototype anywhere in the path', () => {
    for (const path of ['__proto__', '__proto__.polluted', 'details.__proto__.x', 'constructor', 'details.prototype.y']) {
      const draft: Record<string, unknown> = {}
      expect(setDraftValue(draft, path, 'x'), path).toBe(false)
    }
    // The real assertion: nothing landed on the prototype of a plain object.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false)
  })

  it('still writes an ordinary path', () => {
    const draft: Record<string, unknown> = {}
    expect(setDraftValue(draft, 'title', 'Sound bath')).toBe(true)
    expect(draft.title).toBe('Sound bath')
  })

  it('never lets a READER step onto a prototype either', () => {
    // The allowlist covers the writes. This is the reader's half, and it is why the forbidden-key
    // check lives in segments(): without it a path can step off the draft onto a prototype and read
    // back a value the event does not have (here Array.prototype.length, which answers '0'), and the
    // board would show that to an operator as the field's content.
    const draft = eventSeedDraftFromExtraction(RAW) as unknown as Record<string, unknown>
    expect(readDraftValue(draft, 'details.tickets.__proto__.length')).toBe('')
    expect(readDraftValue(draft, 'details.__proto__.x')).toBe('')
    expect(readDraftValue(draft, 'details.tickets[0].label')).toBe('Early bird')
  })
})

describe('setDraftValue — only the paths the apply carries', () => {
  it('refuses a real manifest field this door does not carry, rather than writing one the apply would drop', () => {
    const draft = eventSeedDraftFromExtraction(RAW) as unknown as Record<string, unknown>
    // 'visibility' and 'scopeId' are declared on the EVENT manifest, so they parse and the draft is a
    // plain object: only the allowlist stands between them and a write the apply would silently lose.
    expect(setDraftValue(draft, 'visibility', 'public')).toBe(false)
    expect(setDraftValue(draft, 'scopeId', 'some-space')).toBe(false)
    expect(draft.visibility).toBeUndefined()
    expect(draft.scopeId).toBeUndefined()
  })

  it('refuses a leaf inside details that is not a seeded field', () => {
    const draft = eventSeedDraftFromExtraction(RAW) as unknown as Record<string, unknown>
    expect(setDraftValue(draft, 'details.confidence', 'high')).toBe(false)
    expect((draft.details as Record<string, unknown>).confidence).toBeUndefined()
  })

  it('refuses a repeat row past the cap the details coercer enforces', () => {
    const draft = eventSeedDraftFromExtraction({ ...RAW, details: { tickets: [{ label: 'Door' }] } }) as unknown as Record<string, unknown>
    // tickets caps at 8 rows, so [8] can never exist and is not a writable path.
    expect(canonicalSeededPath('details.tickets[7].label')).toBe('details.tickets[7].label')
    expect(canonicalSeededPath('details.tickets[8].label')).toBeNull()
    expect(setDraftValue(draft, 'details.tickets[8].label', 'Ghost')).toBe(false)
  })

  it('still writes every path the board actually renders', () => {
    const draft = eventSeedDraftFromExtraction(RAW) as unknown as Record<string, unknown>
    for (const path of SEEDED_FIELD_PATHS) {
      expect(canonicalSeededPath(path), path).toBe(path)
      expect(setDraftValue(draft, path, 'x'), path).toBe(true)
    }
    // and inside a repeat, on a row that exists
    expect(setDraftValue(draft, 'details.lineup[0].name', 'DJ Marea')).toBe(true)
    expect(readDraftValue(draft, 'details.lineup[0].name')).toBe('DJ Marea')
  })

  it("resolves a path to the allowlist's own string, never to the caller's", () => {
    // Same characters, different object: what comes back is the module's constant, which is what the
    // writes are keyed on.
    const fromRequest = ['details', 'tickets[0]', 'label'].join('.')
    expect(canonicalSeededPath(fromRequest)).toBe('details.tickets[0].label')
    expect(canonicalSeededPath('__proto__')).toBeNull()
    expect(canonicalSeededPath('constructor')).toBeNull()
    expect(canonicalSeededPath('visibility')).toBeNull()
  })
})

describe('confirmEventLedger — a receipt only for a path the apply carries', () => {
  it('refuses to key the ledger on __proto__, so a confirm cannot repoint a prototype', () => {
    const ledger: ProvenanceLedger = {}
    confirmEventLedger(ledger, '__proto__', 'x')
    expect(Object.getPrototypeOf(ledger)).toBe(Object.prototype)
    expect(Object.keys(ledger)).toEqual([])
  })

  it('writes no receipt for a field this board does not carry', () => {
    const ledger: ProvenanceLedger = {}
    confirmEventLedger(ledger, 'visibility', 'public')
    expect(Object.keys(ledger)).toEqual([])
  })

  it('still promotes a carried path, including inside a repeat', () => {
    const ledger: ProvenanceLedger = {}
    confirmEventLedger(ledger, 'title', 'Sunrise Ecstatic Dance')
    confirmEventLedger(ledger, 'details.tickets[0].priceCents', '$20')
    expect(ledger.title[0].kind).toBe('fact')
    expect(ledger.title[0].verifiedBy).toBe('human')
    expect(ledger['details.tickets[0].priceCents'][0].snippet).toBe('$20')
  })
})
