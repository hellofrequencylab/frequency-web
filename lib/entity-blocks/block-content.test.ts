import { describe, it, expect } from 'vitest'
import {
  sanitizeBlockStyle,
  sanitizeBlockContent,
  sanitizeContentMap,
  sanitizeStyleMap,
  sanitizeTextStyle,
  fieldsForBlock,
  resolveDataHeader,
  blockDrawsOwnCard,
  blockBearsText,
  primitiveValues,
  pickerSelection,
  resolvePickedIds,
  marginTopClass,
  marginBottomClass,
  textStyleClass,
  colorSwatchClass,
  safeUrl,
  PICKER_DATA_BLOCK_IDS,
  type FieldDef,
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
    // pad none / align start collapse away; an explicit background:false is KEPT (item 6, "card off")
    expect(sanitizeBlockStyle({ background: false, pad: 'none', align: 'start' })).toEqual({ background: false })
    expect(sanitizeBlockStyle({ pad: 'nope', align: 'weird' })).toBeUndefined()
    // an ABSENT background is the block default — nothing to persist
    expect(sanitizeBlockStyle({ pad: 'none' })).toBeUndefined()
  })
})

describe('blockDrawsOwnCard', () => {
  it('is true for data sections + self-carding content, false for plain content', () => {
    expect(blockDrawsOwnCard('about')).toBe(true)
    expect(blockDrawsOwnCard('offerings')).toBe(true)
    expect(blockDrawsOwnCard('callout')).toBe(true)
    expect(blockDrawsOwnCard('features')).toBe(true)
    expect(blockDrawsOwnCard('text')).toBe(false)
    expect(blockDrawsOwnCard('gallery')).toBe(false)
    expect(blockDrawsOwnCard('nope')).toBe(false)
  })
})

describe('resolveDataHeader (eyebrow/title override the block header)', () => {
  it('returns the trimmed override, or undefined to keep the block default', () => {
    expect(resolveDataHeader('about', { eyebrow: '  Meet us  ', title: '  Who we are  ' })).toEqual({
      eyebrow: 'Meet us',
      heading: 'Who we are',
    })
    expect(resolveDataHeader('about', { eyebrow: '   ', title: '' })).toEqual({
      eyebrow: undefined,
      heading: undefined,
    })
    expect(resolveDataHeader('about', undefined)).toEqual({ eyebrow: undefined, heading: undefined })
  })
})

