import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import * as network from './network'
import { designComponents } from './design'
import { profileComponents } from './profile'
import { MensworkPage } from '@/components/sites/menswork-page'
import { planMensworkPage } from '@/lib/sites/menswork-page'
import type { MwLive } from '@/lib/sites/menswork-data'
import type { SiteLinkMap } from '@/lib/sites/house-theme'

// EVERY KEY A RENDERER READS IS A FIELD (owner ask 2026-10-19: "make sure all the edit blocks on the website are
// fully featured in the block editor"). The Group's site (Space `the-group`) is built from the Network family on
// its website pages and the design and Space blocks on its custom tabs. A key a renderer reads with no field is
// settable only by the seed script or raw JSON, which is the gap this suite closes.
//
// The probe is a recording proxy: each block renders against props that log every key read, nested array rows
// included (`cards[].href`), and answer with a plausible value for the field declared there. A read the block's
// own `fields` does not declare fails, so a renderer that grows a new prop without a field fails here first.

type Field = { type: string; options?: readonly { value: unknown }[]; arrayFields?: Record<string, Field>; objectFields?: Record<string, Field> }
type Fields = Record<string, Field>
type Config = { fields?: Fields; render: (props: unknown) => ReactNode }

/** Props every block receives from the editor framework, never authored through a field. */
const FRAMEWORK = new Set(['id', 'layout', 'puck', 'editMode'])
const SAMPLE = 'Sample words'
const PHOTO = 'https://images.example/sample.jpg'

function recorder(fields: Fields, reads: Set<string>, overrides: Record<string, unknown> = {}, framework: Record<string, unknown> = {}, prefix = ''): Record<string, unknown> {
  return new Proxy({}, {
    get(_, key) {
      if (typeof key === 'symbol') return undefined
      if (!prefix && FRAMEWORK.has(key)) return framework[key]
      reads.add(prefix + key)
      if (!prefix && key in overrides) return overrides[key]
      const field = fields[key]
      if (!field) return undefined
      if (field.type === 'array') return [recorder(field.arrayFields ?? {}, reads, {}, {}, `${prefix}${key}[].`)]
      if (field.type === 'object') return recorder(field.objectFields ?? {}, reads, {}, {}, `${prefix}${key}.`)
      if (field.type === 'number') return 3
      if (field.type === 'select' || field.type === 'radio') return field.options?.find((o) => o.value !== '')?.value
      // A custom field here is a picker (the Loom image picker, the member picker): answer with a photo URL.
      return field.type === 'custom' ? PHOTO : SAMPLE
    },
  })
}

/** The keys a block's fields declare, nested array rows as `key[].sub` and object parts as `key.sub`. */
function declared(fields: Fields, prefix = ''): Set<string> {
  const out = new Set<string>()
  for (const [key, field] of Object.entries(fields)) {
    out.add(prefix + key)
    if (field.type === 'array') for (const sub of declared(field.arrayFields ?? {}, `${prefix}${key}[].`)) out.add(sub)
    if (field.type === 'object') for (const sub of declared(field.objectFields ?? {}, `${prefix}${key}.`)) out.add(sub)
  }
  return out
}

const undeclared = (reads: Set<string>, fields: Fields, allowed: readonly string[] = []) => {
  const keys = declared(fields)
  return [...reads].filter((key) => !keys.has(key) && !allowed.includes(key)).sort()
}

const now = new Date('2026-10-15T12:00:00Z')
// A Space event whose title holds the sample words, so the pinned-event, circle and events paths all draw.
const event = { id: 'event-1', slug: 'sample', title: `${SAMPLE} morning`, startsAt: '2026-10-20T09:30:00', endsAt: '2026-10-20T10:30:00', timeZone: 'America/Los_Angeles', location: 'Encinitas', description: 'A morning.' }
const links: SiteLinkMap = { origin: 'https://frequency.example', slug: 'the-group', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }
const metadata = { space: { events: [event], community: [{ name: SAMPLE, slug: 'sample', memberCount: 4 }] }, links }

describe('The Network blocks: every key a renderer reads is a field', () => {
  // Values the recorder cannot guess: a countdown target in the future and a real zone, so the countdown draws.
  const overrides: Record<string, Record<string, unknown>> = { NetworkBand: { countdownTo: '2099-01-01T10:00', timeZone: 'America/Los_Angeles' } }
  const renderers = network as unknown as Record<string, (args: { p: unknown; metadata?: unknown; now?: Date }) => ReactNode>

  for (const [type, config] of Object.entries(network.networkComponents) as [string, Config][]) {
    it(type, () => {
      const reads = new Set<string>()
      const Block = renderers[`${type}Block`]
      expect(Block, `${type}Block is exported beside its config`).toBeTypeOf('function')
      renderToStaticMarkup(<Block p={recorder(config.fields ?? {}, reads, overrides[type])} metadata={metadata} now={now} />)
      expect(reads.size).toBeGreaterThan(0)
      expect(undeclared(reads, config.fields ?? {})).toEqual([])
    })
  }

  it('lets the owner rename the All chapters filter chip', () => {
    const reads = new Set<string>()
    const config = network.networkComponents.NetworkEvents as unknown as Config
    renderToStaticMarkup(<network.NetworkEventsBlock p={recorder(config.fields ?? {}, reads)} metadata={metadata} now={now} />)
    expect(reads.has('allLabel')).toBe(true)
    expect(config.fields?.allLabel).toMatchObject({ type: 'text' })
  })
})

