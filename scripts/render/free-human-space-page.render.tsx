// FIXTURE RENDER: the in-app Free Human Space page (the module engine over the arranged layout from free-human-space-page-sql.render.tsx),
// inside the real Space chrome and the real Space style system, for the before/after pass. Writes $RENDER_OUT/fh-space-page.html.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/free-human-space-page.render.tsx
import { createElement as h, type ComponentProps } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync, readFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spaces/freehumanmovement', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
const seedEvents = vi.hoisted(() => ({ rows: [] as unknown[], profile: {} as unknown }))
vi.mock('@/lib/spaces/content-data', () => ({
  getSpaceContentData: async () => ({
    spaceId: 's1', aboutShort: 'Embodiment and child-rearing for women in their season of creation.', reviews: { average: 0, count: 0, latest: [], all: [], distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } },
    faqs: [
      { id: 'f1', question: 'Can I join in any month?', answer: 'Yes. Each season brings a new module of movement, teaching and ritual, so you can start whenever you are ready.' },
      { id: 'f2', question: 'Can I bring my baby?', answer: 'Yes. Come as you are and bring the baby.' },
    ],
    profile: seedEvents.profile, highlights: [], stats: [], events: seedEvents.rows, community: [], communityHref: null,
    team: [{ profileId: 'p1', name: 'Daniel Tyack', handle: 'danieltyack', avatarUrl: null, role: 'admin' }],
  }),
}))
vi.mock('@/lib/spaces/page-doc', async () => {
  const { resolveSpaceAuthoredContent } = await import('@/lib/spaces/authored-content')
  return { loadSpaceAuthoredContent: async (prefs: unknown, name: string) => resolveSpaceAuthoredContent(prefs, name) }
})

const out = process.env.RENDER_OUT
async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}

it('renders the Free Human Space page', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const sql = readFileSync(`${out}/free-human-space-page.sql`, 'utf8')
  const layout = JSON.parse(/'profileLayout', '(.*?)'::jsonb\)/s.exec(sql)![1]!.replace(/''/g, "'"))
  const offerings = JSON.parse(/'\{profileData,offerings\}', '(.*?)'::jsonb\)/s.exec(sql)![1]!.replace(/''/g, "'"))
  const { SpaceProfileModules } = await import('@/components/widgets/space-profile/space-profile-modules')
  const { FqSpaceChrome } = await import('@/components/frequency/members/space/space-chrome')
  const { AccentScope } = await import('@/components/spaces/accent-scope')
  const { spacePageSiteFaces, spacePageDefaultAccent } = await import('@/lib/theme/site-style')
  const { frequencyAccentVars } = await import('@/lib/spaces/accent')
  const { parseSpaceTheme } = await import('@/lib/theme/space-themes')
  const { parseEntityLayout } = await import('@/lib/entity-blocks/layout')
  const { readProfileData } = await import('@/lib/spaces/profile-data')
  const { FREE_HUMAN_SEED_EVENTS } = await import('@/lib/sites/free-human-seed-events')
  seedEvents.rows = FREE_HUMAN_SEED_EVENTS.slice(0, 5).map((e) => ({ id: e.id, slug: e.id, title: e.title, startsAt: e.startsAt.replace('+00', 'Z'), endsAt: e.endsAt.replace('+00', 'Z'), timeZone: 'America/Los_Angeles', description: e.summary }))
  const preferences = { siteStyle: { theme: 'free-human', synced: true, spaceFonts: 'classic' }, profileLayout: layout, profileData: { about: 'x', offerings } }
  seedEvents.profile = readProfileData(preferences)
  const space = { id: 's1', slug: 'freehumanmovement', type: 'business', brandName: 'Free Human Movement', logoUrl: '/sites/free-human/logo-mark.svg', coverUrl: '/sites/free-human/photos/heritage-madonna-nursing.webp', tagline: 'Embody. Create. Rise.', entitlements: {}, featureRoles: {}, preferences, profile: readProfileData(preferences) }
  const body = await SpaceProfileModules({ space: space as never, grid: parseEntityLayout(layout) })
  const accent = spacePageDefaultAccent(preferences, '')
  const page = h(
    AccentScope,
    { vars: null, fqAccent: frequencyAccentVars(accent), siteFaces: spacePageSiteFaces(preferences), theme: parseSpaceTheme('frequency') } as ComponentProps<typeof AccentScope>,
    h(FqSpaceChrome, { back: { href: '/spaces', label: 'Spaces' }, coverImage: space.coverUrl, name: space.brandName, tagline: h('p', { className: 'fqs-tagline' }, space.tagline), actions: [h('button', { key: 'a', className: 'btn pa' }, 'Become a member')], nav: h('nav', { className: 'tabs' }, ['Home', 'About', 'Team', 'Calendar'].map((t, i) => h('a', { key: t, href: '#', className: i === 0 ? 'on' : undefined }, t))), children: [body] } as never),
  )
  const doc = `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><link rel="stylesheet" href="fonts.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap"><style>:root{--font-lexend:Lexend,system-ui,sans-serif;--font-fh-cormorant:'Cormorant Garamond'}</style></head><body><div data-kit="members" data-energy="still"><div class="fq-members" style="max-width:1040px;margin:0 auto;padding:16px">${await html(page)}</div></div></body></html>`
  writeFileSync(`${out}/fh-space-page.html`, doc)
})
