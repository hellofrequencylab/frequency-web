import { describe, expect, it } from 'vitest'
import { citesFor, parseReviewDraft, wentLive } from './review'

const form = { sp_name: ' Daniel Tyack ', sp_line: 'I help people move through big feelings.', sp_link: 'danieltyack.com', tagline: 'Emotinal Alchemy', about: 'Line one.\r\n\r\n\r\n\r\nLine two.' }

describe('parseReviewDraft', () => {
  it('reads the edited form back, keeping the person\'s spelling and paragraphs', () => {
    const d = parseReviewDraft(form)
    expect('error' in d).toBe(false)
    if ('error' in d) return
    expect(d.space.tagline).toBe('Emotinal Alchemy')
    expect(d.space.about).toBe('Line one.\n\nLine two.')
    expect(d.spotlight).toEqual({ name: 'Daniel Tyack', line: 'I help people move through big feelings.', link: 'https://danieltyack.com/' })
    expect(d.website).toEqual({ headline: '', intro: '' })
  })
  it('needs a Spotlight name and line, nothing else', () => {
    expect(parseReviewDraft({ ...form, sp_name: '' })).toEqual({ error: 'name' })
    expect(parseReviewDraft({ ...form, sp_line: ' ' })).toEqual({ error: 'line' })
    expect('error' in parseReviewDraft({ ...form, tagline: '', about: '' })).toBe(false)
  })
})

describe('citesFor', () => {
  it('returns only the cites of that field that carry words', () => {
    const cites = [
      { slot: 'space' as const, field: 'tagline', snippet: 'a', origin: 'x' },
      { slot: 'space' as const, field: 'tagline', snippet: ' ', origin: 'x' },
      { slot: 'website' as const, field: 'tagline', snippet: 'b', origin: 'x' },
    ]
    expect(citesFor({ cites }, 'space', 'tagline')).toHaveLength(1)
  })
})

describe('wentLive', () => {
  it('claims only what the records show', () => {
    const s = (items: [string, 'done' | 'todo'][]) => [{ id: 'spotlight' as const, title: 'A', items: items.map(([id, state]) => ({ id, label: id, state })) }]
    expect(wentLive(s([['sp-live', 'done'], ['sc-tag', 'done'], ['sc-about', 'todo']]))).toEqual(['Your Spotlight'])
    expect(wentLive(s([['sp-live', 'done'], ['sc-tag', 'done'], ['sc-about', 'done']]))).toEqual(['Your Spotlight', 'your Space'])
  })
})
