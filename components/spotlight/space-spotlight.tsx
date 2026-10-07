import Image from 'next/image'
import Link from 'next/link'
import type { Space } from '@/lib/spaces/types'
import { getInitials } from '@/lib/utils'
import { AccentScope } from '@/components/spaces/accent-scope'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { defaultAccentForType } from '@/lib/spaces/profile-config'
import { parseSpaceTheme } from '@/lib/theme/space-themes'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { readSpaceSpotlight, spaceSpotlightGrid } from '@/lib/spaces/spotlight'
import { SpaceProfileModules } from '@/components/widgets/space-profile/space-profile-modules'

// THE SPACE SPOTLIGHT PAGE: a Space's one-column link page (lib/spaces/spotlight.ts). The identity header
// mirrors the member Spotlight's (logo, name, tagline, centered), wearing the Space's own accent and page
// theme; the body is the SAME Space block renderer the Space page and website use, fed the Spotlight's own
// layout. Every booking, purchase, lead and membership a block starts runs through the Space's existing
// flows, so the console stays the one place they are managed. Server Component, no viewer reads.

export async function SpaceSpotlight({ space, tagline }: { space: Space; tagline: string | null }) {
  const brandName = space.brandName?.trim() || space.name
  const logo = space.brandLogoUrl ?? null
  const grid = spaceSpotlightGrid(readSpaceSpotlight(space.preferences))

  return (
    <AccentScope
      vars={resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))}
      theme={parseSpaceTheme(space.preferences)}
    >
      <div className="min-h-screen bg-canvas">
        <main className="mx-auto max-w-xl px-4 pb-16">
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

          <div className="mt-8">
            <SpaceProfileModules space={toProfileContext(space)} grid={grid} />
          </div>

          <footer className="mt-12 text-center">
            <Link href="/" className="text-meta text-subtle transition-colors hover:text-muted">
              Made on Frequency
            </Link>
          </footer>
        </main>
      </div>
    </AccentScope>
  )
}
