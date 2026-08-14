import { describe, it, expect } from 'vitest'
import {
  planToLayout,
  reseedBlockCopy,
  buildComposeUserPrompt,
  COMPOSE_SYSTEM,
  type ComposedSection,
} from './compose'
import type { BusinessProfile } from './schema'
import type { EntityLayout } from '@/lib/entity-blocks/layout'
import { sanitizeEntityLayout } from '@/lib/entity-blocks/layout'

// planToLayout is the PURE core of the AI composer: it turns the model's chosen BANDS into a safe
// EntityLayout. The model call is untestable in CI; these lock the block allowlist, the per-block bags and
// their real control fields, image-by-index resolution, the band grouping (bands 1 to 3 into one opening
// row, a band title into a row header, columns pairing), the DERIVED brand tuning (features layout, card
// shape, gallery view, photo side), the CTA whose destination never comes from the model, the "each block
// once / drop-empty / too-thin" rules, and the guaranteed Contact + Business close.
//
// buildComposeUserPrompt is the PURE prompt builder, so the verbatim source excerpt reaching the model is
// testable without spending a model call.

const profile: BusinessProfile = { name: 'Vista Retreat', type: 'business', tagline: 'Rest here' }
const gallery = ['https://cdn.example/g0.jpg', 'https://cdn.example/g1.jpg']
const bigGallery = [
  'https://cdn.example/g0.jpg',
  'https://cdn.example/g1.jpg',
  'https://cdn.example/g2.jpg',
  'https://cdn.example/g3.jpg',
]

function ids(layout: EntityLayout | null): string[] {
  return (layout?.rows ?? []).flatMap((r) => r.cells.flat())
}

/** Every string anywhere in a value (rows, content bags, nested cards). */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) allStrings(v, out)
  return out
}

