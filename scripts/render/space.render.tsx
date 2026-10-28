// FIXTURE RENDER: the Space page chrome and a member-area console pane, for a Space whose website wears a theme
// (the Network Theme Kit pass 8, ADR-1728 / ADR-1906 theme fence). Writes $RENDER_OUT/space-<variant>.html and
// $RENDER_OUT/console-<variant>.html, where <variant> is `frequency` (no website theme) or `network-kit` (website
// synced to the kit). The faces and the accent each page takes come from the SAME resolvers the routes call
// (spacePageSiteFaces, spacePageDefaultAccent, memberSpaceFonts), so the console renders with what a console gets.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/space.render.tsx
import { createElement as h } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spaces/table-nine', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

const out = process.env.RENDER_OUT
const P = '/brand/frequency/photos/'

async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}
const doc = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><link rel="stylesheet" href="fonts.css"><style>:root{--font-lexend:Lexend,system-ui,sans-serif}</style></head><body><div data-kit="members" data-energy="still"><div class="fq-members" style="max-width:1040px;margin:0 auto;padding:16px">${body}</div></div></body></html>`

// A Space whose owner picked the Network kit and kept the page synced; the other has no website theme.
const PREFS = { frequency: {}, 'network-kit': { siteStyle: { theme: 'network-kit', synced: true } } } as const

it('renders the Space page and a console pane', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { FqSpaceChrome } = await import('@/components/frequency/members/space/space-chrome')
  const { AccentScope } = await import('@/components/spaces/accent-scope')
  const { SettingsPanes } = await import('@/components/frequency/members/settings/settings-panes')
  const { spacePageSiteFaces, spacePageDefaultAccent, memberSpaceFonts } = await import('@/lib/theme/site-style')
  const { frequencyAccentVars } = await import('@/lib/spaces/accent')
  const { parseSpaceTheme } = await import('@/lib/theme/space-themes')

  for (const variant of ['frequency', 'network-kit'] as const) {
    const prefs = PREFS[variant]
    const faces = spacePageSiteFaces(prefs)
    // A Space with no website theme and no brand color keeps the design's own fill (null accent).
    const accent = variant === 'frequency' ? null : spacePageDefaultAccent(prefs, '')
    const nav = h('nav', { className: 'tabs' }, ['Home', 'Calendar', 'Offerings', 'Membership', 'Library'].map((t, i) => h('a', { key: t, href: '#', className: i === 0 ? 'on' : undefined }, t)))
    const page = h(
      AccentScope,
      { vars: null, fqAccent: frequencyAccentVars(accent), siteFaces: faces, theme: parseSpaceTheme('frequency') },
      h(
        FqSpaceChrome,
        {
          back: { href: '/spaces', label: 'Spaces' },
          coverImage: `${P}gathering-02.jpg`,
          name: 'Table Nine',
          tagline: h('p', { className: 'fqs-tagline' }, 'Meetups, members and a place to sit down.'),
          actions: [h('button', { key: 'a', className: 'btn pa' }, 'Come to a meetup'), h('button', { key: 'b', className: 'btn' }, 'Follow')],
          nav,
          children: [
            h('section', { key: 's1', className: 'stack' }, [
              h('h2', { key: 'h', className: 'font-display' }, 'Coming up'),
              h('div', { key: 'p', className: 'panel' }, [h('span', { key: 'b', className: 'ev-badge feat' }, 'Featured'), h('p', { key: 't', className: 'body' }, 'Friday coffee, 9:00 AM, the courtyard on Main Street. First visits are free.')]),
            ]),
            h('section', { key: 's2', className: 'stack' }, [h('h2', { key: 'h', className: 'font-display' }, 'Membership'), h('p', { key: 'p', className: 'body' }, 'Join the group and get the member dates first.')]),
          ],
        } as never,
      ),
    )
    writeFileSync(`${out}/space-${variant}.html`, doc(await html(page)))

    // THE CONSOLE: a member-area pane. It reads memberSpaceFonts, never the website theme, so it gets the house set.
    const fonts = memberSpaceFonts(prefs)
    const pane = (key: string, label: string, text: string) => ({ key, label, anchors: [], content: h('p', { className: 'body' }, text) })
    const panes = [pane('account', 'Account', 'Your name, email and password.'), pane('privacy', 'Privacy', 'Who can see you.'), pane('billing', 'Plan', 'Your membership.')]
    const consoleEl = h('div', { 'data-space-console-fonts': fonts }, [h('h1', { key: 'h', className: 'h1' }, 'Table Nine'), h(SettingsPanes, { key: 'p', panes, initial: 'account' })])
    writeFileSync(`${out}/console-${variant}.html`, doc(await html(consoleEl)))
  }
})
