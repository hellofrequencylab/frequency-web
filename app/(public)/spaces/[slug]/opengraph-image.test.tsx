import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import sharp from 'sharp'

// ── LIVE-155: the Space share card must render for EVERY shape its inputs can take ─────────
//
// 🔴 THE BUG (scan2 L10 R5). `TypeError: u2 is not iterable` on /spaces/[slug]/opengraph-image,
// two production hits on one Space. The Space stores its logo as image/webp; fetchRemoteImage
// inlined it as `data:image/webp;base64,...`, and Satori's data-URL resolver, which can size only
// png / apng / gif / jpeg, spread an unassigned variable. The fix lives at the read site
// (lib/og/remote-image.ts); this file proves the ROUTE stays total: it runs the real default export,
// the real hero resolution, the real image inlining and the real Satori render, with the store
// mocked to hand back hostile rows, and asserts a 200 with a jpeg body every time.
//
// Reverting the read-site guard makes the first test below fail with the production error text.

const { getSpaceBySlug, getSpaceVisibility } = vi.hoisted(() => ({
  getSpaceBySlug: vi.fn(),
  getSpaceVisibility: vi.fn(),
}))

vi.mock('@/lib/spaces/store', () => ({ getSpaceBySlug, getSpaceVisibility }))

// Spy on the real deliverer: the card still rasterises through next/og and sharp, and the element
// plus the Satori options are captured for inspection.
vi.mock('@/lib/og/deliver', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/og/deliver')>()
  return { ...mod, cardResponse: vi.fn(mod.cardResponse) }
})

import { cardResponse } from '@/lib/og/deliver'
import Image from './opengraph-image'

const bytes: Record<string, Buffer> = {}

beforeAll(async () => {
  const base = sharp({ create: { width: 8, height: 8, channels: 3, background: '#0f8e78' } })
  bytes.webp = await base.clone().webp().toBuffer()
  bytes.png = await base.clone().png().toBuffer()
  bytes.jpeg = await base.clone().jpeg().toBuffer()
  // The origin's content-type is whatever the upload declared; the route by extension mirrors the
  // live storage bucket, where the crashing logo is stored as image/webp. Only the fake storage host
  // is answered here: next/og fetches its own yoga and resvg wasm through the same global, and those
  // requests must reach the real fetch.
  const realFetch = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (!url.startsWith('https://storage.example/')) return realFetch(input, init)
      const kind = url.endsWith('.webp') ? 'webp' : url.endsWith('.png') ? 'png' : 'jpeg'
      return new Response(new Uint8Array(bytes[kind]), { status: 200, headers: { 'content-type': `image/${kind}` } })
    }),
  )
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.mocked(cardResponse).mockClear()
  getSpaceVisibility.mockResolvedValue('network')
})

const SPACE = {
  id: '7a8981fa-a2b4-455a-ac23-7192535b7770',
  slug: 'being-wholistic-collective',
  name: 'BEing Wholistic Collective',
  type: 'nonprofit',
  status: 'active',
  entityId: 'e-1',
  skin: 'default',
  domain: null,
  networkConnected: true,
  enabledVerticals: [],
  ownerProfileId: null,
  brandName: 'BEing Wholistic Collective',
  brandLogoUrl: 'https://storage.example/logos/logo.webp',
  brandAccent: null,
  entitlements: {},
  featureRoles: {},
  plan: null,
  modeVariant: null,
  preferences: { headerCta: { kind: 'function', function: 'book' } },
  coverImageUrl: 'https://storage.example/covers/cover.jpg',
  tagline: 'Trauma-informed therapy',
  city: null,
}

async function render(overrides: Record<string, unknown>) {
  getSpaceBySlug.mockResolvedValue({ ...SPACE, ...overrides } as unknown as typeof SPACE)
  const res = await Image({ params: Promise.resolve({ slug: SPACE.slug }) })
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

const SIZEABLE = /^data:image\/(png|jpeg|gif|svg\+xml);base64,/

describe('the Space share card with the LIVE-155 inputs', () => {
  it('renders a jpeg for a Space whose logo is stored as webp, falling back to the initials chip', async () => {
    const { res, element } = await render({})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    const srcs = imgSrcs(element)
    // The cover (jpeg) and the site mark (png) are inlined; the webp logo is not.
    expect(srcs).toHaveLength(2)
    for (const src of srcs) expect(src).toMatch(SIZEABLE)
    expect(srcs.some((s) => s.startsWith('data:image/webp'))).toBe(false)
    // The initials chip carried the logo slot.
    expect(texts(element)).toContain('BW')
  }, 120_000)

  it('inlines a png logo when the bytes really are png', async () => {
    const { res, element } = await render({ brandLogoUrl: 'https://storage.example/logos/logo.png' })
    expect(res.status).toBe(200)
    const srcs = imgSrcs(element)
    expect(srcs).toHaveLength(3)
    expect(srcs.filter((s) => s.startsWith('data:image/png;base64,'))).toHaveLength(2)
    expect(texts(element)).not.toContain('BW')
  }, 120_000)
})

describe('the Space share card over hostile preference shapes', () => {
  const HOSTILE: Array<[string, unknown]> = [
    ['a string', 'not an object'],
    ['null', null],
    ['an array', [1, 2, 3]],
    ['hero and headerCta as the wrong containers', { hero: 'x', headerCta: [1] }],
    [
      'arrays and objects where strings are expected',
      {
        hero: { height: 5, heading: ['a'], tagline: { x: 1 }, buttonOrientation: ['row'] },
        headerCta: { kind: 'custom', url: 7, label: null },
      },
    ],
    ['a hero override that is well formed', { hero: { heading: 'Whole', tagline: 'Well' } }],
  ]

  it.each(HOSTILE)('renders when preferences is %s', async (_label, preferences) => {
    const { res, element, options } = await render({ preferences })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(options.fonts).toHaveLength(2)
    for (const src of imgSrcs(element)) expect(src).toMatch(SIZEABLE)
  }, 120_000)

  it('renders the neutral card, and fetches nothing, for a private or missing Space', async () => {
    getSpaceVisibility.mockResolvedValue('private')
    const { res, element } = await render({ preferences: 'irrelevant' })
    expect(res.status).toBe(200)
    expect(imgSrcs(element)).toHaveLength(0)
    getSpaceVisibility.mockResolvedValue('network')
    getSpaceBySlug.mockResolvedValue(null)
    const missing = await Image({ params: Promise.resolve({ slug: 'nobody' }) })
    expect(missing.status).toBe(200)
  }, 120_000)
})
