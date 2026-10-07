import { describe, expect, it } from 'vitest'
import {
  accentSegments,
  appHref,
  formatDuration,
  formatOfferingPrice,
  formatTierPrice,
  paragraphs,
  planHouseSections,
  plainText,
  siteHasContactPage,
  splitWhoBody,
  stepNumber,
  withoutAccentMarks,
} from './house-theme'

describe('planHouseSections', () => {
  // The reference Space's Home (danieltyack, 2026-10-07): the order the theme must follow.
  const rows = [
    { id: 'r0', cells: [['editorial', 'zigzag', 'cardGrid']] },
    { id: 'r10', cells: [['features']] },
    { id: 'r7', cells: [['gallery']] },
    { id: 'r5', cells: [['offerings', 'booking']] },
    { id: 'r6', cells: [['faq']] },
    { id: 'r8', cells: [['accentBeat']] },
    { id: 'r9', cells: [['contact'], ['business']], title: 'Contact and details' },
  ]

  it('gives every known block a themed section, in page order', () => {
    expect(planHouseSections(rows)).toEqual([
      { kind: 'who', id: 'editorial' },
      { kind: 'story', id: 'zigzag', factsId: null },
      { kind: 'steps', id: 'cardGrid' },
      { kind: 'facts', id: 'features' },
      { kind: 'other', rowId: 'r7', ids: ['gallery'] },
      { kind: 'sessions', id: 'offerings' },
      { kind: 'faq', id: 'faq' },
      { kind: 'closing', ctaId: 'accentBeat', contactRowTitle: 'Contact and details' },
    ])
  })

  it('folds a Features block straight after a Zigzag into the story', () => {
    expect(planHouseSections([{ id: 'a', cells: [['zigzag', 'features']] }])).toEqual([
      { kind: 'story', id: 'zigzag', factsId: 'features' },
    ])
  })

  it('leaves a sourced Features block to its own render', () => {
    expect(planHouseSections([{ id: 'a', cells: [['zigzag', 'features']] }], (id) => id === 'features')).toEqual([
      { kind: 'story', id: 'zigzag', factsId: null },
      { kind: 'other', rowId: 'a', ids: ['features'] },
    ])
  })

  it('keeps a booking block when there are no session cards to carry it', () => {
    expect(planHouseSections([{ id: 'a', cells: [['booking']] }])).toEqual([{ kind: 'other', rowId: 'a', ids: ['booking'] }])
  })

  it('merges Memberships and Circles into one community band', () => {
    expect(planHouseSections([{ id: 'a', cells: [['circles'], ['memberships']] }])).toEqual([
      { kind: 'community', membershipsId: 'memberships' },
    ])
  })

  it('closes on contact alone, without a call to action', () => {
    expect(planHouseSections([{ id: 'a', cells: [['contact']] }])).toEqual([
      { kind: 'closing', ctaId: null, contactRowTitle: null },
    ])
  })

  it('gives the Contact form its own message section, before the closing band', () => {
    expect(planHouseSections([{ id: 'a', cells: [['contactForm']] }, { id: 'b', cells: [['accentBeat']] }])).toEqual([
      { kind: 'inquiry', id: 'contactForm' },
      { kind: 'closing', ctaId: 'accentBeat', contactRowTitle: null },
    ])
  })
})

describe('siteHasContactPage', () => {
  const withForm = (extra: Record<string, unknown> = {}) => ({
    profileLayout: { rows: [{ id: 'r0', columns: 1, cells: [['about'], ['contactForm']] }], ...extra },
  })

  it('offers the Contact page once the Contact form is on the Home page', () => {
    expect(siteHasContactPage(withForm())).toBe(true)
  })

  it('offers none without the form, or with the form hidden', () => {
    expect(siteHasContactPage({ profileLayout: { rows: [{ id: 'r0', columns: 1, cells: [['contact']] }] } })).toBe(false)
    expect(siteHasContactPage(withForm({ hidden: ['contactForm'] }))).toBe(false)
    expect(siteHasContactPage(null)).toBe(false)
  })
})

describe('withoutAccentMarks', () => {
  it('drops the asterisks and keeps the words', () => {
    expect(withoutAccentMarks('Fine, but *not okay.*')).toBe('Fine, but not okay.')
    expect(withoutAccentMarks('Plain heading')).toBe('Plain heading')
  })
})

describe('text', () => {
  it('decodes stored entities and drops tags', () => {
    expect(plainText('I&#39;d gone <b>quiet</b> &amp;amp; still')).toBe("I'd gone quiet & still")
  })

  it('splits a body on double line breaks', () => {
    expect(paragraphs('One.<br><br>Two.<br/><br />Three.')).toEqual(['One.', 'Two.', 'Three.'])
  })

  it('reads an Editorial body as lead, statement rows and a closing line', () => {
    const body =
      'Maybe everything came apart.<br><br>Everything fell apart at the same time. Fine, but not okay. Feeling nothing.<br><br>If any of that lands, you&#39;re in the right place.'
    expect(splitWhoBody(body)).toEqual({
      lead: 'Maybe everything came apart.',
      signs: ['Everything fell apart at the same time.', 'Fine, but not okay.', 'Feeling nothing.'],
      closing: "If any of that lands, you're in the right place.",
    })
  })

  it('keeps a long middle paragraph whole', () => {
    const long = `${'A sentence that keeps going for quite a while, and then for some more words, and then for a few more. '.repeat(2)}`
    expect(splitWhoBody(`Lead.<br><br>${long}<br><br>End.`).signs).toEqual([long.trim()])
  })

  it('sets *marked* words as the accent', () => {
    expect(accentSegments('Fine, but *not okay.*')).toEqual([
      { text: 'Fine, but ', accent: false },
      { text: 'not okay.', accent: true },
    ])
    expect(accentSegments('Plain')).toEqual([{ text: 'Plain', accent: false }])
  })

  it('numbers steps from the card, else its place', () => {
    expect(stepNumber('3', 0)).toBe('03')
    expect(stepNumber('', 1)).toBe('02')
  })
})

describe('prices and links', () => {
  it('formats a session length', () => {
    expect(formatDuration(60)).toBe('1 hr')
    expect(formatDuration(90)).toBe('1 hr 30 min')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(undefined)).toBeNull()
  })

  it('formats an offering price by its model', () => {
    expect(formatOfferingPrice({ price: 120, currency: 'USD', priceModel: 'fixed' })).toBe('$120')
    expect(formatOfferingPrice({ price: 80, priceModel: 'from' })).toBe('From $80')
    expect(formatOfferingPrice({ priceModel: 'free' })).toBe('Free')
    expect(formatOfferingPrice({ price: 50, priceModel: 'contact' })).toBeNull()
  })

  it('formats a tier price', () => {
    expect(formatTierPrice(1000, 'month')).toBe('$10 per month')
    expect(formatTierPrice(9000, 'year')).toBe('$90 per year')
    expect(formatTierPrice(0, 'month')).toBe('Free')
  })

  it('keeps links on Frequency', () => {
    expect(appHref('/spaces/x/book', 'https://frequencylocal.com')).toBe('https://frequencylocal.com/spaces/x/book')
    expect(appHref('javascript:alert(1)', 'https://frequencylocal.com')).toBeNull()
    expect(appHref('//evil.com', 'https://frequencylocal.com')).toBeNull()
  })
})
