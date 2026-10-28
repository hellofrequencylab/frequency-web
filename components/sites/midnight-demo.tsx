// THE MIDNIGHT DEMO SITE (LIVE-1382). One generic Midnight website with sample content, built from the coaches
// niche kit (lib/sites/kits/midnight-variants.ts) and drawn through the real site chrome and sections, so the
// feature page's live preview shows exactly what a Space's site is made of. No Space, no Supabase, no cookies:
// static, and every link points back at the demo itself.
import { SiteChrome } from '@/components/sites/site-chrome'
import { MensworkPage } from '@/components/sites/menswork-page'
import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import { planMensworkPage, type MwBlock } from '@/lib/sites/menswork-page'
import type { MwLive } from '@/lib/sites/menswork-data'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { midnightKit } from '@/lib/sites/kits/midnight-variants'
import { midnightAccentVars } from '@/lib/theme/midnight'

const NAME = 'Nocturne Studio'
const TAGLINE = 'Counsel, gatherings and journeys.'
const HOME = '/themes/nocturne/demo'
const LIVE: MwLive = { events: [], circles: [], journeys: [] }
const LINKS: SiteLinkMap = { origin: 'https://frequency.example', slug: 'nocturne', siteBase: '', pages: ['home'], contactHref: HOME, bookHref: HOME, email: null }
const METADATA = { space: { identity: { name: NAME }, slug: 'nocturne', tagline: TAGLINE, events: [], series: [], reviews: { count: 0, average: 0, latest: [] } }, links: LINKS }

export function MidnightDemo({ now = new Date() }: { now?: Date }) {
  const home = midnightKit('coaches').pages.find((p) => p.slug === 'home') ?? midnightKit('coaches').pages[0]
  const blocks = home.blocks.map((b, i) => ({ type: b.type, props: { id: `demo-${i}`, ...b.props } })) as MwBlock[]
  const plan = planMensworkPage(blocks)
  const menu = ['Offerings', 'Gatherings', 'Journeys', 'Membership'].map((label) => ({ href: HOME, label }))
  return (
    <div style={midnightAccentVars(null) as React.CSSProperties}>
      <SiteChrome
        brandName={NAME}
        homeHref={HOME}
        links={menu}
        cta={{ href: HOME, label: 'Book a session', external: false }}
        themeFonts
        skin={{ theme: 'midnight', season: 'fall' }}
        tagline={TAGLINE}
        showBrandFooter
      >
        <MensworkPage
          blocks={blocks}
          plan={plan}
          live={LIVE}
          links={LINKS}
          origin={LINKS.origin}
          pageTitle={home.label}
          now={now}
          renderOther={(b) => <BlockRender config={config} data={{ root: {}, content: [b] }} metadata={METADATA} />}
        />
      </SiteChrome>
    </div>
  )
}
