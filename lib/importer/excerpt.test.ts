import { describe, it, expect } from 'vitest'
import { buildSourceExcerpt, stripBoilerplate } from './excerpt'
import type { HarvestedSource } from './intake'

// The excerpt is what lets the composer write in the BUSINESS'S words instead of ours, so the
// two things under test are: does the highest-signal text survive the budget, and is the text
// still verbatim after the chrome comes off.

let seq = 0
function source(partial: Partial<HarvestedSource> & { text?: string }): HarvestedSource {
  seq += 1
  return {
    id: partial.id ?? `s${seq}`,
    kind: partial.kind ?? 'page',
    url: partial.url,
    title: partial.title,
    text: partial.text,
    fetchedAt: partial.fetchedAt ?? '2026-08-14T00:00:00.000Z',
  }
}

/** A block of prose long enough to survive the min-chunk floor, tagged so tests can find it. */
function prose(tag: string, sentences = 6): string {
  return Array.from(
    { length: sentences },
    (_, i) => `${tag} sentence ${i} about the work we do here and the people we do it with.`,
  ).join(' ')
}

describe('buildSourceExcerpt: nothing usable', () => {
  it('returns empty for an empty array', () => {
    expect(buildSourceExcerpt([])).toBe('')
  })

  it('returns empty when no source carries text', () => {
    const sources = [source({ url: 'https://x.com/', text: '' }), source({ kind: 'image', text: undefined })]
    expect(buildSourceExcerpt(sources)).toBe('')
  })

  it('returns empty when every line is boilerplate', () => {
    const sources = [source({ url: 'https://x.com/', text: 'Skip to content\nMenu\n© 2026 X. All rights reserved.' })]
    expect(buildSourceExcerpt(sources)).toBe('')
  })
})

describe('buildSourceExcerpt: priority order', () => {
  it('puts the operator paste first, whatever the harvest order', () => {
    const sources = [
      source({ url: 'https://kelp.co/', text: prose('HOME') }),
      source({ kind: 'paste', text: prose('PASTE') }),
    ]
    const out = buildSourceExcerpt(sources)
    expect(out.indexOf('PASTE')).toBeGreaterThan(-1)
    expect(out.indexOf('PASTE')).toBeLessThan(out.indexOf('HOME'))
  })

  it('leads the pages with the home page (shortest path), then about, then offerings, then the rest', () => {
    const sources = [
      source({ url: 'https://kelp.co/contact', text: prose('CONTACT') }),
      source({ url: 'https://kelp.co/services/breathwork', text: prose('SERVICES') }),
      source({ url: 'https://kelp.co/', text: prose('HOME') }),
      source({ url: 'https://kelp.co/about-us', text: prose('ABOUT') }),
    ]
    const out = buildSourceExcerpt(sources)
    const at = (tag: string) => out.indexOf(tag)
    expect(at('HOME')).toBeLessThan(at('ABOUT'))
    expect(at('ABOUT')).toBeLessThan(at('SERVICES'))
    expect(at('SERVICES')).toBeLessThan(at('CONTACT'))
  })

  it('treats story / mission / team paths as about-ish and pricing / classes as offering-ish', () => {
    const sources = [
      source({ url: 'https://kelp.co/journal', text: prose('OTHER') }),
      source({ url: 'https://kelp.co/pricing', text: prose('PRICING') }),
      source({ url: 'https://kelp.co/our-story', text: prose('STORY') }),
      source({ url: 'https://kelp.co/', text: prose('HOME') }),
    ]
    const out = buildSourceExcerpt(sources)
    expect(out.indexOf('STORY')).toBeLessThan(out.indexOf('PRICING'))
    expect(out.indexOf('PRICING')).toBeLessThan(out.indexOf('OTHER'))
  })

  it('falls back to the first page source as home when no page has a url', () => {
    const sources = [source({ text: prose('FIRST') }), source({ text: prose('SECOND') })]
    const out = buildSourceExcerpt(sources)
    expect(out.indexOf('FIRST')).toBeLessThan(out.indexOf('SECOND'))
  })

  it('puts search snippets last, after every page', () => {
    const sources = [
      source({ kind: 'search_result', url: 'https://directory.example/kelp', text: prose('SNIPPET') }),
      source({ url: 'https://kelp.co/contact', text: prose('CONTACT') }),
      source({ url: 'https://kelp.co/', text: prose('HOME') }),
    ]
    const out = buildSourceExcerpt(sources)
    expect(out.indexOf('SNIPPET')).toBeGreaterThan(out.indexOf('CONTACT'))
    expect(out.indexOf('HOME')).toBeLessThan(out.indexOf('CONTACT'))
  })

  it('drops search snippets entirely when the pages have eaten the budget', () => {
    const sources = [
      source({ url: 'https://kelp.co/', text: prose('HOME', 60) }),
      source({ kind: 'search_result', url: 'https://directory.example/kelp', text: prose('SNIPPET', 60) }),
    ]
    const out = buildSourceExcerpt(sources, { maxChars: 900, maxPerSource: 800 })
    expect(out).toContain('HOME')
    expect(out).not.toContain('SNIPPET')
  })
})

