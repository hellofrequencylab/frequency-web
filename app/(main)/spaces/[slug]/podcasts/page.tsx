import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { listShowsForSpace, getAssetMeta } from '@/lib/airwaves/shows'
import type { Show } from '@/lib/airwaves/types'
import { IndexTemplate } from '@/components/templates'
import { EntityCard } from '@/components/cards/entity-card'

// Airwaves P3 — the public SHOWS INDEX for a Space (ADR-608). Lists every published, public-feed Show
// as a browse card that drills into its Show page. A Space with no listable Shows (or a missing Space)
// 404s, so this route only ever renders a real, non-empty catalog. Composes the shared IndexTemplate +
// EntityCard so it reads like every other browse page (PAGE-FRAMEWORK §3, Template B).

async function resolveSpace(slug: string) {
  const space = await getSpaceBySlug(slug)
  if (!space) return null
  const shows = (await listShowsForSpace(space.id)).filter(
    (s) => s.status === 'published' && s.feedVisibility === 'public',
  )
  return { space, shows }
}

// This tab lives OUTSIDE the `(profile)` route group, which is why the ADR-925 canonical fix for
// the eight profile sub-tabs never reached it. It returned title+description only, so metadata
// inheritance handed it the layout's canonical — `/spaces/<slug>` — while `app/sitemap.ts:394`
// submits this exact URL and it renders 200 for anonymous visitors (isAnonSpaceProfile).
//
// That combination is the worst one available: the only route in the tree that is simultaneously
// sitemap-advertised, publicly rendered, and canonicalised onto a DIFFERENT page. Google reports it
// as "Alternate page with proper canonical tag" and drops it. Routed through the same helper the
// other tabs use, so it self-canonicals like they do.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const resolved = await resolveSpace(slug)
  if (!resolved || resolved.shows.length === 0) return { title: 'Shows' }
  return spaceProfileMetadata(slug, {
    segment: 'podcasts',
    label: 'Shows',
    describe: (brandName) => `Podcasts and recordings published by ${brandName}.`,
  })
}

async function ShowCard({ slug, show }: { slug: string; show: Show }) {
  const cover = await getAssetMeta(show.coverAssetId)
  return (
    <EntityCard
      href={`/spaces/${slug}/podcasts/${show.slug}`}
      cover={
        cover?.url ? (
          // Raw <img>: a cover asset URL may be on a non-whitelisted host, so next/image is skipped.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-surface-elevated text-3xl font-bold text-subtle">
            {show.title.slice(0, 1).toUpperCase()}
          </div>
        )
      }
      title={show.title}
      context={show.author ?? show.itunesCategory}
      description={show.description ?? undefined}
    />
  )
}

export default async function ShowsIndexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const resolved = await resolveSpace(slug)
  if (!resolved || resolved.shows.length === 0) notFound()

  const { space, shows } = resolved
  const name = space.brandName ?? space.name

  return (
    <IndexTemplate
      eyebrow="Airwaves"
      title="Shows"
      description={`Podcasts from ${name}. Subscribe in your favorite app or listen right here.`}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shows.map((show) => (
          <ShowCard key={show.id} slug={slug} show={show} />
        ))}
      </div>
    </IndexTemplate>
  )
}