describe('planToLayout builds a safe, sectioned marketing layout', () => {
  it('names each section as a row header, drops unknown blocks (and the never-seeded photoHero)', () => {
    const sections: ComposedSection[] = [
      { title: 'Our place', blocks: [{ block: 'zigzag', title: 'A calm room', body: 'A calm room.', imageIndex: 1 }] },
      { title: 'Nope', blocks: [{ block: 'photoHero', title: 'Vista Retreat', imageIndex: 0 }, { block: 'nonsense' }] },
      { title: 'What we offer', blocks: [{ block: 'cardGrid', title: 'Rooms', cards: [{ title: 'Room', text: 'A room' }] }] },
    ]
    const layout = planToLayout(sections, profile, gallery)!
    // Unknown + photoHero drop; the middle section then has no blocks, so it contributes no row/header.
    // Contact + Business are guaranteed to close the page.
    expect(ids(layout)).toEqual(['zigzag', 'cardGrid', 'contact', 'business'])
    // A section title becomes the row's live header.
    const zigRow = layout.rows!.find((r) => r.cells.flat().includes('zigzag'))!
    expect(zigRow.title).toBe('Our place')
    expect(zigRow.headerOn).toBe(true)
    // zigzag resolves its image by index (the second gallery photo).
    expect(layout.content?.zigzag).toMatchObject({ title: 'A calm room', body: 'A calm room.', image: 'https://cdn.example/g1.jpg' })
    expect(layout.content?.cardGrid).toMatchObject({ cards: [{ icon: '', title: 'Room', text: 'A room' }] })
  })

  it('pairs two blocks into a 2-column row when the section asks for columns', () => {
    const layout = planToLayout(
      [{ title: 'Plan a visit', columns: 2, blocks: [{ block: 'offerings' }, { block: 'booking' }] }],
      profile,
      gallery,
    )!
    const row = layout.rows!.find((r) => r.columns === 2)!
    expect(row.cells).toEqual([['offerings'], ['booking']])
    expect(row.title).toBe('Plan a visit')
  })

  it('downgrades a 2-column section to one column when only one block survives', () => {
    const layout = planToLayout(
      [
        { title: 'Solo', columns: 2, blocks: [{ block: 'about' }] },
        { title: 'More', blocks: [{ block: 'story' }] },
      ],
      profile,
      gallery,
    )!
    const row = layout.rows!.find((r) => r.cells.flat().includes('about'))!
    expect(row.columns).toBe(1)
    expect(row.cells).toEqual([['about']])
  })

  it('places each block at most once across sections (first wins)', () => {
    const layout = planToLayout(
      [
        { title: 'One', blocks: [{ block: 'prose', body: 'First.' }] },
        { title: 'Two', blocks: [{ block: 'prose', body: 'Second.' }, { block: 'contact' }] },
      ],
      profile,
      gallery,
    )!
    expect(ids(layout).filter((b) => b === 'prose')).toHaveLength(1)
    expect(layout.content?.prose).toEqual({ text: 'First.' })
  })

  it('drops an authored block with no usable copy', () => {
    const layout = planToLayout(
      [{ title: 'Intro', blocks: [{ block: 'editorial' }, { block: 'about' }, { block: 'story' }] }],
      profile,
      gallery,
    )!
    expect(ids(layout)).not.toContain('editorial')
    expect(ids(layout)).toContain('about')
  })

  it('resolves cards + strips em dashes from generated copy', () => {
    const layout = planToLayout(
      [
        { title: 'Why us', blocks: [{ block: 'features', cards: [{ title: 'Calm', text: 'A quiet room — always' }, { title: '', text: '' }] }] },
        { title: 'About', blocks: [{ block: 'about' }] },
      ],
      profile,
      gallery,
    )!
    // Empty card dropped; em dash stripped (" — " becomes ", "). The bag also carries the DERIVED layout.
    expect(layout.content?.features).toMatchObject({ items: [{ icon: '', title: 'Calm', text: 'A quiet room, always' }] })
    expect((layout.content?.features as { items: unknown[] }).items).toHaveLength(1)
  })

  it('always closes with Contact + Business, and pairs them when both are missing', () => {
    const layout = planToLayout(
      [{ title: 'About', blocks: [{ block: 'about' }, { block: 'story' }] }],
      profile,
      gallery,
    )!
    expect(ids(layout)).toContain('contact')
    expect(ids(layout)).toContain('business')
    const findUs = layout.rows!.find((r) => r.title === 'Find us')!
    expect(findUs.columns).toBe(2)
    expect(findUs.cells).toEqual([['contact'], ['business']])
  })

  it('does not re-append a core block the model already placed', () => {
    const layout = planToLayout(
      [
        { title: 'About', blocks: [{ block: 'about' }] },
        { title: 'Reach us', blocks: [{ block: 'contact' }, { block: 'business' }] },
      ],
      profile,
      gallery,
    )!
    expect(ids(layout).filter((b) => b === 'contact')).toHaveLength(1)
    expect(ids(layout).filter((b) => b === 'business')).toHaveLength(1)
    // No extra "Find us" row was appended.
    expect(layout.rows!.some((r) => r.title === 'Find us')).toBe(false)
  })

  it('ignores an out-of-range imageIndex', () => {
    const layout = planToLayout(
      [
        { title: 'Beat', blocks: [{ block: 'zigzag', body: 'A beat.', imageIndex: 9 }] },
        { title: 'About', blocks: [{ block: 'about' }] },
      ],
      profile,
      gallery,
    )!
    expect(layout.content?.zigzag).toEqual({ body: 'A beat.' }) // no image key
  })

  it('returns null when the model places fewer than two real blocks (keep the deterministic layout)', () => {
    // The single authored block is dropped for empty copy, so the model placed nothing: too thin to
    // override, regardless of the guaranteed core (which only tops up a real page).
    expect(planToLayout([{ blocks: [{ block: 'editorial' }] }], profile, gallery)).toBeNull()
    expect(planToLayout([{ blocks: [{ block: 'contact' }] }], profile, gallery)).toBeNull()
  })
})

// ── The BAND SPINE ────────────────────────────────────────────────────────────────────────────────────