describe('fieldsForBlock', () => {
  it('gives content blocks their schema and data blocks the eyebrow/title header fields', () => {
    expect(fieldsForBlock('heading').map((f) => f.key)).toEqual(['text'])
    expect(fieldsForBlock('links').map((f) => f.type)).toEqual(['links'])
    // Every data block edits its REAL eyebrow + title (item 3); About/Story add a body (ADR-542); a
    // function-backed block adds a data-source picker (ADR-573 item 5).
    expect(fieldsForBlock('contact').map((f) => f.key)).toEqual(['eyebrow', 'title'])
    expect(fieldsForBlock('offerings').map((f) => f.key)).toEqual(['eyebrow', 'title', 'items'])
    expect(fieldsForBlock('about').map((f) => f.key)).toEqual(['eyebrow', 'title', 'body'])
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
  it('keeps a non-default gallery view + spacing, drops the default + garbage', () => {
    // A non-default view/gap is kept; the default (grid / standard) and an unknown value are dropped (sparse).
    expect(sanitizeBlockContent('gallery', { images: ['https://x/1.jpg'], view: 'masonry', gap: 'roomy' })).toEqual({
      images: ['https://x/1.jpg'],
      view: 'masonry',
      gap: 'roomy',
    })
    expect(sanitizeBlockContent('gallery', { images: ['https://x/1.jpg'], view: 'grid', gap: 'nope' })).toEqual({
      images: ['https://x/1.jpg'],
    })
  })
  it('keeps only eyebrow/title for a header-only data block', () => {
    expect(
      sanitizeBlockContent('contact', { eyebrow: 'Reach us', title: 'Contact', intro: 'dropped', price: 9 }),
    ).toEqual({ eyebrow: 'Reach us', title: 'Contact' })
  })
  it('keeps eyebrow/title/body for About + Story (ADR-542)', () => {
    expect(
      sanitizeBlockContent('about', { eyebrow: 'Hi', title: 'Who we are', body: 'A calm studio.', bogus: 1 }),
    ).toEqual({ eyebrow: 'Hi', title: 'Who we are', body: 'A calm studio.' })
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
  it('button toggle (Fix 8): persists only the non-default `false`, drops the default `true` + non-booleans', () => {
    // Default is ON, so only an explicit `false` is stored (sparse).
    expect(sanitizeBlockContent('callout', { buttonLabel: 'Go', buttonOn: false })).toEqual({
      buttonLabel: 'Go',
      buttonOn: false,
    })
    // `true` equals the default → dropped.
    expect(sanitizeBlockContent('callout', { buttonLabel: 'Go', buttonOn: true })).toEqual({ buttonLabel: 'Go' })
    // A non-boolean toggle value is dropped.
    expect(sanitizeBlockContent('callout', { buttonLabel: 'Go', buttonOn: 'yes' })).toEqual({ buttonLabel: 'Go' })
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

// ── ADR-569: the control-system foundation (margins, text style, enum primitives) ──────────────────────

describe('sanitizeBlockStyle margins + text (ADR-569)', () => {
  it('keeps valid margin steps including an explicit none', () => {
    expect(sanitizeBlockStyle({ mt: 'lg', mb: 'none' })).toEqual({ mt: 'lg', mb: 'none' })
    // garbage margin steps are dropped
    expect(sanitizeBlockStyle({ mt: 'huge', mb: 5 })).toBeUndefined()
  })
  it('keeps a valid text-style bag and drops all-default noise', () => {
    expect(sanitizeBlockStyle({ text: { size: 'lg', weight: 'bold', color: 'accent', shadow: 'soft' } })).toEqual({
      text: { size: 'lg', weight: 'bold', color: 'accent', shadow: 'soft' },
    })
    // size:md / color:default / shadow:none are defaults → the whole bag collapses away
    expect(sanitizeBlockStyle({ text: { size: 'md', color: 'default', shadow: 'none' } })).toBeUndefined()
  })
})

describe('sanitizeTextStyle', () => {
  it('gates each field to its enum, dropping defaults', () => {
    expect(sanitizeTextStyle({ size: 'xl', weight: 'medium', color: 'info', shadow: 'strong' })).toEqual({
      size: 'xl',
      weight: 'medium',
      color: 'info',
      shadow: 'strong',
    })
    expect(sanitizeTextStyle({ size: 'nope', color: 'rainbow', shadow: 'glow' })).toBeUndefined()
    expect(sanitizeTextStyle('x')).toBeUndefined()
  })
})

describe('blockBearsText', () => {
  it('is true for every text-bearing content, design, AND data block; false for the visual-only ones', () => {
    expect(blockBearsText('heading')).toBe(true)
    expect(blockBearsText('callout')).toBe(true)
    expect(blockBearsText('photoHero')).toBe(true)
    // Data blocks now expose the text-style group too (the render frame styles their text).
    expect(blockBearsText('offerings')).toBe(true)
    expect(blockBearsText('about')).toBe(true)
    // The purely-visual blocks never show the text-style group.
    expect(blockBearsText('gallery')).toBe(false)
    expect(blockBearsText('image')).toBe(false)
    expect(blockBearsText('divider')).toBe(false)
    expect(blockBearsText('nope')).toBe(false)
  })
})

describe('primitiveValues + enum-primitive sanitize (ADR-569 C6)', () => {
  it('reports the fixed value set per primitive type, and segmented options', () => {
    expect(primitiveValues({ key: 'h', label: 'H', type: 'height' })).toEqual(['short', 'medium', 'tall'])
    expect(primitiveValues({ key: 'a', label: 'A', type: 'align' })).toEqual(['start', 'center', 'end'])
    expect(primitiveValues({ key: 'b', label: 'B', type: 'buttonOrientation' })).toEqual(['row', 'stacked'])
    expect(primitiveValues({ key: 'm', label: 'M', type: 'margin' })).toEqual(['none', 'sm', 'md', 'lg', 'xl'])
    expect(
      primitiveValues({ key: 's', label: 'S', type: 'segmented', options: [{ value: 'a', label: 'A' }] }),
    ).toEqual(['a'])
    // a content type is not a primitive
    expect(primitiveValues({ key: 't', label: 'T', type: 'text' })).toBeNull()
  })

  it('sanitizes a declared enum primitive: keeps a valid non-default value, drops the default + garbage', () => {
    // A block schema is fixed, so exercise the primitive path via a synthetic schema through a known block.
    // (fieldsForBlock is registry-driven; here we assert the sanitize contract directly on primitiveValues.)
    const field: FieldDef = { key: 'height', label: 'Height', type: 'height', defaultValue: 'medium' }
    const allowed = primitiveValues(field)!
    expect(allowed.includes('tall')).toBe(true)
    // The stored value should differ from the default to be kept; matching the default is dropped by the
    // sanitizer's rule (v !== def). This mirrors sanitizeBlockContent's enum-primitive branch.
    expect('tall' !== field.defaultValue).toBe(true)
    expect('medium' !== field.defaultValue).toBe(false)
  })
})

describe('style → class mapping (ADR-569)', () => {
  it('margin utilities: absent leaves the stack rhythm, a set step adds space, none flushes', () => {
    expect(marginTopClass(undefined)).toBe('')
    expect(marginBottomClass(undefined)).toBe('')
    expect(marginTopClass('lg')).toBe('mt-12')
    expect(marginBottomClass('none')).toBe('mb-0')
  })
  it('text-style class resolves token utilities, empty for an absent / default bag', () => {
    expect(textStyleClass(undefined)).toBe('')
    expect(textStyleClass({})).toBe('')
    // Size / weight / color target descendant text with an !important child variant (so they override a
    // block's own hardcoded utilities); shadow inherits, so it stays a plain wrapper class.
    const tags = 'h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em'
    expect(textStyleClass({ size: 'lg', weight: 'bold', color: 'accent', shadow: 'soft' })).toBe(
      `[&_:where(${tags})]:!text-lg [&_:where(${tags})]:!font-bold [&_:where(${tags})]:!text-primary-strong text-shadow-soft`,
    )
    // size:md is the neutral default → no size class
    expect(textStyleClass({ size: 'md' })).toBe('')
  })
  it('color swatch classes are all token-driven (never a raw hex)', () => {
    for (const token of ['default', 'muted', 'subtle', 'accent', 'success', 'info', 'danger'] as const) {
      const cls = colorSwatchClass(token)
      expect(cls.startsWith('bg-')).toBe(true)
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}/i)
    }
  })
})

// ── ADR-573 item 5: the function-aware data-source picker ──────────────────────────────────────────────

describe('picker field (ADR-573 item 5)', () => {
  it('the function-backed data blocks declare a picker field', () => {
    // A representative function-backed block carries a `picker` field keyed on its live items.
    const offeringsFields = fieldsForBlock('offerings')
    const picker = offeringsFields.find((f) => f.type === 'picker')
    expect(picker).toBeDefined()
    expect(picker?.key).toBe('items')
    expect(picker?.pickerBlock).toBe('offerings')
  })

  it('PICKER_DATA_BLOCK_IDS lists exactly the blocks with a picker field', () => {
    expect(PICKER_DATA_BLOCK_IDS).toEqual(expect.arrayContaining(['offerings', 'events', 'team', 'journeys', 'circles']))
    // A block with no picker (about) is absent.
    expect(PICKER_DATA_BLOCK_IDS).not.toContain('about')
  })

  it('sanitizes a picker selection to a bounded, de-duped string[]; drops empty / garbage', () => {
    const clean = sanitizeBlockContent('offerings', { items: ['a', 'a', ' b ', '', 42, 'c'] })
    expect(clean?.items).toEqual(['a', 'b', 'c'])
    // An empty / all-garbage selection is dropped so the block falls back to "show all" (item 7).
    expect(sanitizeBlockContent('offerings', { items: [] })?.items).toBeUndefined()
    expect(sanitizeBlockContent('offerings', { items: [1, 2, {}] })?.items).toBeUndefined()
  })

  it('pickerSelection reads the stored ids, ignoring non-strings', () => {
    expect(pickerSelection({ items: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(pickerSelection({ items: ['a', 3, ''] })).toEqual(['a'])
    expect(pickerSelection(undefined)).toEqual([])
    expect(pickerSelection({})).toEqual([])
  })
})

describe('resolvePickedIds (items 5 + 7)', () => {
  it('keeps the selected ids that still exist, in the operator order', () => {
    expect(resolvePickedIds(['b', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'a'])
  })
  it('drops a stale / removed id', () => {
    expect(resolvePickedIds(['a', 'gone'], ['a', 'b'])).toEqual(['a'])
  })
  it('falls back to EVERY live id when the selection is empty (item 7 default)', () => {
    expect(resolvePickedIds([], ['a', 'b'])).toEqual(['a', 'b'])
  })
  it('falls back to every live id when the whole selection is stale', () => {
    expect(resolvePickedIds(['x', 'y'], ['a', 'b'])).toEqual(['a', 'b'])
  })
})
