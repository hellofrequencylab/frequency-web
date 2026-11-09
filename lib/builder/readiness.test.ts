import { describe, expect, it } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import { canPublish, nextReadinessItem, ownEdit, readiness, readinessTags, TAG_SAY } from './readiness'
import { needsNumber, nullNumbers, publishChecks, sectionNullNumbers } from '@/lib/sites/editor/publish-checks'

const config = {
  components: {
    RoleHero: { label: 'Hero', fields: { image: { type: 'text' }, alt: { type: 'text' }, title: { type: 'text' } } },
    RoleStats: { label: 'Figures', fields: { items: { type: 'array', arrayFields: { value: { type: 'text' }, label: { type: 'text' } } } } },
    RoleProof: { label: 'Quotes', fields: { stats: { type: 'array', arrayFields: { value: { type: 'text' }, label: { type: 'text' } } } } },
    Text: { label: 'Text', fields: { body: { type: 'textarea' } } },
  },
} as unknown as Config

const doc = (content: unknown[]): Data => ({ root: {}, content }) as unknown as Data
const page = (slug: string, content: unknown[], description = 'A place to meet') => ({ slug, label: slug === 'home' ? 'Home' : slug, doc: doc(content), seo: { title: '', description } })

describe('needsNumber', () => {
  it('reads empty, words only and the kit placeholder as missing, and any real figure as a number', () => {
    for (const v of ['', '   ', null, undefined, 'Lots', '000', '00']) expect(needsNumber(v), String(v)).toBe(true)
    for (const v of ['0', '12', '1,200', '$40', '4.9', '24/7', 12]) expect(needsNumber(v), String(v)).toBe(false)
  })
})

describe('null numbers', () => {
  const stats = (items: unknown[], extra = {}) => ({ type: 'RoleStats', props: { id: 's', items, ...extra } })
  it('counts a figure that says what it counts and has no number', () => {
    expect(sectionNullNumbers(stats([{ value: '', label: 'Members' }, { value: '120', label: 'Nights' }, { value: '', label: '' }]))).toBe(1)
  })
  it('leaves sample sections to the sample check, and a row the Space fills to the Space', () => {
    expect(sectionNullNumbers(stats([{ value: '000', label: 'Replace with a real number' }], { sample: true }))).toBe(0)
    expect(sectionNullNumbers(stats([{ value: '', label: 'Members' }]), { liveFigures: true })).toBe(0)
    expect(sectionNullNumbers(stats([{ value: '', label: 'Members' }], { live: false }), { liveFigures: true })).toBe(1)
  })
  it('reads the figures beside a quote too, nested blocks included', () => {
    const d = doc([{ type: 'Columns', props: { id: 'c', left: [{ type: 'RoleProof', props: { id: 'p', stats: [{ value: '—', label: 'Years' }] } }] } }])
    expect(nullNumbers(d)).toBe(1)
  })
  it('adds a check to the current editor’s Publish modal only when a figure needs a number', () => {
    expect(publishChecks([page('home', [])], config).some((c) => /number/.test(c.text))).toBe(false)
    expect(publishChecks([page('home', [stats([{ value: '', label: 'Members' }])])], config).find((c) => /number/.test(c.text))?.text).toBe('1 figure needs a number')
  })
})

describe('readiness', () => {
  const sample = { type: 'RoleHero', props: { id: 'h', sample: true, title: 'Your place' } }
  const noAlt = { type: 'RoleHero', props: { id: 'a', image: '/a.jpg', alt: '' } }
  const nullFig = { type: 'RoleStats', props: { id: 'n', items: [{ value: '', label: 'Members' }] } }
  const clean = { type: 'Text', props: { id: 't', body: 'Hello' } }

  it('is clear on a finished page, and Publish goes', () => {
    const r = readiness([page('home', [clean])], config)
    expect(r).toEqual({ items: [], count: 0, gate: 'clear' })
    expect(canPublish(r)).toBe(true)
  })

  it('finds sample words, null numbers, missing alt text and missing SEO, in page then section order', () => {
    const r = readiness([page('home', [sample, nullFig, noAlt]), page('visit', [clean], '')], config)
    expect(r.items.map((i) => [i.pageSlug, i.sectionId, i.kind])).toEqual([
      ['home', 'h', 'sample'], ['home', 'n', 'number'], ['home', 'a', 'alt'], ['visit', null, 'seo'],
    ])
    expect(r.count).toBe(4)
    expect(r.items[1].say).toBe('Figures: a figure needs a number')
  })

  it('a page with sample: true content cannot publish without an explicit keep', () => {
    const r = readiness([page('home', [sample, clean])], config)
    expect(r.gate).toBe('keep')
    expect(canPublish(r)).toBe(false)
    expect(canPublish(r, true)).toBe(true)
  })

  it('a null number blocks publish, keep or not', () => {
    const r = readiness([page('home', [sample, nullFig])], config)
    expect(r.gate).toBe('blocked')
    expect(canPublish(r)).toBe(false)
    expect(canPublish(r, true)).toBe(false)
  })

  it('warnings alone (alt, SEO) let Publish go', () => {
    const r = readiness([page('home', [noAlt], '')], config)
    expect(r.gate).toBe('warn')
    expect(canPublish(r)).toBe(true)
  })

  it('tags sample and number sections on the canvas, one tag a section, sample first, this page only', () => {
    const r = readiness([page('home', [sample, nullFig, noAlt]), page('visit', [{ ...nullFig, props: { ...nullFig.props, id: 'v' } }])], config)
    expect(readinessTags(r, 'home')).toEqual({ h: TAG_SAY.sample, n: TAG_SAY.number })
    expect(readinessTags(r, 'visit')).toEqual({ v: TAG_SAY.number })
  })

  it('the count steps through every item and wraps', () => {
    const r = readiness([page('home', [sample, nullFig, noAlt])], config)
    const seen = [-1]
    for (let i = 0; i < 4; i++) seen.push(nextReadinessItem(r, seen.at(-1)!))
    expect(seen.slice(1)).toEqual([0, 1, 2, 0])
    expect(nextReadinessItem(readiness([page('home', [])], config), -1)).toBe(-1)
  })

  it('editing a sample section makes it the owner’s; other edits pass through', () => {
    expect(ownEdit({ sample: true }, { title: 'Ours' })).toEqual({ title: 'Ours', sample: false })
    expect(ownEdit({ title: 'x' }, { title: 'Ours' })).toEqual({ title: 'Ours' })
    expect(ownEdit(undefined, { title: 'Ours' })).toEqual({ title: 'Ours' })
  })
})
