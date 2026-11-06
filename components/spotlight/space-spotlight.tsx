import type { ReactNode } from 'react'
import Image from 'next/image'
import { memberSpaceFonts } from '@/lib/theme/site-style'
import { spotlightSurface } from '@/lib/theme/surface'
import Link from 'next/link'
import type { Space } from '@/lib/spaces/types'
import { getInitials } from '@/lib/utils'
import { AccentScope } from '@/components/spaces/accent-scope'
import { frequencyAccentVars, resolveAccentVars } from '@/lib/spaces/accent'
import { defaultAccentForType } from '@/lib/spaces/profile-config'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { readSpaceSpotlight, spaceSpotlightGrid, spotlightSiteGrid } from '@/lib/spaces/spotlight'
import { markSpotlightRender } from '@/lib/spaces/spotlight-site'
import { readSiteStyle } from '@/lib/theme/site-style'
import { NewWorldKitSpotlightLayout } from '@/components/spotlight/new-world-kit-layouts'
import { NEW_WORLD_FONT_CLASS } from '@/components/sites/new-world-fonts'
import { newWorldLinkPageContent, newWorldProfilePageContent } from '@/lib/spotlight/new-world-kit-content'
import { safeUrl } from '@/lib/entity-blocks/block-content'
import { SpaceProfileModules } from '@/components/widgets/space-profile/space-profile-modules'
import { CyberWitchKitSpotlightLayout } from '@/components/spotlight/cyberwitch-kit-layouts'
import { CYBERWITCH_FONT_CLASS } from '@/components/sites/cyberwitch-fonts'
import { cyberwitchSpacePage } from '@/lib/spotlight/cyberwitch-space-page'

// THE SPACE SPOTLIGHT PAGE: a Space's one-column link page (lib/spaces/spotlight.ts). The identity header
// mirrors the member Spotlight's (logo, name, tagline, centered), wearing the Space's own accent and page
// theme; the body is the SAME Space block renderer the Space page and website use, fed the Spotlight's own
// layout. Every booking, purchase, lead and membership a block starts runs through the Space's existing
// flows, so the console stays the one place they are managed. Server Component, no viewer reads.

/** The Space's accent and page theme, the frame every Spotlight render (public page, console preview) wears. */
export function SpotlightAccent({ space, children }: { space: Space; children: ReactNode }) {
  return (
    <AccentScope
      vars={resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))}
      theme={memberSpaceFonts(space.preferences)}
      fqAccent={frequencyAccentVars(space.brandAccent)}
      surface={spotlightSurface(space.preferences, space.plan)}
    >
      {children}
    </AccentScope>
  )
}

/** The identity header: logo (or initials), name and tagline, centered. Shared with the console preview. */
export function SpotlightHeader({ space, tagline }: { space: Space; tagline: string | null }) {
  const brandName = space.brandName?.trim() || space.name
  const logo = space.brandLogoUrl ?? null
  return (
    <header className="flex flex-col items-center pt-10 text-center">
      {logo ? (
        <Image
          src={logo}
          alt={brandName}
          width={112}
          height={112}
          className="h-28 w-28 rounded-pill object-cover ring-4 ring-canvas lift-1"
        />
      ) : (
        <div className="flex h-28 w-28 items-center justify-center rounded-pill bg-primary-bg text-display-h3 font-bold text-primary-strong ring-4 ring-canvas lift-1">
          {getInitials(brandName)}
        </div>
      )}
      <h1 className="mt-4 text-page-title font-bold text-text">{brandName}</h1>
      {tagline && <p className="mt-1 max-w-md text-pretty text-body-sm text-muted">{tagline}</p>}
    </header>
  )
}

/** A New World Space whose Spotlight holds a Links block wears the design's Stack layout: each link a door, the
 *  Button block its closing call, "Message me" the Space's own email. Null: the block page renders as before. */
function newWorldLinkPage(space: Space, tagline: string | null, grid: ReturnType<typeof spaceSpotlightGrid>) {
  if (readSiteStyle(space.preferences).theme !== 'new-world') return null
  const bag = (id: string) => (grid.content as Record<string, Record<string, unknown>> | undefined)?.[id]
  const raw = bag('links')?.items
  const links = (Array.isArray(raw) ? raw : [])
    .map((it: { label?: unknown; url?: unknown }) => ({ label: typeof it.label === 'string' ? it.label : '', url: safeUrl(it.url) }))
    .filter((it) => it.url && it.label)
  if (!links.length) return null
  const btn = bag('button')
  const closingUrl = safeUrl(btn?.url)
  const email = (space.preferences as { profileData?: { email?: unknown } } | null)?.profileData?.email
  return newWorldLinkPageContent({
    name: space.brandName?.trim() || space.name,
    tagline,
    photo: space.brandLogoUrl ?? null,
    messageHref: typeof email === 'string' && email.includes('@') ? `mailto:${email.trim()}` : null,
    links,
    closing: typeof btn?.label === 'string' && btn.label && closingUrl ? { label: btn.label, href: closingUrl } : null,
  })
}

