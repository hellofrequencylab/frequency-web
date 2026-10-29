// FIXTURE RENDER: the Network Theme Kit's Space page and note email for each of its thirteen profiles, as bare HTML
// pages (the pictures on /themes/network: public/themes/network-kit/shots/<kit>-spacedesk.jpg and <kit>-email.jpg).
// A profile wears one of the four schemes (NETWORK_KIT_PROFILE_SCHEME): the Space page takes the scheme's accent
// through the same resolvers the route calls, and the email is the kit's own note in that scheme.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/network-kit-shots.render.tsx
// then node scripts/render/network-kit-shots.mjs $RENDER_OUT
import { createElement as h, type ComponentProps } from 'react'
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
const shellDoc = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><link rel="stylesheet" href="fonts.css"><style>:root{--font-lexend:Lexend,system-ui,sans-serif}html{scrollbar-width:none}</style></head><body>${body}</body></html>`

const DATES = [
  { lead: 'Nov 6', title: 'Friday coffee', sub: '9:00 AM · The courtyard, Main Street' },
  { lead: 'Nov 12', title: 'Newcomer table', sub: '6:00 PM · Downtown library' },
  { lead: 'Nov 20', title: 'Show and tell', sub: '9:00 AM · The courtyard, Main Street' },
]

it('renders the Space page and the note email for each profile', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { FqSpaceChrome } = await import('@/components/frequency/members/space/space-chrome')
  const { FrequencyMembersShell } = await import('@/components/frequency/members/shell/members-shell')
  const { GetStarted } = await import('@/components/frequency/members/shell/get-started')
  const { AccentScope } = await import('@/components/spaces/accent-scope')
  const { spacePageSiteFaces } = await import('@/lib/theme/site-style')
  const { frequencyAccentVars } = await import('@/lib/spaces/accent')
  const { parseSpaceTheme } = await import('@/lib/theme/space-themes')
  const { NETWORK_KIT_PROFILES, NETWORK_KIT_SCHEMES, networkKitProfileScheme } = await import('@/lib/theme/network-kit')
  const { networkKitNoteEmail } = await import('@/lib/theme/network-kit-email')
  const { networkKitProfileName } = await import('@/lib/spotlight/network-kit-content')

  const prefs = { siteStyle: { theme: 'network-kit', synced: true } }
  for (const profile of NETWORK_KIT_PROFILES) {
    const scheme = networkKitProfileScheme(profile)
    const nav = h('nav', { className: 'tabs' }, ['Home', 'Calendar', 'Offerings', 'Membership', 'Library'].map((t, i) => h('a', { key: t, href: '#', className: i === 0 ? 'on' : undefined }, t)))
    const page = h(
      AccentScope,
      { vars: null, fqAccent: frequencyAccentVars(NETWORK_KIT_SCHEMES[scheme].accent), siteFaces: spacePageSiteFaces(prefs), theme: parseSpaceTheme('frequency') } as ComponentProps<typeof AccentScope>,
      h(FqSpaceChrome, {
        back: { href: '/spaces', label: 'Spaces' },
        coverImage: `${P}gathering-02.jpg`,
        name: networkKitProfileName(profile),
        tagline: h('p', { className: 'fqs-tagline' }, 'Meetups, members and a place to sit down.'),
        actions: [h('button', { key: 'a', className: 'btn pa' }, 'Come to a meetup'), h('button', { key: 'b', className: 'btn' }, 'Follow')],
        nav,
        children: [
          h('section', { key: 's1', className: 'stack' }, [
            h('h2', { key: 'h', className: 'font-display' }, 'Coming up'),
            h('div', { key: 'p', className: 'panel' }, [h('span', { key: 'b', className: 'ev-badge feat' }, 'Featured'), h('p', { key: 't', className: 'body' }, 'Friday coffee, 9:00 AM, the courtyard on Main Street.')]),
          ]),
          h('section', { key: 's2', className: 'stack' }, [h('h2', { key: 'h', className: 'font-display' }, 'Membership'), h('p', { key: 'p', className: 'body' }, 'Join the group and get the member dates first.')]),
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
          { key: 'a', label: 'Pick your look', blurb: 'The Network kit is on.', cta: 'Done', href: '#', done: true },
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
    writeFileSync(`${out}/${profile}-spacedesk.html`, shellDoc(await html(shell)))

    const mail = networkKitNoteEmail(
      { profile, scheme, spaceName: networkKitProfileName(profile), mastheadNote: 'Meetups · Members', postalLine: 'Frequency, North County San Diego', siteUrl: 'https://tablenine.example', siteLabel: 'tablenine.example', unsubscribeUrl: 'https://frequencylocal.com/unsubscribe/s', manageUrl: 'https://frequencylocal.com/manage-emails' },
      { subject: 'This Friday, and one member worth knowing', title: 'Your people are', em: 'already here.', lead: 'Coffee is at 9:00. This week a member shares how she found her first clients at this table. Bring a friend.', ctaLabel: 'Come to a meetup', ctaUrl: 'https://tablenine.example/meetups', coverUrl: 'https://frequencylocal.com/sites/network-kit/photos/photo-07.jpg', coverAlt: 'People at a long table, talking.', feature: { kicker: 'Coming up', title: 'The next few dates', rows: DATES, ctaLabel: 'See all dates', ctaUrl: 'https://tablenine.example/meetups' }, quote: { text: 'I came for the coffee and left with three introductions.', who: 'Maya', role: 'Member' } },
    )
    writeFileSync(`${out}/${profile}-email.html`, mail.html)
  }
})