describe('buildSourceExcerpt: budget', () => {
  it('respects the total cap', () => {
    const sources = [
      source({ kind: 'paste', text: prose('PASTE', 200) }),
      source({ url: 'https://kelp.co/', text: prose('HOME', 200) }),
      source({ url: 'https://kelp.co/about', text: prose('ABOUT', 200) }),
    ]
    const out = buildSourceExcerpt(sources, { maxChars: 2_000 })
    expect(out.length).toBeLessThanOrEqual(2_000)
    expect(out.length).toBeGreaterThan(500)
  })

  it('respects the per-source cap and the larger paste cap', () => {
    const sources = [
      source({ kind: 'paste', url: undefined, text: prose('PASTE', 200) }),
      source({ url: 'https://kelp.co/', text: prose('HOME', 200) }),
    ]
    const out = buildSourceExcerpt(sources, { maxChars: 20_000, maxPerSource: 300, maxPaste: 900 })
    const [pasteChunk, homeChunk] = out.split('\n\n--- from ')
    expect(pasteChunk).toContain('PASTE')
    expect(pasteChunk.length).toBeLessThanOrEqual(900 + 200) // body cap plus the label line
    expect(homeChunk).toContain('HOME')
    expect(homeChunk.replace(/^[^\n]*\n\n/, '').length).toBeLessThanOrEqual(300)
  })

  it('cuts the last chunk on a sentence boundary, never mid-word', () => {
    const sources = [source({ url: 'https://kelp.co/', text: prose('HOME', 40) })]
    const out = buildSourceExcerpt(sources, { maxChars: 1_000, maxPerSource: 800 })
    expect(out.trimEnd().endsWith('.')).toBe(true)
  })

  it('uses the default caps when options are absent', () => {
    const sources = [source({ url: 'https://kelp.co/', text: prose('HOME', 2_000) })]
    const out = buildSourceExcerpt(sources)
    expect(out.length).toBeLessThanOrEqual(12_000)
    expect(out.length).toBeGreaterThan(2_900) // the 3k per-source default, minus the boundary cut
  })
})

describe('buildSourceExcerpt: labels', () => {
  it('labels each chunk with its url and title', () => {
    const sources = [source({ url: 'https://example.com/about', title: 'About Us', text: prose('ABOUT') })]
    const out = buildSourceExcerpt(sources)
    expect(out).toContain('--- from https://example.com/about (About Us)')
    expect(out.split('\n')[1]).toBe('') // blank line between the label and the text
  })

  it('labels a url-less paste without inventing a url', () => {
    const out = buildSourceExcerpt([source({ kind: 'paste', text: prose('PASTE') })])
    expect(out.startsWith('--- from operator paste\n\n')).toBe(true)
  })
})

