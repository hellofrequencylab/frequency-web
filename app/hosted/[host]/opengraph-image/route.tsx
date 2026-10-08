import { resolveHostedSpace } from '@/lib/sites/hosted'
import { normalizeHost } from '@/lib/sites/host'
import { readSiteHero, readWebsitePublished } from '@/lib/spaces/website'
import { parseSpaceTheme } from '@/lib/theme/space-themes'
import { mensworkSeason } from '@/lib/theme/menswork'
import { fetchRemoteImage } from '@/lib/og/remote-image'
import { cardResponse } from '@/lib/og/deliver'
import { loadMensworkFonts } from '@/lib/og/load-menswork-fonts'
import { MENSWORK_CARD_SIZE, MensworkSiteCard } from '@/lib/og/menswork-site-card'

// THE WEBSITE'S SHARE CARD (LIVE-870). `/opengraph-image` on a Menswork website's own host, rewritten here
// by the proxy (lib/sites/host.ts, one-segment paths), and named in every page's og:image by siteMetadata
// (components/sites/site-page.tsx). A plain route, not a metadata file, so the rasteriser stays in this one
// function; the folder name keeps it on `check:og-trace`'s list of card routes, which must carry sharp.
// Only a published website on the Menswork theme has one; any other host 404s and its pages keep the cover
// photo as their share image.
export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host: hostParam } = await params
  const host = normalizeHost(decodeURIComponent(hostParam))
  const space = await resolveHostedSpace(host)
  if (!space || !readWebsitePublished(space.preferences) || parseSpaceTheme(space.preferences) !== 'menswork') {
    return new Response('Not found', { status: 404 })
  }
  const [logo, cover, fonts] = await Promise.all([
    space.brandLogoUrl ? fetchRemoteImage(space.brandLogoUrl) : Promise.resolve(null),
    space.coverImageUrl ? fetchRemoteImage(space.coverImageUrl) : Promise.resolve(null),
    loadMensworkFonts(),
  ])
  return cardResponse(
    <MensworkSiteCard
      brandName={space.brandName?.trim() || space.name}
      headline={readSiteHero(space.preferences).heading ?? space.tagline?.trim() ?? null}
      domain={host.replace(/^www\./, '')}
      season={mensworkSeason(new Date())}
      logo={logo}
      cover={cover}
    />,
    {
      ...MENSWORK_CARD_SIZE,
      fonts: [
        { name: 'Sofia', data: fonts.display, weight: 800, style: 'normal' },
        { name: 'Barlow', data: fonts.body, weight: 500, style: 'normal' },
      ],
    },
  )
}
