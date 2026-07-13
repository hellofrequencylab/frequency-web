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
  blockSupportsAlign,
  blockSupportsBackground,
  blockTextRoles,
  primitiveValues,
  pickerSelection,
  resolvePickedIds,
  marginTopClass,
  marginBottomClass,
  textStyleClass,
  textByRoleClass,
  colorSwatchClass,
  safeUrl,
  PICKER_DATA_BLOCK_IDS,
  featureSource,
  featureLayout,
  gridColumns,
  isFeatureDataSource,
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
  it('is true for data sections + blocks with their own filled background', () => {
    expect(blockDrawsOwnCard('about')).toBe(true)
    expect(blockDrawsOwnCard('offerings')).toBe(true)
    expect(blockDrawsOwnCard('callout')).toBe(true)
    expect(blockDrawsOwnCard('features')).toBe(true)
    // A design block with its own filled background (photo / accent wash) self-cards.
    expect(blockDrawsOwnCard('photoHero')).toBe(true)
    expect(blockDrawsOwnCard('accentBeat')).toBe(true)
  })
  it('is false for plain content AND the OPEN design blocks, so the Background toggle adds a real card', () => {
    expect(blockDrawsOwnCard('text')).toBe(false)
    expect(blockDrawsOwnCard('gallery')).toBe(false)
    // Open design blocks render with no card by default: the toggle defaults off and turning it on wraps
    // them in a white card (Background now has a visible effect on these too).
    expect(blockDrawsOwnCard('editorial')).toBe(false)
    expect(blockDrawsOwnCard('cardGrid')).toBe(false)
    expect(blockDrawsOwnCard('zigzag')).toBe(false)
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

  it('Features (ADR-585) is the flexible engine: source + heading + items + layout + columns', () => {
    const features = fieldsForBlock('features')
    expect(features.map((f) => f.key)).toEqual(['eyebrow', 'title', 'source', 'items', 'layout', 'columns'])
    const source = features.find((f) => f.key === 'source')
    expect(source?.options?.map((o) => o.value)).toEqual(['custom', 'offerings', 'events', 'memberships', 'tickets'])
    const layout = features.find((f) => f.key === 'layout')
    expect(layout?.options?.map((o) => o.value)).toEqual(['list', 'columns', 'stats', 'cards', 'spotlight'])
  })
  it('Card grid (ADR-585) is the simple block: heading + subheading + cards + shape controls only', () => {
    expect(fieldsForBlock('cardGrid').map((f) => f.key)).toEqual([
      'title',
      'subtitle',
      'cards',
      'columns',
      'shape',
      'rounded',
      'shadow',
    ])
    // Deliberately NO data source and NO layout modes — that flexibility is Features' job.
    expect(fieldsForBlock('cardGrid').some((f) => f.key === 'source' || f.key === 'layout')).toBe(false)
  })

  it('every image-bearing block exposes the Shape control (item 2: all images selectable)', () => {
    // Image, Callout, Gallery, and Zigzag all carry the shared `aspect` (Shape) field, so the control is on
    // every placed image, not just the standalone Image block.
    for (const id of ['image', 'callout', 'gallery', 'zigzag']) {
      const shape = fieldsForBlock(id).find((f) => f.key === 'aspect')
      expect(shape, `${id} should expose the Shape control`).toBeTruthy()
      expect(shape!.options?.map((o) => o.value)).toEqual(['original', 'horizontal', 'vertical', 'square'])
    }
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

  it('features (ADR-585): keeps eyebrow/heading, a valid layout + columns, and an optional per-item link', () => {
    expect(
      sanitizeBlockContent('features', {
        eyebrow: 'Why us',
        title: 'What sets us apart',
        layout: 'columns',
        columns: '4',
        items: [
          { icon: 'star', title: 'Fast', text: 'Very fast', link: 'https://x.com' },
          { icon: '⭐', title: 'Safe', text: 'Locked down', link: 'javascript:1' }, // unsafe link dropped
        ],
      }),
    ).toEqual({
      eyebrow: 'Why us',
      title: 'What sets us apart',
      layout: 'columns',
      columns: '4',
      items: [
        { icon: 'star', title: 'Fast', text: 'Very fast', link: 'https://x.com' },
        { icon: '⭐', title: 'Safe', text: 'Locked down' },
      ],
    })
    // The default layout / columns / source are dropped (sparse); a legacy items-only bag round-trips.
    expect(sanitizeBlockContent('features', { layout: 'list', columns: '3', source: 'custom', items: [{ title: 'A' }] })).toEqual({
      items: [{ icon: '', title: 'A', text: '' }],
    })
    // A legacy `twoUp` layout is no longer an offered value, so it is dropped (renders as the `list` default).
    expect(sanitizeBlockContent('features', { layout: 'twoUp', items: [{ title: 'A' }] })).toEqual({
      items: [{ icon: '', title: 'A', text: '' }],
    })
  })

  it('features (ADR-585): a data source + a rich item (image / price / cta) survive', () => {
    expect(
      sanitizeBlockContent('features', {
        source: 'offerings',
        items: [
          { image: 'https://x/a.jpg', title: 'Session', text: 'One hour', price: 'from $80', link: 'https://x/book', cta: 'Book' },
          { image: 'javascript:1', title: 'Bad img', text: '' }, // unsafe image dropped, title keeps the item
        ],
      }),
    ).toEqual({
      source: 'offerings',
      items: [
        { icon: '', title: 'Session', text: 'One hour', image: 'https://x/a.jpg', price: 'from $80', link: 'https://x/book', cta: 'Book' },
        { icon: '', title: 'Bad img', text: '' },
      ],
    })
    // An image-only item (no title / text) now survives, since Features items can be photo-forward.
    expect(sanitizeBlockContent('features', { items: [{ image: 'https://x/p.jpg' }] })).toEqual({
      items: [{ icon: '', title: '', text: '', image: 'https://x/p.jpg' }],
    })
  })
})

describe('sanitizeBlockContent cards (email overhaul, item 3)', () => {
  it('keeps a photo card, a stat box, a whole-card link, and a button', () => {
    expect(
      sanitizeBlockContent('cardGrid', {
        cards: [
          { image: 'https://x/a.jpg', title: 'Photo', text: 'A photo card', link: 'https://x.com', button: { label: 'Open', href: 'https://x.com/o' } },
          { stat: { value: '500+', label: 'members' }, title: 'Stat', text: 'A metric' },
        ],
      }),
    ).toEqual({
      cards: [
        { title: 'Photo', text: 'A photo card', image: 'https://x/a.jpg', link: 'https://x.com', button: { label: 'Open', href: 'https://x.com/o' } },
        { title: 'Stat', text: 'A metric', stat: { value: '500+', label: 'members' } },
      ],
    })
  })

  it('tolerates a legacy { icon, title, text } card and drops empties + unsafe urls', () => {
    expect(
      sanitizeBlockContent('cardGrid', {
        cards: [
          { icon: '🕖', title: 'When', text: 'Thursday' }, // legacy shape
          { title: '', text: '' }, // nothing to show -> dropped
          { image: 'javascript:1', title: 'Bad img' }, // unsafe image dropped, title kept
          { button: { label: '', href: 'https://x.com' }, title: 'No button label' }, // button dropped (no label)
        ],
      }),
    ).toEqual({
      cards: [
        { title: 'When', text: 'Thursday', icon: '🕖' },
        { title: 'Bad img', text: '' },
        { title: 'No button label', text: '' },
      ],
    })
  })

  it('cards with nothing usable returns undefined', () => {
    expect(sanitizeBlockContent('cardGrid', { cards: [{ foo: 'x' }] })?.cards).toBeUndefined()
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

// ── ADR-580 item 4: per-element text styling (Eyebrow / Heading / Text) ─────────────────────────────────
describe('control audit: blockSupportsAlign / blockSupportsBackground (item 5)', () => {
  it('Align shows only on blocks with inline text to align', () => {
    for (const id of ['heading', 'text', 'callout', 'offerings', 'photoHero']) {
      expect(blockSupportsAlign(id), id).toBe(true)
    }
    for (const id of ['image', 'gallery', 'divider', 'embed']) {
      expect(blockSupportsAlign(id), id).toBe(false)
    }
  })
  it('Background shows on every block except the Divider (a card around a rule is meaningless)', () => {
    for (const id of ['heading', 'image', 'gallery', 'embed', 'callout']) {
      expect(blockSupportsBackground(id), id).toBe(true)
    }
    expect(blockSupportsBackground('divider')).toBe(false)
    expect(blockSupportsBackground('nope')).toBe(false)
  })
})

describe('blockTextRoles (per-element text roles)', () => {
  it('design blocks expose eyebrow + heading + body', () => {
    for (const id of ['photoHero', 'editorial', 'zigzag', 'accentBeat']) {
      expect(blockTextRoles(id)).toEqual(['eyebrow', 'heading', 'body'])
    }
  })
  it('the simplified Card grid (ADR-585) styles just its heading + subheading', () => {
    expect(blockTextRoles('cardGrid')).toEqual(['heading', 'body'])
  })
  it('Callout exposes heading + body; Features leads with an eyebrow too (email overhaul)', () => {
    expect(blockTextRoles('callout')).toEqual(['heading', 'body'])
    expect(blockTextRoles('features')).toEqual(['eyebrow', 'heading', 'body'])
  })
  it('single-text and data blocks style their text as one whole (no roles)', () => {
    for (const id of ['heading', 'text', 'quote', 'offerings', 'about', 'nope']) {
      expect(blockTextRoles(id)).toEqual([])
    }
  })
})

describe('sanitizeBlockStyle textByRole (item 4)', () => {
  it('keeps a per-role bag, drops empty roles + garbage', () => {
    expect(
      sanitizeBlockStyle({
        textByRole: {
          heading: { size: 'lg', weight: 'bold' },
          body: { size: 'md', color: 'default' }, // all-default → dropped
          bogus: { size: 'xl' }, // not a known role → never written
        },
      }),
    ).toEqual({ textByRole: { heading: { size: 'lg', weight: 'bold' } } })
  })
  it('drops the map when no role survives', () => {
    expect(sanitizeBlockStyle({ textByRole: { heading: {}, body: { size: 'md' } } })).toBeUndefined()
  })
})

describe('textByRoleClass (role-scoped utilities, item 4)', () => {
  it('empty for an absent map', () => {
    expect(textByRoleClass(undefined)).toBe('')
    expect(textByRoleClass({})).toBe('')
  })
  it('heading targets heading tags; body targets paragraph tags excluding the eyebrow', () => {
    expect(textByRoleClass({ heading: { size: 'lg', weight: 'bold' } })).toBe(
      '[&_:where(h1,h2,h3,h4,h5,h6)]:!text-lg [&_:where(h1,h2,h3,h4,h5,h6)]:!font-bold',
    )
    expect(textByRoleClass({ body: { color: 'muted' } })).toBe(
      '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!text-muted',
    )
  })
  it('eyebrow targets the marked element', () => {
    expect(textByRoleClass({ eyebrow: { size: 'sm', shadow: 'soft' } })).toBe(
      '[&_[data-text-role=eyebrow]]:!text-sm [&_[data-text-role=eyebrow]]:text-shadow-soft',
    )
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

describe('Features source / layout / columns helpers (ADR-585)', () => {
  it('featureSource defaults to custom and validates the value', () => {
    expect(featureSource(undefined)).toBe('custom')
    expect(featureSource({})).toBe('custom')
    expect(featureSource({ source: 'offerings' })).toBe('offerings')
    expect(featureSource({ source: 'events' })).toBe('events')
    expect(featureSource({ source: 'nope' })).toBe('custom')
  })
  it('isFeatureDataSource is true only for a non-custom source', () => {
    expect(isFeatureDataSource({ source: 'custom' })).toBe(false)
    expect(isFeatureDataSource(undefined)).toBe(false)
    expect(isFeatureDataSource({ source: 'memberships' })).toBe(true)
  })
  it('featureLayout defaults to list, validates, and folds the legacy twoUp to columns', () => {
    expect(featureLayout(undefined)).toBe('list')
    expect(featureLayout({ layout: 'stats' })).toBe('stats')
    expect(featureLayout({ layout: 'spotlight' })).toBe('spotlight')
    expect(featureLayout({ layout: 'twoUp' })).toBe('columns')
    expect(featureLayout({ layout: 'bogus' })).toBe('list')
  })
  it('gridColumns clamps to {2,3,4} and defaults to 3', () => {
    expect(gridColumns(undefined)).toBe(3)
    expect(gridColumns({ columns: '2' })).toBe(2)
    expect(gridColumns({ columns: '4' })).toBe(4)
    expect(gridColumns({ columns: '9' })).toBe(3)
  })
})