describe('the band spine shapes the page', () => {
  /** A full spine, close to the reference page (slug `danieltyack`). */
  const spine: ComposedSection[] = [
    { band: 1, blocks: [{ block: 'editorial', eyebrow: 'this might be you', body: 'You keep pushing.<br><br>You are tired.' }] },
    { band: 2, blocks: [{ block: 'zigzag', eyebrow: 'finding myself', title: 'How I got here', body: 'I burned out.', imageIndex: 0 }] },
    {
      band: 3,
      blocks: [
        {
          block: 'cardGrid',
          title: 'How it works',
          cards: [
            { icon: '1', title: 'Meet', text: 'We talk.' },
            { icon: '2', title: 'Plan', text: 'We map it.' },
            { icon: '3', title: 'Practice', text: 'You do it.' },
          ],
        },
      ],
    },
    {
      band: 4,
      blocks: [
        {
          block: 'features',
          eyebrow: 'the work so far',
          title: 'What we have done',
          cards: [
            { title: '1,000+', text: 'public guided meditations' },
            { title: '5+ years', text: 'teaching in person' },
            { title: '30+', text: 'retreats hosted' },
          ],
        },
      ],
    },
    { band: 5, blocks: [{ block: 'gallery' }] },
    { band: 6, columns: 2, blocks: [{ block: 'offerings' }, { block: 'booking' }] },
    { band: 7, blocks: [{ block: 'faq' }] },
    { band: 8, blocks: [{ block: 'accentBeat', title: 'Come sit with us', body: 'Sessions run all week.', buttonLabel: 'Book a session' }] },
    { band: 9, title: 'Contact and details', columns: 2, blocks: [{ block: 'contact' }, { block: 'business' }] },
  ]

  it('groups bands 1 to 3 into ONE untitled opening row, in order', () => {
    const layout = planToLayout(spine, profile, bigGallery)!
    const opening = layout.rows![0]
    expect(opening.columns).toBe(1)
    expect(opening.cells).toEqual([['editorial', 'zigzag', 'cardGrid']])
    expect(opening.title).toBeUndefined()
    expect(opening.headerOn).toBeUndefined()
  })

  it('gives every later band its own row, in spine order, and keeps its title', () => {
    const layout = planToLayout(spine, profile, bigGallery)!
    expect(layout.rows!.map((r) => r.cells.flat())).toEqual([
      ['editorial', 'zigzag', 'cardGrid'],
      ['features'],
      ['gallery'],
      ['offerings', 'booking'],
      ['faq'],
      ['accentBeat'],
      ['contact', 'business'],
    ])
    const findUs = layout.rows!.at(-1)!
    expect(findUs.title).toBe('Contact and details')
    expect(findUs.headerOn).toBe(true)
    expect(findUs.columns).toBe(2)
  })

  it('accepts the spine alternates (prose, editorial, features list, image, cardGrid, events, reviews)', () => {
    const alternates: ComposedSection[] = [
      { band: 1, blocks: [{ block: 'prose', body: 'One room, open all week.' }] },
      { band: 2, blocks: [{ block: 'editorial', title: 'Our story', body: 'We started in a garage.' }] },
      { band: 3, blocks: [{ block: 'features', layout: 'list', cards: [{ title: 'Call', text: 'Ring us.' }] }] },
      { band: 4, blocks: [{ block: 'reviews' }] },
      { band: 5, blocks: [{ block: 'image', imageIndex: 1, alt: 'The front room' }] },
      { band: 6, blocks: [{ block: 'events' }] },
    ]
    const layout = planToLayout(alternates, profile, gallery)!
    expect(ids(layout)).toEqual(['prose', 'editorial', 'features', 'reviews', 'image', 'events', 'contact', 'business'])
    // The band 3 alternate is features in the LIST layout, which is the block's own default, so it is kept
    // out of the bag (sparse) and renders as a list. The point is that it was NOT overridden to cards.
    expect(layout.content?.features).not.toHaveProperty('layout')
    expect(layout.content?.image).toEqual({ src: 'https://cdn.example/g1.jpg', alt: 'The front room' })
  })

  it('drops the band 5 gallery when there are no photos', () => {
    const layout = planToLayout(
      [
        { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
        { band: 5, blocks: [{ block: 'gallery' }] },
        { band: 6, blocks: [{ block: 'offerings' }] },
      ],
      profile,
      [],
    )!
    expect(ids(layout)).not.toContain('gallery')
  })

  it('carries every placed block through the real layout sanitizer', () => {
    const layout = planToLayout(spine, profile, bigGallery)!
    const clean = sanitizeEntityLayout(layout, 'space')!
    expect(clean.rows!.flatMap((r) => r.cells.flat())).toEqual(ids(layout))
    // The control fields survive the sanitizer (they are declared on the real block schemas).
    expect(clean.content?.gallery).toMatchObject({ view: 'masonry', gap: 'roomy' })
    expect(clean.content?.features).toMatchObject({ layout: 'stats' })
  })
})

// ── The block CONTROLS the composer may now set ───────────────────────────────────────────────────────

describe('block control fields survive planToLayout', () => {
  const controls: ComposedSection[] = [
    {
      band: 4,
      blocks: [
        {
          block: 'features',
          layout: 'spotlight',
          columns: '4',
          cards: [{ title: 'Care', text: 'We show up.', icon: 'heart' }],
        },
      ],
    },
    {
      band: 3,
      blocks: [
        {
          block: 'cardGrid',
          title: 'Packages',
          subtitle: 'Pick one',
          columns: '2',
          rounded: false,
          shadow: false,
          cards: [{ title: 'Half day', text: 'Four hours.', imageIndex: 0 }],
        },
      ],
    },
    { band: 2, blocks: [{ block: 'zigzag', body: 'A beat.', imageIndex: 1, alt: 'A room', mediaSide: 'right', aspect: 'square' }] },
    { band: 5, blocks: [{ block: 'gallery', view: 'carousel', gap: 'tight' }] },
  ]

  it('keeps the features layout, columns, and per-item icon', () => {
    const layout = planToLayout(controls, profile, gallery)!
    expect(layout.content?.features).toMatchObject({
      layout: 'spotlight',
      columns: '4',
      items: [{ icon: 'heart', title: 'Care', text: 'We show up.' }],
    })
  })

  it('keeps the cardGrid subtitle, columns, rounded, shadow, and per-card image', () => {
    const layout = planToLayout(controls, profile, gallery)!
    expect(layout.content?.cardGrid).toMatchObject({
      title: 'Packages',
      subtitle: 'Pick one',
      columns: '2',
      rounded: false,
      shadow: false,
      cards: [{ title: 'Half day', text: 'Four hours.', image: 'https://cdn.example/g0.jpg' }],
    })
  })

  it('keeps the zigzag mediaSide, aspect, and alt', () => {
    const layout = planToLayout(controls, profile, gallery)!
    expect(layout.content?.zigzag).toMatchObject({
      image: 'https://cdn.example/g1.jpg',
      alt: 'A room',
      mediaSide: 'right',
      aspect: 'square',
    })
  })

  it('keeps an explicit gallery view + gap over the derived one', () => {
    const layout = planToLayout(controls, profile, gallery)!
    expect(layout.content?.gallery).toMatchObject({ view: 'carousel', gap: 'tight', images: gallery })
  })

  it('drops a control value that is not one of the block fields own options', () => {
    const layout = planToLayout(
      [
        { band: 2, blocks: [{ block: 'zigzag', body: 'A beat.', imageIndex: 0, mediaSide: 'sideways', aspect: 'oval' }] },
        { band: 3, blocks: [{ block: 'cardGrid', columns: '9', shape: 'diagonal', cards: [{ title: 'Step', text: 'Do it.' }] }] },
      ],
      profile,
      gallery,
    )!
    expect(layout.content?.zigzag).not.toHaveProperty('aspect')
    expect(layout.content?.zigzag!.mediaSide).toBeUndefined()
    expect(layout.content?.cardGrid).not.toHaveProperty('columns')
    // The bad shape falls back to the DERIVED one (no card photos here, so the default `top`, dropped sparse).
    expect(layout.content?.cardGrid).not.toHaveProperty('shape')
  })
})

// ── DERIVED brand tuning (signals decide, not the model) ──────────────────────────────────────────────

describe('brand tuning is derived from real signals', () => {
  const stats: ComposedSection[] = [
    {
      band: 4,
      blocks: [
        {
          block: 'features',
          cards: [
            { title: '1,000+', text: 'guided meditations' },
            { title: '5+ years', text: 'teaching' },
            { title: '30+', text: 'retreats' },
          ],
        },
      ],
    },
    { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
  ]

  it('features layout is stats when most items read as numbers or durations', () => {
    const layout = planToLayout(stats, profile, gallery)!
    expect(layout.content?.features).toMatchObject({ layout: 'stats' })
  })

  it('features layout is cards for non-numeric value props', () => {
    const layout = planToLayout(
      [
        { band: 4, blocks: [{ block: 'features', cards: [{ title: 'Warm rooms', text: 'Always.' }, { title: 'Small groups', text: 'Six at a time.' }] }] },
        { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
      ],
      profile,
      gallery,
    )!
    expect(layout.content?.features).toMatchObject({ layout: 'cards' })
  })

  it('cardGrid shape is left when the cards carry photos, and the default top when they do not', () => {
    const withPhotos = planToLayout(
      [
        { band: 3, blocks: [{ block: 'cardGrid', cards: [{ title: 'Room', text: 'A room.', imageIndex: 0 }] }] },
        { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
      ],
      profile,
      gallery,
    )!
    expect(withPhotos.content?.cardGrid).toMatchObject({ shape: 'left' })

    const noPhotos = planToLayout(
      [
        { band: 3, blocks: [{ block: 'cardGrid', cards: [{ icon: '1', title: 'Meet', text: 'We talk.' }] }] },
        { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
      ],
      profile,
      gallery,
    )!
    // `top` is the block default, so it is left out of the bag (sparse), which renders as top.
    expect(noPhotos.content?.cardGrid).not.toHaveProperty('shape')
  })

  it('gallery is masonry + roomy at four or more photos, and a plain grid below that', () => {
    const many = planToLayout(
      [
        { band: 5, blocks: [{ block: 'gallery' }] },
        { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
      ],
      profile,
      bigGallery,
    )!
    expect(many.content?.gallery).toMatchObject({ view: 'masonry', gap: 'roomy', images: bigGallery })

    const few = planToLayout(
      [
        { band: 5, blocks: [{ block: 'gallery' }] },
        { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
      ],
      profile,
      gallery,
    )!
    // grid + standard are the block defaults, so they stay out of the bag (sparse).
    expect(few.content?.gallery).toEqual({ images: gallery })
  })

  it('zigzag photo side defaults to left (only one zigzag band can carry a photo today)', () => {
    const layout = planToLayout(
      [
        { band: 2, blocks: [{ block: 'zigzag', body: 'A beat.', imageIndex: 0 }] },
        { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
      ],
      profile,
      gallery,
    )!
    expect(layout.content?.zigzag).not.toHaveProperty('mediaSide')
  })
})

// ── The call to action (the destination is never the model's) ─────────────────────────────────────────

describe('the CTA button is secured by the caller, not the model', () => {
  const ask: ComposedSection[] = [
    { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
    {
      band: 8,
      blocks: [{ block: 'accentBeat', title: 'Come sit with us', body: 'Sessions run all week.', buttonLabel: 'Book a session' }],
    },
  ]

  it('turns the button on with the caller ctaUrl and the model label', () => {
    const layout = planToLayout(ask, profile, gallery, { ctaUrl: '/spaces/vista-retreat/book' })!
    expect(layout.content?.accentBeat).toMatchObject({
      buttonOn: true,
      buttonLabel: 'Book a session',
      buttonUrl: '/spaces/vista-retreat/book',
    })
  })

  it('leaves the button off when there is no destination', () => {
    const layout = planToLayout(ask, profile, gallery)!
    expect(layout.content?.accentBeat).toMatchObject({ buttonOn: false })
    expect(layout.content?.accentBeat).not.toHaveProperty('buttonUrl')
  })

  it('leaves the button off when the model wrote no label', () => {
    const layout = planToLayout(
      [
        { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
        { band: 8, blocks: [{ block: 'accentBeat', title: 'Come sit with us' }] },
      ],
      profile,
      gallery,
      { ctaUrl: '/spaces/vista-retreat/book' },
    )!
    expect(layout.content?.accentBeat).toMatchObject({ buttonOn: false })
    expect(layout.content?.accentBeat).not.toHaveProperty('buttonUrl')
  })

  it('ignores a model-supplied buttonUrl entirely', () => {
    const hostile = [
      { band: 1, blocks: [{ block: 'editorial', body: 'A room.' }] },
      {
        band: 8,
        blocks: [
          { block: 'accentBeat', title: 'Come sit', buttonLabel: 'Book', buttonUrl: 'https://evil.example/steal' },
        ],
      },
    ] as ComposedSection[]
    const layout = planToLayout(hostile, profile, gallery, { ctaUrl: '/spaces/vista-retreat/book' })!
    expect(layout.content?.accentBeat).toMatchObject({ buttonUrl: '/spaces/vista-retreat/book' })
    expect(JSON.stringify(layout)).not.toContain('evil.example')
  })

  it('refuses an unsafe caller destination', () => {
    const layout = planToLayout(ask, profile, gallery, { ctaUrl: 'javascript:alert(1)' })!
    expect(layout.content?.accentBeat).toMatchObject({ buttonOn: false })
    expect(JSON.stringify(layout)).not.toContain('javascript:')
  })
})

// ── The verbatim source excerpt reaches the model ─────────────────────────────────────────────────────

describe('buildComposeUserPrompt carries the business own words', () => {
  const excerpt = 'SOURCE: https://vista.example/about\nWe have run this retreat since 2011. Bring nothing but a towel.'

  it('puts the verbatim excerpt in the prompt, labelled as theirs', () => {
    const text = buildComposeUserPrompt(profile, gallery, { sourceExcerpt: excerpt })
    expect(text).toContain('THEIR OWN WORDS')
    expect(text).toContain('We have run this retreat since 2011. Bring nothing but a towel.')
  })

  it('says so plainly when no excerpt was harvested', () => {
    const text = buildComposeUserPrompt(profile, gallery, {})
    expect(text).toContain('THEIR OWN WORDS: none harvested')
  })

  it('bounds a huge excerpt so a big harvest cannot blow the window', () => {
    const huge = 'word '.repeat(20_000)
    const text = buildComposeUserPrompt(profile, gallery, { sourceExcerpt: huge })
    expect(text.length).toBeLessThan(20_000)
  })

  it('tells the model whether there is a real destination for the ask', () => {
    expect(buildComposeUserPrompt(profile, gallery, { ctaUrl: '/spaces/vista-retreat/book' })).toContain(
      'there is a real destination',
    )
    expect(buildComposeUserPrompt(profile, gallery, {})).toContain('drop band 8')
    // An unsafe destination is no destination.
    expect(buildComposeUserPrompt(profile, gallery, { ctaUrl: 'javascript:alert(1)' })).toContain('drop band 8')
  })

  it('carries the photo count, the block catalog, and the bookable flag', () => {
    const text = buildComposeUserPrompt(profile, gallery, { bookable: true })
    expect(text).toContain('PHOTOS AVAILABLE: 2')
    expect(text).toContain('- accentBeat:')
    expect(text).toContain('Bookable: yes')
  })
})

// ── The voice canon ───────────────────────────────────────────────────────────────────────────────────

describe('no em dash reaches the page or the prompt', () => {
  const EM = /[—–]/

  it('keeps the system prompt and the band spine em-dash free', () => {
    expect(COMPOSE_SYSTEM).not.toMatch(EM)
    expect(COMPOSE_SYSTEM).toContain('Band 1.')
    expect(COMPOSE_SYSTEM).toContain('Band 9.')
    expect(buildComposeUserPrompt(profile, gallery, {})).not.toMatch(EM)
  })

  it('strips em dashes from every string the layout carries', () => {
    const layout = planToLayout(
      [
        { band: 1, blocks: [{ block: 'editorial', eyebrow: 'the — start', title: 'A — room', body: 'Rest — here.' }] },
        { band: 3, blocks: [{ block: 'cardGrid', title: 'Steps — three', cards: [{ icon: '1', title: 'Meet — us', text: 'We — talk.' }] }] },
        { band: 8, blocks: [{ block: 'accentBeat', title: 'Come — sit', buttonLabel: 'Book — now' }] },
      ],
      profile,
      gallery,
      { ctaUrl: '/spaces/vista-retreat/book' },
    )!
    for (const s of allStrings(layout)) expect(s).not.toMatch(EM)
  })
})

describe('reseedBlockCopy pre-AI guards (task #17)', () => {
  // The AI call itself is untestable in CI (like composeMarketingLayout); these lock the deterministic
  // guards that short-circuit BEFORE any model call, so a block with nothing to rewrite never spends budget.
  it('returns null for a block with no text fields to rewrite', async () => {
    expect(await reseedBlockCopy('divider', profile, {})).toBeNull()
    expect(await reseedBlockCopy('gallery', profile, {})).toBeNull()
  })
  it('returns null when the master profile has no name to ground on', async () => {
    expect(await reseedBlockCopy('editorial', { name: '', type: 'business' } as BusinessProfile, {})).toBeNull()
  })
})
