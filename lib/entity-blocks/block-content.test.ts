import { describe, it, expect } from 'vitest'
import {
  sanitizeBlockStyle,
  sanitizeBlockContent,
  sanitizeContentMap,
  sanitizeStyleMap,
  fieldsForBlock,
  safeUrl,
} from './block-content'

// ADR-528: per-block content + style, validated on read + write.

describe('safeUrl', () => {
  it('keeps http(s) / mailto / tel / relative', () => {
    expect(safeUrl('https://x.com')).toBe('https://x.com')
    expect(safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(safeUrl('/spaces/x')).toBe('/spaces/x')
    expect(safeUrl('#anchor')).toBe('#anchor')
  })
  it('drops javascript: / data: / garbage', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('data:text/html,x')).toBe('')
    expect(safeUrl('  ')).toBe('')
    expect(safeUrl(42)).toBe('')
  })
})

describe('sanitizeBlockStyle', () => {
  it('keeps the safe subset and drops defaults', () => {
    expect(sanitizeBlockStyle({ background: true, pad: 'md', align: 'center' })).toEqual({
      background: true,
      pad: 'md',
      align: 'center',
    })
    // defaults (none / start) and a non-true background collapse away
    expect(sanitizeBlockStyle({ background: false, pad: 'none', align: 'start' })).toBeUndefined()
    expect(sanitizeBlockStyle({ pad: 'nope', align: 'weird' })).toBeUndefined()
  })
})

describe('fieldsForBlock', () => {
  it('gives content blocks their schema and data blocks the quick fields', () => {
    expect(fieldsForBlock('heading').map((f) => f.key)).toEqual(['text'])
    expect(fieldsForBlock('links').map((f) => f.type)).toEqual(['links'])
    expect(fieldsForBlock('offerings').map((f) => f.key)).toEqual(['title', 'intro'])
    expect(fieldsForBlock('nope')).toEqual([])
  })
})

describe('sanitizeBlockContent', () => {
  it('bounds text + keeps only schema keys', () => {
    expect(sanitizeBlockContent('heading', { text: '  Hi  ', bogus: 'x' })).toEqual({ text: 'Hi' })
    expect(sanitizeBlockContent('heading', { text: '' })).toBeUndefined()
  })
  it('sanitizes links (drops rows with no safe url, defaults label to url)', () => {
    const out = sanitizeBlockContent('links', {
      items: [
        { label: 'Site', url: 'https://x.com' },
        { label: 'Bad', url: 'javascript:1' },
        { url: 'https://y.com' },
      ],
    })
    expect(out).toEqual({ items: [{ label: 'Site', url: 'https://x.com' }, { label: 'https://y.com', url: 'https://y.com' }] })
  })
  it('sanitizes an image src + gallery urls', () => {
    expect(sanitizeBlockContent('image', { src: 'https://x/a.jpg', alt: 'A' })).toEqual({ src: 'https://x/a.jpg', alt: 'A' })
    expect(sanitizeBlockContent('gallery', { images: ['https://x/1.jpg', 'javascript:1', ''] })).toEqual({
      images: ['https://x/1.jpg'],
    })
  })
  it('keeps only title/intro for a data block', () => {
    expect(sanitizeBlockContent('offerings', { title: 'Services', intro: 'What we do', price: 9 })).toEqual({
      title: 'Services',
      intro: 'What we do',
    })
  })
  it('sanitizes a callout (ADR-542): text fields bounded, button url made safe, bad image dropped', () => {
    expect(
      sanitizeBlockContent('callout', {
        title: '  Join us  ',
        body: 'Come along',
        buttonLabel: 'Book',
        buttonUrl: 'https://x.com/book',
        image: 'javascript:1',
        bogus: 'x',
      }),
    ).toEqual({ title: 'Join us', body: 'Come along', buttonLabel: 'Book', buttonUrl: 'https://x.com/book' })
  })
  it('sanitizes features (ADR-542): drops items with no title and no text, bounds fields', () => {
    expect(
      sanitizeBlockContent('features', {
        items: [
          { icon: '⭐', title: 'Fast', text: 'Very fast' },
          { icon: 'x', title: '', text: '' }, // no title/text -> dropped
          { title: 'Only title' },
        ],
      }),
    ).toEqual({
      items: [
        { icon: '⭐', title: 'Fast', text: 'Very fast' },
        { icon: '', title: 'Only title', text: '' },
      ],
    })
  })
  it('features with no valid items returns undefined', () => {
    expect(sanitizeBlockContent('features', { items: [{ icon: 'x' }] })).toBeUndefined()
  })
})

describe('sanitizeContentMap / sanitizeStyleMap (block-id allowlist)', () => {
  it('drops unknown / dangerous block-id keys', () => {
    const content = sanitizeContentMap({ heading: { text: 'Hi' }, __proto__: { text: 'x' }, nope: { text: 'y' } })
    expect(Object.keys(content ?? {})).toEqual(['heading'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('drops empty entries', () => {
    expect(sanitizeContentMap({ heading: { text: '' } })).toBeUndefined()
    expect(sanitizeStyleMap({ heading: { pad: 'none' } })).toBeUndefined()
    expect(sanitizeStyleMap({ heading: { background: true } })).toEqual({ heading: { background: true } })
  })

  it('never writes a JSON __proto__ own-key (the real persisted-blob attack vector)', () => {
    // JSON.parse creates an OWN "__proto__" property (unlike an object literal). The allowlist iteration
    // never visits it, so it is neither read nor written — no prototype pollution.
    const raw = JSON.parse('{"__proto__": {"text": "x"}, "heading": {"text": "Hi"}}')
    const out = sanitizeContentMap(raw)
    expect(out).toEqual({ heading: { text: 'Hi' } })
    expect(({} as Record<string, unknown>).text).toBeUndefined()
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
  })
})
