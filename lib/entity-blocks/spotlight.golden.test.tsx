import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  EMPTY_LAYOUT,
  SPOTLIGHT_LAYOUT_VERSION,
  SPOTLIGHT_STAT_KEYS,
  MAX_BLOCKS,
  MAX_LINKS_PER_BLOCK,
  MAX_GALLERY_IMAGES,
  HEADING_MAX,
  TEXT_MAX,
  QUOTE_MAX,
  CITE_MAX,
  LABEL_MAX,
  ALT_MAX,
  type SpotlightBlock,
} from '@/lib/entity-blocks/spotlight'
import { ENTITY_BLOCKS, blockSupportsKind } from '@/lib/entity-blocks/registry'
import { validateSpotlightLayout } from '@/lib/spotlight/blocks/validate'
import { BlockView } from '@/components/spotlight/blocks/render'

// THE SPOTLIGHT GOLDENS (PROG-E2C). Written and run green against the Spotlight block kit at
// lib/spotlight/blocks/schema.ts BEFORE it was folded next to the entity-block registry, then kept. The fold
// changes one line of this file: the first import. Every expectation is a literal (inline snapshots), so a diff
// here that is not a deliberate, dated product change is a regression in what a Spotlight stores or renders.
//
// Re-baselining log (add a dated line for every deliberate change; none so far):
//   2026-11-16  frozen from lib/spotlight/blocks/schema.ts, nine block types.

const OWNER = '00000000-0000-4000-8000-000000000001'
// The renderer prefixes image paths with the Supabase URL from the environment; the goldens read it as unset.
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const norm = (html: string) => (BASE ? html.split(encodeURIComponent(BASE)).join('').split(BASE).join('') : html)
const STATS = { zaps: 1200, streak: 7, gems: 30, joinedYear: 2024, region: 'North County' }

// One stored block of every type, as a member's saved layout would hold it (the validator keeps them all).
const RAW = {
  version: 1,
  blocks: [
    { id: 'h', type: 'heading', text: 'Hello there', level: 2, tint: { text: '#112233' } },
    { id: 'h3', type: 'heading', text: 'Small heading', level: 3 },
    { id: 't', type: 'text', text: 'A few words\nover two lines.', tint: { bg: '#fafafa' } },
    { id: 'l', type: 'links', items: [{ label: 'My site', url: 'https://example.com/' }, { label: 'Bad', url: 'javascript:alert(1)' }] },
    { id: 'i', type: 'image', assetPath: `${OWNER}/spotlight/a.jpg`, alt: 'A view', focusX: 30, focusY: 70, zoom: 120 },
    { id: 'g', type: 'gallery', items: [{ assetPath: `${OWNER}/spotlight/b.jpg`, alt: 'One' }, { assetPath: `${OWNER}/spotlight/c.jpg`, alt: 'Two' }] },
    { id: 'q', type: 'quote', text: 'Show up.', cite: 'A friend' },
    { id: 's', type: 'stats', show: ['zaps', 'streak', 'gems', 'joined', 'region'] },
    { id: 'e', type: 'embed', provider: 'youtube', ref: 'dQw4w9WgXcQ' },
    { id: 'd', type: 'divider' },
  ],
}

const NINE = ['heading', 'text', 'links', 'image', 'gallery', 'quote', 'stats', 'embed', 'divider'] as const

