// FIXTURE RENDER: the New World kit's Space page for each of its seven kits, as bare HTML pages (the pictures on /themes/new-world:
// public/brand/new-world-kit/shots/<kit>-spacedesk.jpg). The Space sits inside the real member shell (Frequency's header and rails);
// only the Space area wears the kit: its faces and the Tide accent, through the same resolvers the route calls.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/new-world-space-shots.render.tsx
// then node scripts/render/new-world-theme-shots.mjs $RENDER_OUT (it also takes the spacedesk pages)
import { createElement as h, type ComponentProps } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spaces/table-nine', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

const out = process.env.RENDER_OUT
// One real New World photo per kit (lib/sites/new-world-photos.json slots); the cover is the Space's, not the kit's.
const COVER: Record<string, string> = { general: 'circle-sunrise', coaches: 'beach-move', studios: 'backyard-class', hosts: 'garden-picnic', venues: 'hands-up', nonprofits: 'workshop-table', networks: 'cafe-table' }

async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}
const shellDoc = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><link rel="stylesheet" href="fonts.css"><style>:root{--font-lexend:Lexend,system-ui,sans-serif}html{scrollbar-width:none}</style></head><body>${body}</body></html>`


it('renders the Space page for each New World kit', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { FqSpaceChrome } = await import('@/components/frequency/members/space/space-chrome')
  const { FrequencyMembersShell } = await import('@/components/frequency/members/shell/members-shell')
  const { GetStarted } = await import('@/components/frequency/members/shell/get-started')
  const { AccentScope } = await import('@/components/spaces/accent-scope')
  const { spacePageSiteFaces } = await import('@/lib/theme/site-style')
  const { frequencyAccentVars } = await import('@/lib/spaces/accent')
  const { parseSpaceTheme } = await import('@/lib/theme/space-themes')
  const { NEW_WORLD_ACCENTS } = await import('@/lib/theme/new-world')
  const { NEW_WORLD_KIT_NICHES } = await import('@/lib/sites/kits/new-world-variants')
  const { newWorldKitSpotlightContent } = await import('@/lib/spotlight/new-world-kit-content')

  const prefs = { siteStyle: { theme: 'new-world', synced: true } }
  for (const niche of NEW_WORLD_KIT_NICHES) {
    const c = newWorldKitSpotlightContent(niche)
    const nav = h('nav', { className: 'tabs' }, ['Home', 'Calendar', 'Offerings', 'About', 'Library'].map((t, i) => h('a', { key: t, href: '#', className: i === 0 ? 'on' : undefined }, t)))
    const page = h(
      AccentScope,
      { vars: null, fqAccent: frequencyAccentVars(NEW_WORLD_ACCENTS.tide.accent), siteFaces: spacePageSiteFaces(prefs), theme: parseSpaceTheme('frequency') } as ComponentProps<typeof AccentScope>,
      h(FqSpaceChrome, {
        back: { href: '/spaces', label: 'Spaces' },
        coverImage: `/sites/new-world/photos/${COVER[niche]}.webp`,
        name: c.name,
        tagline: h('p', { className: 'fqs-tagline' }, c.descriptor),
        actions: [h('button', { key: 'a', className: 'btn pa' }, c.cta.label), h('button', { key: 'b', className: 'btn' }, 'Follow')],
        nav,
        children: [
          h('section', { key: 's1', className: 'stack' }, [
            h('h2', { key: 'h', className: 'font-display' }, c.headings.openings.title),
            h('div', { key: 'p', className: 'panel' }, [h('span', { key: 'b', className: 'ev-badge feat' }, 'Featured'), h('p', { key: 't', className: 'body' }, c.openings[0] ? `${c.openings[0].title}, ${c.openings[0].time}.` : c.hero.body)]),
          ]),
          h('section', { key: 's2', className: 'stack' }, [h('h2', { key: 'h', className: 'font-display' }, 'About'), h('p', { key: 'p', className: 'body' }, c.hero.body)]),
        ],
      } as never),
    )
    // The Space page sits in the real member shell (header, left rail, right rail, all Frequency); only the page wears the kit.
    const shell = h(
      FrequencyMembersShell,
      {
        profile: { id: 'p1', display_name: 'Your name', handle: 'yourname', avatar_url: null, community_role: 'member' },
        previewVisitor: false,
        crew: true,
        stats: Promise.resolve(null),
        sidebar: h('div', { className: 'fqm-r-stack' }, h(GetStarted, { steps: [
          { key: 'a', label: 'Pick your look', blurb: 'New World is on.', cta: 'Done', href: '#', done: true },
          { key: 'b', label: 'Add your first meetup', blurb: 'Post a date and your people can RSVP.', cta: 'Add a meetup', href: '#', done: false },
          { key: 'c', label: 'Invite five people', blurb: 'Send your Space link to the people you already see.', cta: 'Copy the link', href: '#', done: false },
        ] })),
        sidebarMicro: null,
        banner: null,
        unreadCount: 0,
        messagesUnread: 0,
        myFrequency: { profileHref: '/people/yourname', drafts: 0, spaces: [], circles: [], total: 0 },
        operatesSpaces: false,
        staffRole: null,
        webRole: 'none',
        caps: [],
        availableContexts: [],
        skin: 'frequency',
        children: page,
      } as never,
    )
    writeFileSync(`${out}/${niche}-spacedesk.html`, shellDoc(await html(shell)))

  }
})
