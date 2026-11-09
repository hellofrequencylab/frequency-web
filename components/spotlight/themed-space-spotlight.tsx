import type { ReactNode } from 'react'
import type { Space } from '@/lib/spaces/types'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { readSpaceSpotlight, spotlightSiteGrid } from '@/lib/spaces/spotlight'
import { readSiteStyle } from '@/lib/theme/site-style'
import { asSpotlightLook, spaceLayoutId, spaceLooksFor, type SpotlightLook } from '@/lib/spotlight/layouts'
import { overlaySpaceOnKit, spaceFactsFromGrid, type SpaceSpotlightFacts } from '@/lib/spotlight/space-kit-page'
import { presetForAccent } from '@/lib/spotlight/space-accent'
import { SpaceProfileModules } from '@/components/widgets/space-profile/space-profile-modules'
import { NewWorldKitSpotlightLayout } from '@/components/spotlight/new-world-kit-layouts'
import { NEW_WORLD_FONT_CLASS } from '@/components/sites/new-world-fonts'
import { newWorldKitSpotlightContent, newWorldLinkPageContent, newWorldProfilePageContent } from '@/lib/spotlight/new-world-kit-content'
import { CyberWitchKitSpotlightLayout } from '@/components/spotlight/cyberwitch-kit-layouts'
import { CYBERWITCH_FONT_CLASS } from '@/components/sites/cyberwitch-fonts'
import { cyberwitchSpacePage } from '@/lib/spotlight/cyberwitch-space-page'
import { ServicesKitSpotlightLayout } from '@/components/spotlight/services-kit-layouts'
import { SERVICES_FONT_CLASS } from '@/components/sites/services-fonts'
import { servicesKitSpotlightContent } from '@/lib/spotlight/services-kit-content'
import { DesignerKitSpotlightLayout } from '@/components/spotlight/designer-kit-layouts'
import { designerKitSpotlightContent, designerProfileForAccent } from '@/lib/spotlight/designer-kit-content'
import { TempleKitSpotlightLayout } from '@/components/spotlight/temple-kit-layouts'
import { TEMPLE_FONT_CLASS } from '@/components/sites/temple-fonts'
import { templeKitSpotlightContent } from '@/lib/spotlight/temple-kit-content'
import { FreeHumanSpotlightLayout } from '@/components/spotlight/free-human-layouts'
import { FREE_HUMAN_FONT_CLASS } from '@/components/sites/free-human-fonts'
import { freeHumanSpotlightContent } from '@/lib/spotlight/free-human-content'
import { NetworkKitSpotlightLayout } from '@/components/spotlight/network-kit-layouts'
import { networkKitSpotlightContent } from '@/lib/spotlight/network-kit-content'
import { NEW_WORLD_ACCENTS } from '@/lib/theme/new-world'
import { SERVICES_ACCENTS } from '@/lib/theme/services'
import { NETWORK_KIT_SCHEMES } from '@/lib/theme/network-kit'
import { TEMPLE_KIT_PROFILES } from '@/lib/theme/temple-kit'
import { FREE_HUMAN_PROFILES } from '@/lib/theme/free-human'

// THE THEMED SPACE SPOTLIGHT. One component draws a Space's Spotlight on any theme that has whole-page layouts (New World,
// Services, Network, Designer, Temple, Free Human, CyberWitch), in the look the owner picked in the console (default: the
// theme's Stack). The public page (components/spotlight/space-spotlight.tsx) and the console preview
// (app/(main)/spaces/[slug]/manage/spotlight/page.tsx) both draw THIS, so what the editor shows is what the link shows.
// The owner's Links become the doors and the Button the main call; every other Spotlight block (About, Contact form, ...)
// keeps its real renderer below. A theme without layouts (Nocturne, Bold, Wildheart) is not drawn here: it keeps the block page.

/** True when this Space's theme has whole-page Spotlight layouts. */
export function spotlightWearsTheme(space: Pick<Space, 'preferences'>): boolean {
  return spaceLooksFor(readSiteStyle(space.preferences).theme).length > 0
}

/** The look a Space's Spotlight wears: the owner's pick when the theme offers it, else the Stack. */
export function spotlightLookOf(space: Pick<Space, 'preferences'>): SpotlightLook {
  const stored = asSpotlightLook(readSpaceSpotlight(space.preferences).look)
  const theme = readSiteStyle(space.preferences).theme
  return stored && spaceLooksFor(theme).some((l) => l.look === stored) ? stored : 'stack'
}

type Grid = ReturnType<typeof import('@/lib/spaces/spotlight').spaceSpotlightGrid>

/** The grid without the rows the layout itself draws (the Links, and the Button when it is the main call). */
function restOf(grid: Grid, drop: ReadonlySet<string>): Grid {
  const rest: Grid = { ...grid, rows: (grid.rows ?? []).filter((r) => !r.cells.every((c) => c.every((id) => drop.has(id)))) }
  if (grid.nodes) rest.nodes = { ...grid.nodes, rows: grid.nodes.rows.filter((r) => !r.cells.every((c) => c.every((n) => drop.has(n.type)))) }
  return rest
}

/** Draws the Space's Spotlight in its theme's look. `saved` is the Space's own saved grid (never the website-narrowed one:
 *  the layouts draw the owner's links, and the leftover blocks narrow themselves on a website host). */
