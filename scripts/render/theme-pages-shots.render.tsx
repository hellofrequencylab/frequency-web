// FIXTURE RENDER: the Website, Spotlight, Space and Email pictures for the Bold, Wildheart and Services theme pages
// (/themes/bold, /themes/wildheart, /themes/services), as bare HTML pages. Same four surfaces as /themes/new-world and
// the same real components: the Website is the theme's starter kit Home through the real SiteChrome, blocks and skin; the
// Spotlight is the real SpotlightShell on the theme's own preset; the Space is a Space page inside the real member shell
// (only the Space area wears the theme's faces and accent); the Email is the real campaign mail in the theme's colours.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/theme-pages-shots.render.tsx
// then node scripts/render/theme-pages-shots.mjs <dir>
import { createElement as h, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string, className: p.className as string, style: (p.fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...(p.style as object) } : p.style) as never }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spaces/table-nine', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

import { SERVICES_ACCENTS } from '@/lib/theme/services'
import { CYBERWITCH_ACCENTS } from '@/lib/theme/cyberwitch'

const SERVICES_TIDE = SERVICES_ACCENTS.tide.accent
// CW_ACCENT=<absinthe|ice|blood|venom> renders CyberWitch in that neon (its own photos, accent and email fill), for the theme
// page's accent picker; unset is Hex, the default pictures.
const CW = (process.env.CW_ACCENT && process.env.CW_ACCENT in CYBERWITCH_ACCENTS ? process.env.CW_ACCENT : 'hex') as keyof typeof CYBERWITCH_ACCENTS
const CYBERWITCH_HEX = CYBERWITCH_ACCENTS[CW].accent
const out = process.env.RENDER_OUT
const ROOT = process.cwd()
const face = (fam: string, f: string, style = 'normal', w = '100 900') => `@font-face{font-family:"${fam}";src:url("file://${ROOT}/app/fonts/${f}") format("woff2");font-style:${style};font-weight:${w}}`
const FACES = face('Bricolage Grotesque', 'bricolage-grotesque/bricolage-grotesque.woff2', 'normal', '200 800') + face('Lora', 'lora/lora.woff2', 'normal', '400 700') + face('DM Mono', 'dm-mono/dm-mono-400.woff2', 'normal', '400') + face('DM Mono', 'dm-mono/dm-mono-500.woff2', 'normal', '500') + face('Unbounded', 'unbounded/unbounded.woff2', 'normal', '200 900') + face('Hanken Grotesk', 'hanken-grotesk/hanken-grotesk.woff2') + face('Instrument Serif', 'instrument-serif/instrument-serif-italic.woff2', 'italic', '400') + face('UnifrakturCook', 'unifrakturcook/unifrakturcook-700.woff2', 'normal', '700') + face('Permanent Marker', 'permanent-marker/permanent-marker-400.woff2', 'normal', '400') + face('Spectral', 'spectral/spectral-400.woff2', 'normal', '400') + face('Spectral', 'spectral/spectral-500.woff2', 'normal', '500') + face('Spectral', 'spectral/spectral-600.woff2', 'normal', '600') + face('Spectral', 'spectral/spectral-700.woff2', 'normal', '700')
// Bold's three faces (Sofia Sans Extra Condensed, Barlow, IBM Plex Mono). next/font defines these as --font-* variables on <html>
// in the app; a bare page has to name them, or Bold's headlines fall back to Arial (the 2026-11-04 audit: /themes/bold showed Arial).
const BOLD_FACES =
  face('Sofia Sans Extra Condensed', 'sofia-sans-extra-condensed/sofia-sans-extra-condensed.woff2', 'normal', '1 1000') +
  [400, 500, 600].map((w) => face('Barlow', `barlow/barlow-${w}.woff2`, 'normal', String(w))).join('') +
  [400, 500].map((w) => face('IBM Plex Mono', `ibm-plex-mono/ibm-plex-mono-${w}.woff2`, 'normal', String(w))).join('')