/** True when this Space wears New World and its owner chose the Profile look (the owner first). */
export function wearsNewWorldProfile(space: Space): boolean {
  return readSiteStyle(space.preferences).theme === 'new-world' && readSpaceSpotlight(space.preferences).look === 'profile'
}

/** THE PROFILE LOOK: the design's Profile layout fed by the Space's own profile photo, header image, tagline and links
 *  (the first frequencylocal.com link is the big button, the rest sit under it), then the Space's other Spotlight blocks
 *  (About, Contact form, closing Button) below. The public page and the console preview both draw this, so they match. */
export async function NewWorldProfileSpotlight({ space, tagline, grid }: { space: Space; tagline: string | null; grid: ReturnType<typeof spaceSpotlightGrid> }) {
  const bag = (id: string) => (grid.content as Record<string, Record<string, unknown>> | undefined)?.[id]
  const raw = bag('links')?.items
  const links = (Array.isArray(raw) ? raw : [])
    .map((it: { label?: unknown; url?: unknown }) => ({ label: typeof it.label === 'string' ? it.label : '', url: safeUrl(it.url) }))
    .filter((it): it is { label: string; url: string } => Boolean(it.url && it.label))
  const content = newWorldProfilePageContent({
    name: space.brandName?.trim() || space.name,
    tagline,
    about: null,
    portrait: space.brandLogoUrl ?? null,
    cover: space.coverImageUrl ?? null,
    links,
  })
  // The links are drawn by the layout; every other block keeps its own real renderer.
  const rest = { ...grid, rows: (grid.rows ?? []).filter((r) => !r.cells.every((c) => c.every((id) => id === 'links'))) }
  if (grid.nodes) rest.nodes = { ...grid.nodes, rows: grid.nodes.rows.filter((r) => !r.cells.every((c) => c.every((n) => n.type === 'links'))) }
  return (
    <div className={`bg-canvas ${NEW_WORLD_FONT_CLASS}`}>
      <main className="mx-auto max-w-xl">
        <NewWorldKitSpotlightLayout layout="new-world-kit:profile" content={content} />
        <div className="mt-8 px-5 pb-12">
          <SpaceProfileModules space={toProfileContext(space)} grid={rest} />
        </div>
      </main>
    </div>
  )
}

/** `appOrigin` is set on a website host (LIVE-855): the grid keeps only the blocks a stand-alone site shows,
 *  and the one Frequency link, the footer, is absolute and labeled as Frequency's. */
export async function SpaceSpotlight({
  space,
  tagline,
  appOrigin,
}: {
  space: Space
  tagline: string | null
  appOrigin?: string
}) {
  markSpotlightRender()
  const saved = spaceSpotlightGrid(readSpaceSpotlight(space.preferences))
  const grid = appOrigin ? spotlightSiteGrid(saved) : saved

  const cyberwitch = cyberwitchSpacePage(space, tagline, saved.content, appOrigin)
  if (cyberwitch) {
    return (
      <SpotlightAccent space={space}>
        <main className={`min-h-screen ${CYBERWITCH_FONT_CLASS}`}>
          <CyberWitchKitSpotlightLayout layout="cyberwitch-kit:stack" content={cyberwitch} />
        </main>
      </SpotlightAccent>
    )
  }

  if (wearsNewWorldProfile(space)) {
    return (
      <SpotlightAccent space={space}>
        <div className="min-h-screen bg-canvas">
          <NewWorldProfileSpotlight space={space} tagline={tagline} grid={grid} />
        </div>
      </SpotlightAccent>
    )
  }

  const linkPage = newWorldLinkPage(space, tagline, saved)
  if (linkPage) {
    return (
      <SpotlightAccent space={space}>
        <div className={`min-h-screen bg-canvas ${NEW_WORLD_FONT_CLASS}`}>
          <main className="mx-auto max-w-xl">
            <NewWorldKitSpotlightLayout layout="new-world-kit:stack" content={linkPage} />
          </main>
        </div>
      </SpotlightAccent>
    )
  }

  return (
    <SpotlightAccent space={space}>
      <div className="min-h-screen bg-canvas">
        <main className="mx-auto max-w-xl px-4 pb-16">
          <SpotlightHeader space={space} tagline={tagline} />

          <div className="mt-8">
            <SpaceProfileModules space={toProfileContext(space)} grid={grid} />
          </div>

          <footer className="mt-12 text-center">
            <Link href={appOrigin ? `${appOrigin}/` : '/'} className="text-meta text-subtle transition-colors hover:text-muted">
              Made on Frequency
            </Link>
          </footer>
        </main>
      </div>
    </SpotlightAccent>
  )
}
