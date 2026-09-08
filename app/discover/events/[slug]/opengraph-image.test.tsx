import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ReactElement, ReactNode } from 'react'
import sharp from 'sharp'

// ── LIVE-139 / ADR-1257: the PUBLIC event share card leads with the event's cover ──────────────
//
// The crawlable half of every event — the card a search engine and a first-time visitor see —
// rendered the brand TEXT layout for every event, while the member card one route over led with the
// artwork. The ingredient was already on the row this route reads (`cover_url`, LIVE-133).
//
// This runs the REAL default export, the real image inlining and the real Satori render, with the
// two data reads mocked, and asserts three things a source grep cannot:
//   1. an event WITH a cover renders the poster card (the cover is inlined, the faces are loaded),
//   2. an event with NO cover still renders — the text card, fetching nothing,
//   3. 🔴 the card fetches the PUBLIC event-media URL and NOTHING else. Tier 1 only is the privacy
//      rule (ADR-186): a scanned flyer in the private bucket can carry the venue street this
//      surface redacts to city level, and the bucket is not anon-readable anyway.
// Plus the cost decision that made the cover affordable at all: this route renders ON DEMAND.

const { getPublicEventBySlug, getEventEnrichment } = vi.hoisted(() => ({
  getPublicEventBySlug: vi.fn(),
  getEventEnrichment: vi.fn(),
}))

vi.mock('@/lib/discover', () => ({ getPublicEventBySlug }))
vi.mock('../_data', () => ({ getEventEnrichment }))

// Spy on the real deliverer: the card still rasterises through next/og and sharp, and the element
// plus the Satori options are captured for inspection.
vi.mock('@/lib/og/deliver', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/og/deliver')>()
  return { ...mod, cardResponse: vi.fn(mod.cardResponse) }
})

import { cardResponse } from '@/lib/og/deliver'
import Image, { dynamic } from './opengraph-image'

const COVER = 'https://storage.example/event-media/cover.jpg'
const fetched: string[] = []

beforeAll(async () => {
  const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#6366f1' } })
    .jpeg()
    .toBuffer()
  // Only the fake storage host is answered here: next/og fetches its own yoga and resvg wasm
  // through the same global, and those requests must reach the real fetch.
  const realFetch = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (!url.startsWith('https://storage.example/')) return realFetch(input, init)
      fetched.push(url)
      return new Response(new Uint8Array(jpeg), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    }),
  )
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.mocked(cardResponse).mockClear()
  fetched.length = 0
})

const EVENT = {
  id: 'e1',
  slug: 'sunday-breathwork',
  title: 'Sunday Morning Breathwork Circle',
  description: null,
  starts_at: '2026-10-05T16:00:00.000Z',
  ends_at: null,
  city: 'Vista',
  circle_id: null,
  circle_name: 'Frequency Lab',
  price_cents: null,
}

const ENRICHMENT = {
  time_zone: 'America/Los_Angeles',
  attendance_mode: 'in_person' as const,
  is_cancelled: false,
  category: 'gathering',
  region: 'California',
  country: 'US',
  currency: 'usd',
  cover_url: COVER,
  cover_focus: '40% 20%',
}

async function render(event: unknown, enrichment: unknown) {
  getPublicEventBySlug.mockResolvedValue(event)
  getEventEnrichment.mockResolvedValue(enrichment)
  const res = await Image({ params: Promise.resolve({ slug: 'sunday-breathwork' }) })
  const call = vi.mocked(cardResponse).mock.calls.at(-1)
  if (!call) throw new Error('cardResponse was not called')
  const [element, options] = call
  return { res, element: element as ReactElement, options: options as { fonts?: unknown[] } }
}

function imgSrcs(node: ReactNode, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) imgSrcs(child, out)
    return out
  }
  const el = node as ReactElement<{ src?: unknown; children?: ReactNode }>
  if (el.type === 'img' && typeof el.props.src === 'string') out.push(el.props.src)
  imgSrcs(el.props.children, out)
  return out
}

function texts(node: ReactNode, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out)
    return out
  }
  texts((node as ReactElement<{ children?: ReactNode }>).props.children, out)
  return out
}

describe('the public event share card', () => {
  it('leads with the event cover, and fetches only the public event-media URL', async () => {
    const { res, element, options } = await render(EVENT, ENRICHMENT)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    // The cover and the site mark are inlined as data URLs Satori can size.
    const srcs = imgSrcs(element)
    expect(srcs).toHaveLength(2)
    for (const src of srcs) expect(src).toMatch(/^data:image\/(png|jpeg|gif|svg\+xml);base64,/)
    // The poster branch, not the text branch: the faces are loaded and the identity rides the photo.
    expect(options.fonts).toHaveLength(2)
    expect(texts(element)).toContain(EVENT.title)
    // 🔴 TIER 1 ONLY. One remote read, and it is the public bucket URL the enrichment supplied.
    expect(fetched).toEqual([COVER])
  }, 120_000)

  it('falls back to the text card, fetching nothing, when the event has no cover', async () => {
    const { res, element, options } = await render(EVENT, { ...ENRICHMENT, cover_url: null })
    expect(res.status).toBe(200)
    expect(imgSrcs(element)).toHaveLength(0)
    expect(options.fonts).toBeUndefined()
    expect(texts(element)).toContain(EVENT.title)
    expect(fetched).toEqual([])
  }, 120_000)

  it('renders the identity-free card, and no artwork, when the read finds no event', async () => {
    // The enrichment still resolves for a row the RPC cannot return. An identity-free card must not
    // carry the entity's artwork either, so the cover is gated on the event, not on the cover.
    const { res, element } = await render(null, ENRICHMENT)
    expect(res.status).toBe(200)
    expect(imgSrcs(element)).toHaveLength(0)
    expect(texts(element)).not.toContain(EVENT.title)
    expect(fetched).toEqual([])
  }, 120_000)

  it('renders on demand, which is what makes the cover affordable (ADR-1257)', () => {
    // ~200 upcoming slugs are prerendered from page.tsx's generateStaticParams and a metadata image
    // route inherits that set. Measured on this repo's pipeline: a flat text card is ~88 ms, a
    // cover-led one ~360 ms plus a remote fetch. Deleting this export puts ~200 photographic
    // rasters back into `next build`, on the builder LIVE-123 is open about.
    expect(dynamic).toBe('force-dynamic')
  })

  it('shares ONE layout with the member card, so the two cannot drift again (ADR-1179)', () => {
    const root = path.join(import.meta.dirname, '..', '..', '..', '..')
    const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')
    const publicCard = read('app/discover/events/[slug]/opengraph-image.tsx')
    const memberCard = read('app/(main)/events/[slug]/opengraph-image.tsx')
    for (const src of [publicCard, memberCard]) {
      expect(src).toMatch(/from '@\/lib\/og\/event-card'/)
      expect(src).toContain('eventCardResponse(')
    }
    // And the public one keeps its hands off the private tiers: the member card's three-source
    // precedence resolves a signed URL into the private poster bucket, and the media module that
    // owns that bypass is the only thing that can build one. Neither may be imported here. (The
    // behavioural half is the first test: the card fetched exactly one URL, the public one.)
    expect(publicCard).not.toMatch(/from '@\/lib\/events\/(hero-url|poster-media)'/)
    expect(memberCard).toMatch(/from '@\/lib\/events\/hero-url'/)
  })
})