describe('The Group custom tab blocks: every key a renderer reads is a field', () => {
  const configs = { ...designComponents, ...profileComponents } as unknown as Record<string, Config>
  const live: MwLive = {
    events: [{ id: 'event-1', slug: 'sample', title: `${SAMPLE} morning`, description: 'A morning.', startsAt: '2026-10-20T09:30:00', endsAt: null, location: 'Encinitas' }],
    circles: [{ id: 'circle-1', slug: 'sample', name: SAMPLE, about: 'A circle.', memberCount: 3, memberCap: 8, status: 'open', imageUrl: null, neighborhood: 'Encinitas', meets: 'Mondays', host: 'June', hostAvatar: null, isSpacePrimary: false }],
    journeys: [],
  }
  const puck = { isEditing: false, metadata: { space: { events: [{ id: 'event-1', slug: 'sample', title: SAMPLE, startsAt: '2026-10-20T09:30:00' }], community: [{ id: 'circle-1', slug: 'sample', name: SAMPLE, memberCount: 3 }] }, links } }
  // Each block in every shape its own fields can pick, so each variant's render path is read.
  const variants: Record<string, Record<string, unknown>[]> = {
    PhotoHero: [{ variant: 'image', display: 'beside' }, { variant: 'image', display: 'overlay' }, { variant: 'wash' }, { variant: 'text-only' }],
    EditorialSection: ['lead', 'prose', 'faq', 'stats'].map((body) => ({ body })),
    CardGrid: [...['feature', 'list', 'step', 'testimonial', 'media'].map((role) => ({ role })), { role: 'step', columns: 3 }],
    Zigzag: [...['lead', 'list', 'quote'].map((body) => ({ body })), { mediaSide: 'right' }],
    AccentBeat: [{ mode: 'cta' }, { mode: 'statement' }, { mode: 'statement', ctaHref: '' }, { mode: 'quote', background: 'image-scrim' }],
    SpaceCommunity: [{ layout: 'grid' }, { layout: 'finder' }],
    SpaceEvents: [{}],
    SpaceOfferings: [{}],
    SpaceTeam: [{}],
  }
  // The shared website photo row reads Gallery's `items` before a Card grid's `cards`: an alias for another
  // block type, never a Card grid prop.
  const aliases: Record<string, string[]> = { CardGrid: ['items'] }
  // An offering's price, deposit, length and listing come from the Space's services catalog, which replaces this
  // block's inline rows whenever it has any (the inspector then hides them): the inline row is a title and blurb.
  const catalog: Record<string, string[]> = { SpaceOfferings: ['deposit', 'durationMinutes', 'packageCount', 'price', 'priceModel', 'slidingScaleMin', 'visibility'].map((key) => `items[].${key}`) }

  for (const [type, shapes] of Object.entries(variants)) {
    it(type, () => {
      const config = configs[type]
      const fields = config.fields ?? {}
      for (const shape of shapes) {
        // The Frequency Space tab draws the block's own render; the website draws its site page section.
        const own = new Set<string>()
        renderToStaticMarkup(<>{config.render(recorder(fields, own, shape, { puck }))}</>)
        const site = new Set<string>()
        const props = recorder(fields, site, shape, { puck })
        const blocks = [{ type, props }]
        renderToStaticMarkup(<MensworkPage blocks={blocks} plan={planMensworkPage(blocks)} live={live} links={links} origin={links.origin} pageTitle="Page" now={now}
          renderOther={(block) => <>{config.render(block.props)}</>} />)
        expect(undeclared(own, fields, catalog[type]), `${type} ${JSON.stringify(shape)} own render`).toEqual([])
        expect(undeclared(site, fields, [...(aliases[type] ?? []), ...(catalog[type] ?? [])]), `${type} ${JSON.stringify(shape)} website section`).toEqual([])
      }
    })
  }

  it('lets the owner link a card in a Card grid, and set its stat box and button', () => {
    const card = configs.CardGrid.fields?.cards?.arrayFields ?? {}
    expect(card.href).toMatchObject({ type: 'text' })
    for (const key of ['stat.value', 'stat.label', 'button.label', 'button.href']) expect(declared(card).has(key), key).toBe(true)
  })
})