describe('Spotlight block kit goldens (PROG-E2C)', () => {
  it('every Spotlight block type is a registry row a member may hold', () => {
    expect([...new Set(RAW.blocks.map((b) => b.type))]).toEqual([...NINE])
    for (const id of NINE) {
      const row = ENTITY_BLOCKS.find((b) => b.id === id)
      expect(row, id).toBeDefined()
      expect(blockSupportsKind(row!, 'member'), id).toBe(true)
    }
  })

  it('keeps every limit and constant', () => {
    expect({
      SPOTLIGHT_LAYOUT_VERSION, MAX_BLOCKS, MAX_LINKS_PER_BLOCK, MAX_GALLERY_IMAGES, HEADING_MAX, TEXT_MAX, QUOTE_MAX, CITE_MAX, LABEL_MAX, ALT_MAX,
      SPOTLIGHT_STAT_KEYS, EMPTY_LAYOUT,
    }).toMatchInlineSnapshot(`
      {
        "ALT_MAX": 140,
        "CITE_MAX": 80,
        "EMPTY_LAYOUT": {
          "blocks": [],
          "version": 1,
        },
        "HEADING_MAX": 80,
        "LABEL_MAX": 60,
        "MAX_BLOCKS": 40,
        "MAX_GALLERY_IMAGES": 12,
        "MAX_LINKS_PER_BLOCK": 10,
        "QUOTE_MAX": 280,
        "SPOTLIGHT_LAYOUT_VERSION": 1,
        "SPOTLIGHT_STAT_KEYS": [
          "zaps",
          "streak",
          "gems",
          "joined",
          "region",
        ],
        "TEXT_MAX": 1000,
      }
    `)
  })

  it('validates a stored layout of all nine types to the same clean layout', () => {
    expect(validateSpotlightLayout(RAW, OWNER)).toMatchInlineSnapshot(`
      {
        "blocks": [
          {
            "id": "h",
            "level": 2,
            "text": "Hello there",
            "tint": {
              "text": "#112233",
            },
            "type": "heading",
          },
          {
            "id": "h3",
            "level": 3,
            "text": "Small heading",
            "type": "heading",
          },
          {
            "id": "t",
            "text": "A few words
      over two lines.",
            "tint": {
              "bg": "#fafafa",
            },
            "type": "text",
          },
          {
            "id": "l",
            "items": [
              {
                "label": "My site",
                "url": "https://example.com/",
              },
            ],
            "type": "links",
          },
          {
            "alt": "A view",
            "assetPath": "00000000-0000-4000-8000-000000000001/spotlight/a.jpg",
            "focusX": 30,
            "focusY": 70,
            "id": "i",
            "type": "image",
            "zoom": 120,
          },
          {
            "id": "g",
            "items": [
              {
                "alt": "One",
                "assetPath": "00000000-0000-4000-8000-000000000001/spotlight/b.jpg",
                "focusX": 50,
                "focusY": 50,
                "zoom": 100,
              },
              {
                "alt": "Two",
                "assetPath": "00000000-0000-4000-8000-000000000001/spotlight/c.jpg",
                "focusX": 50,
                "focusY": 50,
                "zoom": 100,
              },
            ],
            "type": "gallery",
          },
          {
            "cite": "A friend",
            "id": "q",
            "text": "Show up.",
            "type": "quote",
          },
          {
            "id": "s",
            "show": [
              "zaps",
              "streak",
              "gems",
              "joined",
              "region",
            ],
            "type": "stats",
          },
          {
            "id": "e",
            "provider": "youtube",
            "ref": "dQw4w9WgXcQ",
            "type": "embed",
          },
          {
            "id": "d",
            "type": "divider",
          },
        ],
        "version": 1,
      }
    `)
  })

  it('renders each of the nine types to the same markup', () => {
    const clean = validateSpotlightLayout(RAW, OWNER)
    const html = Object.fromEntries(clean.blocks.map((b: SpotlightBlock) => [b.id, norm(renderToStaticMarkup(<BlockView block={b} stats={STATS} headingFont="serif" />))]))
    expect(html).toMatchInlineSnapshot(`
      {
        "d": "<hr class="my-2 border-border"/>",
        "e": "<div class="overflow-hidden rounded-card border border-border"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="youtube embed" height="240" class="w-full" style="border:0" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allow="autoplay; encrypted-media; clipboard-write; picture-in-picture; fullscreen"></iframe></div>",
        "g": "<div class="grid grid-cols-2 gap-2 sm:grid-cols-3"><button type="button" aria-label="One" class="group relative aspect-square overflow-hidden rounded-control border border-border focus:outline-none focus:ring-2 focus:ring-border-strong/40"><img alt="One" loading="lazy" width="320" height="320" decoding="async" data-nimg="1" class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" style="color:transparent;object-position:50% 50%" src="/storage/v1/object/public/avatars/00000000-0000-4000-8000-000000000001/spotlight/b.jpg"/></button><button type="button" aria-label="Two" class="group relative aspect-square overflow-hidden rounded-control border border-border focus:outline-none focus:ring-2 focus:ring-border-strong/40"><img alt="Two" loading="lazy" width="320" height="320" decoding="async" data-nimg="1" class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" style="color:transparent;object-position:50% 50%" src="/storage/v1/object/public/avatars/00000000-0000-4000-8000-000000000001/spotlight/c.jpg"/></button></div>",
        "h": "<h2 class="mt-6 text-body-lg font-bold text-text" style="font-family:serif;color:#112233">Hello there</h2>",
        "h3": "<h3 class="mt-4 text-body font-bold text-text" style="font-family:serif">Small heading</h3>",
        "i": "<div class="overflow-hidden rounded-card border border-border"><img alt="A view" loading="lazy" width="640" height="640" decoding="async" data-nimg="1" class="h-auto w-full object-cover" style="color:transparent;object-position:30% 70%;transform:scale(1.2)" srcSet="/_next/image?url=%2Fstorage%2Fv1%2Fobject%2Fpublic%2Favatars%2F00000000-0000-4000-8000-000000000001%2Fspotlight%2Fa.jpg&amp;w=640&amp;q=75 1x, /_next/image?url=%2Fstorage%2Fv1%2Fobject%2Fpublic%2Favatars%2F00000000-0000-4000-8000-000000000001%2Fspotlight%2Fa.jpg&amp;w=1920&amp;q=75 2x" src="/_next/image?url=%2Fstorage%2Fv1%2Fobject%2Fpublic%2Favatars%2F00000000-0000-4000-8000-000000000001%2Fspotlight%2Fa.jpg&amp;w=1920&amp;q=75"/></div>",
        "l": "<div class="space-y-2"><a href="https://example.com/" target="_blank" rel="noopener noreferrer nofollow" class="block rounded-card border border-border-strong bg-surface px-4 py-3 text-center text-body-sm font-semibold text-text lift-1 transition-colors hover:bg-surface-elevated">My site</a></div>",
        "q": "<blockquote class="border-l-4 border-primary-strong bg-surface/60 py-2 pl-4 pr-3"><p class="text-pretty text-body-sm italic leading-relaxed text-text">Show up.</p><footer class="mt-1.5 text-meta font-medium text-muted">— A friend</footer></blockquote>",
        "s": "<div class="flex flex-wrap gap-2"><div><div class="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap h-4 w-4 text-primary-strong" aria-hidden="true"><path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"></path></svg><span class="text-body-sm font-semibold text-text tabular-nums">1,200</span><span class="text-meta text-muted">Zaps</span></div></div><div><div class="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-flame h-4 w-4 text-primary-strong" aria-hidden="true"><path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"></path></svg><span class="text-body-sm font-semibold text-text tabular-nums">7</span><span class="text-meta text-muted">day streak</span></div></div><div><div class="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-gem h-4 w-4 text-primary-strong" aria-hidden="true"><path d="M10.5 3 8 9l4 13 4-13-2.5-6"></path><path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z"></path><path d="M2 9h20"></path></svg><span class="text-body-sm font-semibold text-text tabular-nums">30</span><span class="text-meta text-muted">Gems earned</span></div></div><div><div class="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-days h-4 w-4 text-primary-strong" aria-hidden="true"><path d="M8 2v3"></path><path d="M16 2v3"></path><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path><path d="M8 13h.01"></path><path d="M12 13h.01"></path><path d="M16 13h.01"></path><path d="M8 17h.01"></path><path d="M12 17h.01"></path><path d="M16 17h.01"></path></svg><span class="text-body-sm font-semibold text-text tabular-nums">2024</span><span class="text-meta text-muted">member since</span></div></div><div><div class="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin h-4 w-4 text-primary-strong" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path><circle cx="12" cy="10" r="3"></circle></svg><span class="text-body-sm font-semibold text-text tabular-nums">North County</span><span class="text-meta text-muted"></span></div></div></div>",
        "t": "<p class="whitespace-pre-wrap text-pretty text-body-sm leading-relaxed text-text" style="background-color:#fafafa">A few words
      over two lines.</p>",
      }
    `)
  })
})