const BOLD_VARS = '--font-sofia-xc:"Sofia Sans Extra Condensed";--font-barlow:Barlow;--font-plex-mono:"IBM Plex Mono";'
// Wildheart's faces (IM Fell English display, EB Garamond body, Hanken labels, Noto Sans Symbols for the zodiac glyphs) and Playfair,
// which the Spotlight 'serif' font reads as --font-playfair. next/font sets these variables in the app; a bare page names them here.
const ttf = (fam: string, f: string, style: string) => `@font-face{font-family:"${fam}";src:url("file://${ROOT}/public/fonts/wildheart/${f}") format("truetype");font-style:${style};font-weight:400}`
const WH_FACES =
  ttf('IM Fell English', 'IMFellEnglish-Regular.ttf', 'normal') + ttf('IM Fell English', 'IMFellEnglish-Italic.ttf', 'italic') +
  face('EB Garamond', 'eb-garamond/eb-garamond.woff2', 'normal', '400 800') + face('EB Garamond', 'eb-garamond/eb-garamond-italic.woff2', 'italic', '400 800') +
  face('Noto Sans Symbols', 'noto-sans-symbols/noto-sans-symbols.woff2') + face('Playfair Display', 'playfair-display/playfair-display.woff2', 'normal', '400 900')
const WH_VARS = '--font-wh-fell:"IM Fell English";--font-wh-garamond:"EB Garamond";--font-wh-hanken:"Hanken Grotesk";--font-wh-symbols:"Noto Sans Symbols";--font-playfair:"Playfair Display";'
const pub = (html: string) => html.replace(/ loading="lazy"/g, '').replace(/(src|href)="\/(sites|brand|themes|create-a-space)\//g, `$1="file://${ROOT}/public/$2/`).replace(/url\(&quot;\/(sites|brand|themes)\//g, `url(&quot;file://${ROOT}/public/$1/`)

type Skin = { theme: 'menswork' | 'wildheart' | 'services' | 'cyberwitch'; season: 'fall' } | null
const THEMES: { ed: 'Menswork' | 'Wildheart' | 'Services' | 'CyberWitch'; id: string; mega: 'bold' | 'wildheart' | 'services' | 'cyberwitch'; kit: string; skin: Skin; photo: string; cover: string; accent: string }[] = [
  { ed: 'Menswork', id: 'bold', mega: 'bold', kit: 'bold-coaches', skin: { theme: 'menswork', season: 'fall' }, photo: '/brand/frequency/photos/gathering-10.jpg', cover: '/brand/frequency/photos/gathering-12.jpg', accent: '#1F8A8A' },
  { ed: 'Wildheart', id: 'wildheart', mega: 'wildheart', kit: 'wildheart-coaches', skin: { theme: 'wildheart', season: 'fall' }, photo: '/brand/wildheart/photos/huddle.jpg', cover: '/brand/wildheart/photos/sisters-shore.jpg', accent: '#6E4D96' },
  // Services: the General kit on Night, in its Tide starting accent (SERVICES_ACCENTS.tide).
  { ed: 'Services', id: 'services', mega: 'services', kit: 'services-general', skin: { theme: 'services', season: 'fall' }, photo: '/sites/services/hero-squeegee.webp', cover: '/sites/services/hero-squeegee.webp', accent: SERVICES_TIDE },
  // CyberWitch: the General kit in its Hex starting accent (CYBERWITCH_ACCENTS.hex), dark only.
  { ed: 'CyberWitch', id: 'cyberwitch', mega: 'cyberwitch', kit: 'cyberwitch-general', skin: { theme: 'cyberwitch', season: 'fall' }, photo: `/sites/cyberwitch/photos/founder-${CW}.jpg`, cover: `/sites/cyberwitch/photos/hero-${CW}.jpg`, accent: CYBERWITCH_HEX },
]

async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}
const shellDoc = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><link rel="stylesheet" href="fonts.css"><style>:root{--font-lexend:Lexend,system-ui,sans-serif;${BOLD_VARS}${WH_VARS}}html{scrollbar-width:none}</style></head><body>${body}</body></html>`

it('renders the Bold, Wildheart and Services surfaces', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const only = process.env.THEME_ONLY
  const { WebsiteDocument } = await import('@/components/sites/website-document')
  const { websiteThemeVars, WEBSITE_TOKEN_CSS } = await import('@/lib/sites/editor/theme')
  const { config } = await import('@/lib/page-editor/config')
  const { applyKit } = await import('@/lib/sites/kits/apply')
  const { loadKit } = await import('@/lib/sites/kits/registry')
  const { SiteChrome } = await import('@/components/sites/site-chrome')
  const { HOUSE_CSS } = await import('@/components/sites/house-css')
  const { FREQUENCY_PAGE_CSS } = await import('@/components/sites/frequency-page-css')
  const { MENSWORK_CSS } = await import('@/components/sites/menswork-css')
  const { MENSWORK_PAGE_CSS } = await import('@/components/sites/menswork-page-css')
  const { WILDHEART_CSS } = await import('@/components/sites/wildheart-css')
  const { SERVICES_SITE_CSS } = await import('@/components/sites/services-css')
  const { servicesAccentVars } = await import('@/lib/theme/services')
  const { CYBERWITCH_CSS } = await import('@/components/sites/cyberwitch-css')
  const { cyberwitchAccentVars } = await import('@/lib/theme/cyberwitch')
  const { SpotlightShell: Shell } = await import('@/components/spotlight/spotlight-shell')
  const { THEME_PRESETS } = await import('@/lib/spotlight/theme')
  const { FqSpaceChrome } = await import('@/components/frequency/members/space/space-chrome')
  const { FrequencyMembersShell } = await import('@/components/frequency/members/shell/members-shell')
  const { GetStarted } = await import('@/components/frequency/members/shell/get-started')
  const { AccentScope } = await import('@/components/spaces/accent-scope')
  const { spacePageSiteFaces } = await import('@/lib/theme/site-style')
  const { frequencyAccentVars } = await import('@/lib/spaces/accent')
  const { parseSpaceTheme } = await import('@/lib/theme/space-themes')
  const { planMegaTheme } = await import('@/lib/theme/apply-mega-theme')
  const { spaceEmailBrand } = await import('@/lib/spaces/email-colors')
  const { renderCampaignHtml } = await import('@/lib/spaces/campaign-html')

  for (const t of THEMES) {
    if (only && only !== t.id) continue
    // ---- Website: the theme's starter kit Home through the real chrome and blocks.
    const kit = (await loadKit(t.kit))!
    const r = applyKit({ theme: kit.theme, pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (!r.ok) throw new Error(r.error)
    const home = r.snapshot.pages.find((p) => p.slug === 'home' || p.slug === '') ?? r.snapshot.pages[0]!
    for (const b of home.doc.content as { type: string; props: Record<string, unknown> }[]) {
      if (b.type === 'ServicesHero' || b.type === 'Hero') b.props.image = t.id === 'cyberwitch' ? t.cover : t.photo
      // Bold's kit hero is text-only; the design puts the headline above a full-width photo, so the picture shows the photo variant.
      if (b.type === 'PhotoHero' && t.id === 'wildheart') Object.assign(b.props, { variant: 'image', image: t.cover, alt: 'Women gathered on a beach in warm light', height: 'medium', display: 'below' })
      if (b.type === 'PhotoHero' && t.id === 'bold') Object.assign(b.props, { variant: 'image', image: t.photo, alt: 'People gathered on a beach at sunset', height: 'medium', display: 'below' })
    }
    // The Wildheart chrome already carries the sky line under the menu; the kit's own line block would print it twice in one frame.
    if (t.id === 'wildheart') home.doc.content = (home.doc.content as { type: string }[]).filter((b) => b.type !== 'WildheartNowLine') as never
    const links = { origin: 'https://example.com', slug: 'table-nine', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }
    const body = h(WebsiteDocument as never, { doc: home.doc, theme: t.ed, config, live: { events: [], circles: [], journeys: [] }, links, origin: links.origin, title: 'Home', metadata: { space: { name: 'Table Nine', faqs: [] } } } as never)
    const site = renderToStaticMarkup(
      h(
        SiteChrome as never,
        {
          brandName: 'Table Nine',
          homeHref: '/',
          links: [{ label: 'Offerings', href: '/services' }, { label: 'Events', href: '/events' }, { label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' }],
          cta: { href: '/book', label: 'Book a visit', external: false },
          themeFonts: false,
          skin: t.skin,
          tagline: null,
          seasonNow: null,
          footer: { columns: [], blurb: 'Small groups, real people, every week.', line: null, note: null, copyright: null, suffix: null, subscribe: null, utility: null },
          credit: 'badge',
          spaceSlug: null,
          previewMega: null,
        } as never,
        body,
      ),
    )
    const vars = Object.entries(websiteThemeVars(t.ed as never, t.mega === 'cyberwitch' ? t.accent : null, new Date('2026-10-15'))).map(([k, v]) => `${k}:${v}`).join(';').replace(/"/g, "'")
    const skinCss = t.skin === null ? FREQUENCY_PAGE_CSS : t.skin.theme === 'wildheart' ? FREQUENCY_PAGE_CSS + WILDHEART_CSS : t.skin.theme === 'services' ? FREQUENCY_PAGE_CSS + SERVICES_SITE_CSS : t.skin.theme === 'cyberwitch' ? FREQUENCY_PAGE_CSS + CYBERWITCH_CSS : MENSWORK_CSS + MENSWORK_PAGE_CSS
    // Services draws the owner's accent from the accent scope above its skin, the way the live site does (AccentScope).
    const accentVars = t.mega === 'services' ? Object.entries(servicesAccentVars(t.accent) ?? {}).map(([k, v]) => `${k}:${v}`).join(';') + ';' : t.mega === 'cyberwitch' ? Object.entries(cyberwitchAccentVars(t.accent) ?? {}).map(([k, v]) => `${k}:${v}`).join(';') + ';' : ''
    writeFileSync(`${out}/${t.id}-site.html`, pub(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="file://${out}/app.css"><style>${FACES}${BOLD_FACES}${WH_FACES}:root{${BOLD_VARS}${WH_VARS}}${HOUSE_CSS}${WEBSITE_TOKEN_CSS}${skinCss}*,*::before,*::after{box-sizing:border-box}html{scrollbar-width:none}body{margin:0}</style></head><body><div style="${accentVars}"><div data-website-theme="${t.ed}" data-house-site style="${vars}">${site}</div></div></body></html>`))

    // ---- Spotlight: the real shell on the theme's own preset.
    const preset = THEME_PRESETS.find((p) => p.id === t.mega)!.theme
    const data = {
      profile: { display_name: 'Maya Torres', handle: 'maya', bio: 'I host small movement circles on the coast. Come as you are.', avatar_url: t.id === 'wildheart' ? '/brand/wildheart/photos/forest-witch.jpg' : t.id === 'cyberwitch' ? t.photo : null, header_image_url: t.cover, community_role: null, nexus_regions: { name: 'North County San Diego' }, profile_theme: null },
      hostedEvents: [], canTip: false, programs: { circles: [], journeys: [], spaces: [] }, layout: { blocks: [] },
      background: { assetPath: null, dim: 0, focusX: 50, focusY: 50, zoom: 100 }, theme: t.mega === 'cyberwitch' ? { ...preset, layout: 'cyberwitch-kit:stack', kit: 'general', accent: t.accent.toLowerCase() } : preset, totalZaps: 0, contributionCounts: { eventsHosted: 0, journeysFinished: 0 }, guestbook: [], grid: null,
    }
    const linkCards = ['Join the Thursday circle', 'This month’s dates', 'Book a first visit'].map((l) => h('a', { key: l, href: '#', style: { display: 'block', marginTop: 12, padding: 16, fontWeight: 600, color: 'var(--color-text)', background: 'var(--color-surface-elevated)', border: '1px solid color-mix(in srgb, var(--color-text) 18%, transparent)', borderRadius: ({ none: 0, sm: 6, md: 12, lg: 18, xl: 28 } as Record<string, number>)[preset.card.radius] ?? 18, textDecoration: 'none' } }, l))
    const spot = await html(h(Shell as never, { data, showBio: true, sampleContent: true } as never, h('div', null, linkCards)))
    writeFileSync(`${out}/${t.id}-spot.html`, shellDoc(spot))

    // ---- Space: a Space page inside the real member shell.
    const prefs = planMegaTheme({}, t.mega) as Record<string, unknown>
    const nav = h('nav', { className: 'tabs' }, ['Home', 'Calendar', 'Offerings', 'About', 'Library'].map((n, i) => h('a', { key: n, href: '#', className: i === 0 ? 'on' : undefined }, n)))
    const page = h(
      AccentScope,
      { vars: null, fqAccent: frequencyAccentVars(t.accent), siteFaces: spacePageSiteFaces({ siteStyle: { theme: t.mega, synced: true } } as never), theme: parseSpaceTheme('frequency') } as ComponentProps<typeof AccentScope>,
      h(FqSpaceChrome, {
        back: { href: '/spaces', label: 'Spaces' },
        coverImage: t.cover,
        name: 'Table Nine',
        tagline: h('p', { className: 'fqs-tagline' }, 'Small groups, real people, every week.'),
        actions: [h('button', { key: 'a', className: 'btn pa' }, 'Book a visit'), h('button', { key: 'b', className: 'btn' }, 'Follow')],
        nav,
        children: [
          h('section', { key: 's1', className: 'stack' }, [
            h('h2', { key: 'h', className: 'font-display' }, 'Next gathering'),
            h('div', { key: 'p', className: 'panel' }, [h('span', { key: 'b', className: 'ev-badge feat' }, 'Featured'), h('p', { key: 't', className: 'body' }, 'Thursday circle, 6:30 pm. Bring a friend.')]),
          ]),
          h('section', { key: 's2', className: 'stack' }, [h('h2', { key: 'h', className: 'font-display' }, 'About'), h('p', { key: 'p', className: 'body' }, 'Small groups, real people, every week.')]),
        ],
      } as never),
    )
    const shell = h(
      FrequencyMembersShell,
      {
        profile: { id: 'p1', display_name: 'Your name', handle: 'yourname', avatar_url: null, community_role: 'member' },
        previewVisitor: false, crew: true, stats: Promise.resolve(null),
        sidebar: h('div', { className: 'fqm-r-stack' }, h(GetStarted, { steps: [
          { key: 'a', label: 'Pick your look', blurb: 'Your theme is on.', cta: 'Done', href: '#', done: true },
          { key: 'b', label: 'Add your first meetup', blurb: 'Post a date and your people can RSVP.', cta: 'Add a meetup', href: '#', done: false },
          { key: 'c', label: 'Invite five people', blurb: 'Send your Space link to the people you already see.', cta: 'Copy the link', href: '#', done: false },
        ] })),
        sidebarMicro: null, banner: null, unreadCount: 0, messagesUnread: 0,
        myFrequency: { profileHref: '/people/yourname', drafts: 0, spaces: [], circles: [], total: 0 },
        operatesSpaces: false, staffRole: null, webRole: 'none', caps: [], availableContexts: [], skin: 'frequency', children: page,
      } as never,
    )
    writeFileSync(`${out}/${t.id}-spacedesk.html`, shellDoc(await html(shell)))

    // ---- Email: a Space campaign wearing the theme's colours.
    // Services has its own kit email (lib/theme/services-kit-email.ts), the one its Spaces send: a welcome on Night in the Tide accent.
    if (t.mega === 'cyberwitch') {
      const { cyberwitchKitEmail } = await import('@/lib/theme/cyberwitch-kit-email')
      const { CYBERWITCH_SURFACE } = await import('@/lib/theme/cyberwitch')
      const cw = cyberwitchKitEmail('welcome', { name: 'Ash & Ember', descriptor: 'Readings, ritual and spellwork', owner: 'Mara Quill', role: 'Reader', city: 'San Diego', accent: CW === 'hex' ? { fill: CYBERWITCH_SURFACE.accent.accent, text: CYBERWITCH_SURFACE.accent.text } : { fill: CYBERWITCH_ACCENTS[CW].accent, text: CYBERWITCH_ACCENTS[CW].text }, postalLine: 'Ash & Ember, San Diego', siteUrl: 'https://example.com', siteLabel: 'ashandember.example', unsubscribeUrl: 'https://example.com/unsubscribe' })
      writeFileSync(`${out}/${t.id}-email.html`, cw.html)
      continue
    }
    if (t.mega === 'services') {
      const { servicesKitEmail } = await import('@/lib/theme/services-kit-email')
      const { SERVICES_SURFACE } = await import('@/lib/theme/services')
      const sv = servicesKitEmail('welcome', { name: 'Table Nine', descriptor: 'Home repair & maintenance', owner: 'Maya Torres', role: 'Owner', city: 'San Diego', accent: { fill: SERVICES_SURFACE.accent.accent, text: SERVICES_SURFACE.accent.text }, register: 'night', postalLine: 'Table Nine, San Diego', siteUrl: 'https://example.com', siteLabel: 'tablenine.example', unsubscribeUrl: 'https://example.com/unsubscribe' })
      writeFileSync(`${out}/${t.id}-email.html`, sv.html)
      continue
    }
    const brand = spaceEmailBrand({ name: 'Table Nine', brandName: 'Table Nine', brandAccent: t.accent, preferences: prefs } as never)
    const mail = renderCampaignHtml('Hi there,\n\nThe Thursday circle is back this week at 6:30 pm. Bring a friend and a layer, we will bring the tea.\n\nNew this month: a Saturday morning walk for anyone who wants an easy start to the weekend. No sign-up needed, just show up.\n\nSee you there,\nMaya', { brand, sentWithFrequency: true })
    writeFileSync(`${out}/${t.id}-email.html`, mail.replace(/https:\/\/frequencylocal\.com\/(brand|sites)\//g, `file://${ROOT}/public/$1/`))
  }
})
