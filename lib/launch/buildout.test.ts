import { describe, expect, it } from 'vitest'
import { applyPolish, askThem, enforceCites, MAX_AI_CALLS, passagesOf, polishCallsLeft, quoteDraft, readStoredBuildout, type BuildoutInput } from './buildout'
import { snippetIsQuoted, type ShelfFact } from './facts'

const input: BuildoutInput = {
  spotlight: { name: 'Mara Quinn', line: 'I teach breathwork to tired founders in Austin.', link: 'https://maraquinn.com/' },
  space: { tagline: 'Breathwork for tired founders', about: 'Mara runs small evening sessions at a studio in East Austin.\nBring a mat.' },
  profile: { bio: 'Former product manager turned breathwork guide.', website: 'maraquinn.com' },
  facts: [],
}
const fact = (over: Partial<ShelfFact>): ShelfFact => ({ id: 'f', slot: 'story', value: 'v', snippet: 'We started in a garage in 2019.', origin: 'your about page', state: 'accepted', ...over })

describe('the quote draft', () => {
  it('fills every field from quotes and cites each one with a snippet found in its source', () => {
    const d = quoteDraft(input)
    const passages = passagesOf(input)
    expect(d.space.tagline).toBe('Breathwork for tired founders')
    expect(d.website.headline).toBe('Breathwork for tired founders')
    expect(d.email.subject).toBe('Mara Quinn')
    expect(d.spotlight).toEqual(input.spotlight)
    expect(askThem(d)).toEqual([])
    for (const f of [['space', 'about'], ['website', 'intro'], ['email', 'body'], ['email', 'subject']] as const) expect(d.cites.some((c) => c.slot === f[0] && c.field === f[1])).toBe(true)
    for (const c of d.cites) expect(snippetIsQuoted(passages.filter((p) => p.origin === c.origin).map((p) => p.text).join('\n'), c.snippet)).toBe(true)
    expect(enforceCites(d, passages)).toEqual(d)
  })
  it('uses an accepted fact and ignores a suggested or dismissed one', () => {
    const d = quoteDraft({ ...input, facts: [fact({ slot: 'tagline', snippet: 'Calm for busy people.' }), fact({ id: 'g', state: 'suggested', snippet: 'Unaccepted line.' })] })
    expect(d.space.tagline).toBe('Calm for busy people.')
    expect(d.space.about).not.toContain('Unaccepted')
  })
  it('leaves a field empty, to ask them, when there is nothing to quote', () => {
    const d = quoteDraft({ spotlight: { name: 'Mara', line: '', link: '' }, space: null, profile: null, facts: [] })
    expect(d.space.about).toBe('')
    expect(d.website.intro).toBe('')
    expect(askThem(d).map((f) => `${f.slot}.${f.field}`)).toContain('space.tagline')
  })
  it('never carries words that are not theirs: every output character run is from a passage', () => {
    const d = quoteDraft(input)
    const all = passagesOf(input).map((p) => p.text).join('\n').replace(/\s+/g, ' ').toLowerCase()
    for (const part of [d.space.tagline, ...d.space.about.split('\n\n'), d.email.subject, ...d.email.body.split('\n\n')]) expect(all).toContain(part.replace(/\s+/g, ' ').toLowerCase())
  })
})

describe('cite enforcement', () => {
  const passages = passagesOf(input)
  it('drops a field whose cite is not in the person\'s words', () => {
    const d = quoteDraft(input)
    const bad = { ...d, space: { ...d.space, tagline: 'Transform your life' }, cites: d.cites.map((c) => (c.slot === 'space' && c.field === 'tagline' ? { ...c, snippet: 'Transform your life' } : c)) }
    const out = enforceCites(bad, passages)
    expect(out.space.tagline).toBe('')
    expect(out.cites.some((c) => c.slot === 'space' && c.field === 'tagline')).toBe(false)
  })
  it('drops a field with no cite at all', () => {
    const d = quoteDraft(input)
    expect(enforceCites({ ...d, cites: d.cites.filter((c) => c.field !== 'headline') }, passages).website.headline).toBe('')
  })
  it('drops a cite whose origin names a different source than the snippet came from', () => {
    const d = quoteDraft(input)
    const out = enforceCites({ ...d, cites: d.cites.map((c) => (c.field === 'subject' ? { ...c, origin: 'Your profile bio' } : c)) }, passages)
    expect(out.email.subject).toBe('')
  })
  it('drops a field that brings in a number or address no source has, even with a real cite', () => {
    const d = quoteDraft(input)
    const out = enforceCites({ ...d, space: { ...d.space, tagline: 'Breathwork for tired founders, 50% off' } }, passages)
    expect(out.space.tagline).toBe('')
  })
})

describe('the optional polish', () => {
  const passages = passagesOf(input)
  const base = quoteDraft(input)
  it('accepts a rewrite that cites their own words and removes em dashes', () => {
    const out = applyPolish(base, { fields: [{ slot: 'space', field: 'tagline', value: 'Breathwork — for tired founders', snippet: 'Breathwork for tired founders', origin: 'Your Space tagline' }] }, passages)
    expect(out.space.tagline).toBe('Breathwork, for tired founders')
  })
  it('keeps the quote when the rewrite cites words that are not theirs, or is malformed', () => {
    const out = applyPolish(base, { fields: [{ slot: 'space', field: 'tagline', value: 'Unlock your best self', snippet: 'unlock your best self', origin: 'Your Space tagline' }, { slot: 'spotlight', field: 'name', value: 'X', snippet: 'Mara Quinn', origin: 'Your Spotlight answers' }, 'junk'] }, passages)
    expect(out).toEqual(base)
    expect(applyPolish(base, 'nonsense', passages)).toEqual(base)
  })
  it('caps the calls per launch at two', () => {
    expect(MAX_AI_CALLS).toBe(2)
    expect([0, 1, 2, 3].map(polishCallsLeft)).toEqual([true, true, false, false])
    expect(readStoredBuildout({ draft: base, mode: 'ai', aiCalls: 1, at: 'x' })?.aiCalls).toBe(1)
    expect(readStoredBuildout({ draft: base, aiCalls: 'many' })?.aiCalls).toBe(MAX_AI_CALLS)
    expect(readStoredBuildout({ nope: 1 })).toBeNull()
  })
})