describe('buildSourceExcerpt: de-boilerplating', () => {
  it('strips chrome but keeps the sentences verbatim', () => {
    const body = 'We have poured coffee on this corner since 1998. Every bean is roasted in the back room.'
    const sources = [
      source({
        url: 'https://kelp.co/',
        text: `Skip to main content\nMenu\n\n${body}\n\nThis website uses cookies to improve your experience.\n© 2026 Kelp. All rights reserved.\nPowered by SiteMaker`,
      }),
    ]
    const out = buildSourceExcerpt(sources)
    expect(out).toContain(body)
    expect(out).not.toMatch(/skip to main content/i)
    expect(out).not.toMatch(/cookies/i)
    expect(out).not.toMatch(/rights reserved/i)
    expect(out).not.toMatch(/powered by/i)
  })

  it('drops a nav line repeated across three or more sources, everywhere it appears', () => {
    const nav = 'Book a session'
    const make = (path: string, tag: string) =>
      source({ url: `https://kelp.co${path}`, text: `${nav}\n${prose(tag)}\n${nav}` })
    const out = buildSourceExcerpt([make('/', 'HOME'), make('/about', 'ABOUT'), make('/contact', 'CONTACT')])
    expect(out).toContain('HOME')
    expect(out).not.toContain(nav)
  })

  it('keeps a short line that appears on only two sources', () => {
    const line = 'Open Tuesday to Sunday'
    const make = (path: string, tag: string) => source({ url: `https://kelp.co${path}`, text: `${line}\n${prose(tag)}` })
    const out = buildSourceExcerpt([make('/', 'HOME'), make('/about', 'ABOUT')])
    expect(out).toContain(line)
  })
})

describe('stripBoilerplate', () => {
  it('collapses whitespace to at most one blank line between paragraphs', () => {
    expect(stripBoilerplate('One   sentence here.\n\n\n\nSecond   paragraph here.')).toBe(
      'One sentence here.\n\nSecond paragraph here.',
    )
  })

  it('drops chrome lines and very short lines', () => {
    const out = stripBoilerplate('Toggle navigation\n×\nok\nBack to top\nWe teach breathwork on Tuesdays.\nClose')
    expect(out).toBe('We teach breathwork on Tuesdays.')
  })

  it('keeps a real sentence that merely starts like a credit line', () => {
    const line = 'Designed with the same care we give every guest who walks through the door on a Tuesday morning in winter.'
    expect(stripBoilerplate(line)).toBe(line)
  })

  it('keeps a bakery sentence that mentions cookies', () => {
    const line = 'We bake cookies fresh every morning and use only butter.'
    expect(stripBoilerplate(line)).toBe(line)
  })

  it('drops the caller-supplied repeated nav lines', () => {
    const out = stripBoilerplate('Contact\nWe are on the corner of Elm and Main.', new Set(['contact']))
    expect(out).toBe('We are on the corner of Elm and Main.')
  })

  it('returns empty for junk input', () => {
    expect(stripBoilerplate('')).toBe('')
    expect(stripBoilerplate(undefined as unknown as string)).toBe('')
    expect(stripBoilerplate(null as unknown as string)).toBe('')
  })
})

describe('buildSourceExcerpt: malformed input never throws', () => {
  it('survives a non-array, nulls, and missing text', () => {
    expect(() => buildSourceExcerpt(null as unknown as HarvestedSource[])).not.toThrow()
    expect(buildSourceExcerpt(null as unknown as HarvestedSource[])).toBe('')
    expect(buildSourceExcerpt(undefined as unknown as HarvestedSource[])).toBe('')
    expect(buildSourceExcerpt({} as unknown as HarvestedSource[])).toBe('')

    const messy = [
      null,
      undefined,
      { id: 'a' },
      { id: 'b', kind: 'page', text: 42 },
      source({ url: 'https://kelp.co/', text: prose('HOME') }),
    ] as unknown as HarvestedSource[]
    const out = buildSourceExcerpt(messy)
    expect(out).toContain('HOME')
  })

  it('survives nonsense options and a source with a broken url', () => {
    const sources = [source({ url: 'not a url at all', text: prose('HOME') })]
    const out = buildSourceExcerpt(sources, { maxChars: -5, maxPerSource: 0, maxPaste: Number.NaN })
    expect(out).toContain('HOME')
    expect(out).toContain('--- from not a url at all')
  })
})