export function ThemedSpaceSpotlight({ space, tagline, saved, appOrigin }: { space: Space; tagline: string | null; saved: Grid; appOrigin?: string }): ReactNode {
  const theme = readSiteStyle(space.preferences).theme
  const look = spotlightLookOf(space)
  const layout = spaceLayoutId(theme, look)
  if (!layout) return null
  const name = space.brandName?.trim() || space.name
  const facts: SpaceSpotlightFacts = spaceFactsFromGrid({ slug: space.slug, name, tagline, appOrigin }, saved.content)
  const portrait = space.brandLogoUrl ?? undefined
  const cover = space.coverImageUrl ?? undefined
  const photo = cover ?? portrait
  const accent = space.brandAccent
  const email = (space.preferences as { profileData?: { email?: unknown } } | null)?.profileData?.email
  // The button the layout draws as its main call is dropped from the blocks below; the Profile look on New World keeps it there.
  let drop = new Set(['links'])
  const wrap = (fonts: string | undefined, inner: ReactNode, main = true) => (
    <div className={`spotlight-root relative${fonts ? ` ${fonts}` : ''}`}>
      {main ? <main className="relative mx-auto max-w-xl">{inner}</main> : inner}
    </div>
  )
  let body: ReactNode = null

  if (theme === 'cyberwitch') {
    const c = cyberwitchSpacePage(space, tagline, saved.content, appOrigin)
    if (!c) return null
    if (facts.button) drop = new Set(['links', 'button'])
    body = wrap(CYBERWITCH_FONT_CLASS, <CyberWitchKitSpotlightLayout layout={layout as `cyberwitch-kit:${SpotlightLook}`} content={c} />)
  } else if (theme === 'new-world') {
    const nwAccent = presetForAccent(NEW_WORLD_ACCENTS, accent) ?? undefined
    let c
    if (look === 'profile') {
      c = newWorldProfilePageContent({ name, tagline, about: null, portrait: portrait ?? null, cover: cover ?? null, accent: nwAccent, links: facts.links })
    } else if (facts.links.length) {
      c = newWorldLinkPageContent({ name, tagline, photo: photo ?? null, messageHref: typeof email === 'string' && email.includes('@') ? `mailto:${email.trim()}` : null, links: facts.links, closing: facts.button })
      if (facts.button) drop = new Set(['links', 'button'])
    } else {
      c = overlaySpaceOnKit(newWorldKitSpotlightContent('general', { name, sample: false, accent: nwAccent, photo }), facts)
    }
    body = wrap(NEW_WORLD_FONT_CLASS, <NewWorldKitSpotlightLayout layout={layout as `new-world-kit:${SpotlightLook}`} content={c} />)
  } else if (theme === 'services') {
    const c = overlaySpaceOnKit(servicesKitSpotlightContent('general', { name, sample: false, accent: presetForAccent(SERVICES_ACCENTS, accent) ?? undefined, photo }), facts)
    if (facts.button) drop = new Set(['links', 'button'])
    body = wrap(SERVICES_FONT_CLASS, <ServicesKitSpotlightLayout layout={layout as `services-kit:${SpotlightLook}`} content={{ ...c, owner: name, role: tagline ?? '', story: '' }} />)
  } else if (theme === 'designer') {
    const c = overlaySpaceOnKit(designerKitSpotlightContent(designerProfileForAccent(accent) ?? 'general', { name, sample: false, photo }), facts)
    if (facts.button) drop = new Set(['links', 'button'])
    body = wrap(undefined, <DesignerKitSpotlightLayout layout={layout as `designer-kit:${SpotlightLook}`} content={c} />, false)
  } else if (theme === 'temple-kit') {
    const c = overlaySpaceOnKit(templeKitSpotlightContent(presetForAccent(TEMPLE_KIT_PROFILES, accent) ?? 'general', { name, sample: false, photo }), facts)
    if (facts.button) drop = new Set(['links', 'button'])
    body = wrap(TEMPLE_FONT_CLASS, <TempleKitSpotlightLayout layout={layout as `temple-kit:${SpotlightLook}`} content={portrait ? { ...c, portrait } : c} />)
  } else if (theme === 'free-human') {
    const c = overlaySpaceOnKit(freeHumanSpotlightContent(presetForAccent(FREE_HUMAN_PROFILES, accent) ?? 'general', { name, sample: false, photo }), facts)
    if (facts.button) drop = new Set(['links', 'button'])
    body = wrap(FREE_HUMAN_FONT_CLASS, <FreeHumanSpotlightLayout layout={layout as `free-human:${SpotlightLook}`} content={portrait ? { ...c, portrait } : c} />)
  } else if (theme === 'network-kit') {
    const raw = networkKitSpotlightContent('general', { name, sample: false, photo })
    const c = overlaySpaceOnKit({ ...raw, scheme: presetForAccent(NETWORK_KIT_SCHEMES, accent) ?? raw.scheme }, facts)
    if (facts.button) drop = new Set(['links', 'button'])
    body = wrap(undefined, <NetworkKitSpotlightLayout layout={layout as `network-kit:${SpotlightLook}`} content={c} />)
  } else {
    return null
  }

  const rest = restOf(appOrigin ? spotlightSiteGrid(saved) : saved, drop)
  const hasRest = (rest.nodes?.rows ?? rest.rows ?? []).length > 0
  return (
    <>
      {body}
      {hasRest && (
        <div className="mx-auto mt-8 max-w-xl px-5 pb-12">
          <SpaceProfileModules space={toProfileContext(space)} grid={rest} />
        </div>
      )}
    </>
  )
}
