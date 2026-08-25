import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { assembleShowFeed } from '@/lib/airwaves/shows'
import { formatTime } from '@/components/airwaves/player/playback'
import { ShowSubscribe } from '@/components/airwaves/show-subscribe'
import { ShowEpisodes, type ShowEpisodeItem } from '@/components/airwaves/show-episodes'
import { EmptyState } from '@/components/ui/empty-state'
import { DetailTemplate } from '@/components/templates'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { JsonLd } from '@/components/json-ld'
import { podcastSchema, podcastEpisodeSchema } from '@/lib/jsonld'
import { SITE_URL } from '@/lib/site'

// Airwaves P3 — the PUBLIC Show page (ADR-608). The in-app, shell-framed listening surface: cover +
// title + description, the subscribe row (Apple / Spotify / Copy RSS), and the Episode list rendered
// with the real <AirwavesPlayer>. It reads the SAME `assembleShowFeed` the RSS route does, so the page
// and the feed never drift — both show only published, public Episodes with a playable enclosure, and
// both 404 on a missing / draft / private-feed Show (no gating needed on this listing).

/** How many episodes get a PodcastEpisode node. Answer engines want the recent catalogue, not
 *  every episode ever; the RSS feed is the complete enumeration. */
const EPISODE_SCHEMA_CAP = 10

const UTC_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** A human date label from an ISO timestamp, or '' when absent / unparseable. */
function dateLabel(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isFinite(t) ? UTC_DATE.format(new Date(t)) : ''
}

async function resolveFeed(slug: string, showSlug: string) {
  const space = await getSpaceBySlug(slug)
  if (!space) return null
  const feed = await assembleShowFeed(space.id, showSlug)
  if (!feed) return null
  return { space, feed }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; showSlug: string }>
}): Promise<Metadata> {
  const { slug, showSlug } = await params
  const resolved = await resolveFeed(slug, showSlug)
  if (!resolved) return { title: 'Show not found' }
  const { show, coverUrl } = resolved.feed
  const description = show.description ?? `Listen to ${show.title}.`
  return {
    title: show.title,
    description,
    alternates: {
      // /spaces/<slug>/podcasts/<showSlug> is the canonical public Show URL, so search + AI engines
      // consolidate on this one page (the RSS feed below is an alternate representation, not canonical).
      canonical: `/spaces/${slug}/podcasts/${showSlug}`,
      types: {
        'application/rss+xml': `${SITE_URL}/podcasts/${slug}/${showSlug}/rss.xml`,
      },
    },
    openGraph: {
      title: show.title,
      description,
      type: 'website',
      url: `/spaces/${slug}/podcasts/${showSlug}`,
      images: coverUrl ? [{ url: coverUrl }] : undefined,
    },
    // Metadata merges per TOP-LEVEL key, so a page that sets only `openGraph` still inherits the
    // ROOT twitter block: every share of a Show read "Frequency, the Community Collective" with the
    // generic card. Mirroring the OG values here is what makes an X or Slack unfurl name the Show.
    twitter: {
      card: 'summary_large_image',
      title: show.title,
      description,
      images: coverUrl ? [coverUrl] : undefined,
    },
  }
}

export default async function ShowPage({
  params,
}: {
  params: Promise<{ slug: string; showSlug: string }>
}) {
  const { slug, showSlug } = await params
  const resolved = await resolveFeed(slug, showSlug)
  if (!resolved) notFound()

  const { space, feed } = resolved
  const { show, coverUrl, episodes } = feed
  const feedUrl = `${SITE_URL}/podcasts/${slug}/${showSlug}/rss.xml`
  const spaceName = space.brandName ?? space.name

  const items: ShowEpisodeItem[] = episodes.map(({ recording: r, enclosure }) => ({
    id: r.id,
    anchor: r.slug ?? r.id,
    kind: r.mediaKind,
    src: enclosure.url,
    title: r.title,
    description: r.description,
    dateLabel: dateLabel(r.publishedAt),
    durationLabel: r.durationSeconds ? formatTime(r.durationSeconds) : '',
    durationSec: r.durationSeconds ?? undefined,
    artworkUrl: coverUrl ?? undefined,
    transcript: r.transcript ?? undefined,
    chapters: r.chapters?.map((c) => ({ startSec: c.startMs / 1000, title: c.title })),
    spaceName,
  }))

  // The Show IS the Detail template (PAGE-FRAMEWORK §3, Template C). Its identity is bespoke —
  // a square cover to the LEFT of the "Show" eyebrow + title + author + description + subscribe
  // row — so it rides the template's `band` slot (the Space-profile precedent), which REPLACES the
  // default lockup and owns the single page <h1>. The Episode list is the template body.
  // PodcastSeries structured data (schema.org) for SEO + AI answer engines. Built from the shared
  // podcastSchema helper so the on-site page and the RSS feed resolve as one series (webFeed), the
  // author/cover/language carried straight from the Show. No member data is exposed.
  const seriesJsonLd = podcastSchema({
    title: show.title,
    description: show.description,
    author: show.author,
    language: show.language,
    category: show.itunesCategory,
    coverUrl,
    path: `/spaces/${slug}/podcasts/${showSlug}`,
    feedUrl,
    publisherName: spaceName,
  })

  // One PodcastEpisode node per listed episode, from the SAME `items` the page renders, so the
  // structured data and the visible list can never disagree. Each is anchored to this Show page
  // (episodes have no detail route of their own) and carries partOfSeries back to the series node.
  // Capped: the schema is a citation surface for answer engines, not a full catalog dump, and the
  // RSS feed remains the complete enumeration.
  const episodeJsonLd = items.slice(0, EPISODE_SCHEMA_CAP).map((ep) =>
    podcastEpisodeSchema({
      title: ep.title,
      description: ep.description,
      path: `/spaces/${slug}/podcasts/${showSlug}#${ep.anchor}`,
      datePublished: episodes.find((e) => e.recording.id === ep.id)?.recording.publishedAt ?? null,
      durationSeconds: ep.durationSec ?? null,
      mediaUrl: ep.src,
      mediaKind: ep.kind,
      imageUrl: ep.artworkUrl ?? null,
      series: { title: show.title, path: `/spaces/${slug}/podcasts/${showSlug}` },
    }),
  )
  // The standard entity cover (PROG-P5, ADR-1136). The show's SQUARE artwork is identity, not a
  // 16:6 cover — it stays in the `band` lockup below — so the route is deliberately UNMAPPED and
  // this resolves to no cover until a section row (or a real wide cover column) exists.
  const hero = await resolveDetailHero(`/spaces/${slug}/podcasts/${showSlug}`)

  return (
    <div className="mx-auto max-w-3xl">
      <JsonLd data={seriesJsonLd} />
      {episodeJsonLd.map((node, i) => (
        <JsonLd key={items[i].id} data={node} />
      ))}
      <DetailTemplate
        {...hero}
        title={show.title}
        band={
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="shrink-0">
              {coverUrl ? (
                // Raw <img>: a cover asset URL may be on a non-whitelisted host, so next/image is skipped.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt=""
                  className="h-40 w-40 rounded-2xl border border-border object-cover lift-1 sm:h-48 sm:w-48"
                />
              ) : (
                <div
                  aria-hidden
                  className="grid h-40 w-40 place-items-center rounded-card border border-dashed border-border bg-surface-elevated text-page-title font-bold text-subtle sm:h-48 sm:w-48"
                >
                  {show.title.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-meta font-semibold uppercase tracking-widest text-subtle">Show</p>
              {/* header-ok: the h1 lives inside DetailTemplate's `band` slot, which by contract owns the single page h1 (the band replaces the default title lockup). The template owns the chrome. */}
              <h1 className="mt-1 text-balance text-display-h3 font-bold leading-tight text-text">{show.title}</h1>
              {show.author && <p className="mt-1 text-body-sm text-muted">{show.author}</p>}
              {show.description && (
                <p className="mt-3 whitespace-pre-line text-body-sm leading-relaxed text-muted">{show.description}</p>
              )}
              <div className="mt-4">
                <ShowSubscribe feedUrl={feedUrl} />
              </div>
            </div>
          </div>
        }
      >
        <section className="mt-8">
          <h2 className="mb-3 flex items-baseline gap-2 text-body-sm font-bold tracking-tight text-text">
            Episodes
            <span className="text-meta font-medium tabular-nums text-subtle">{items.length}</span>
          </h2>
          {items.length > 0 ? (
            <ShowEpisodes episodes={items} />
          ) : (
            <EmptyState
              title="No episodes yet"
              description="New episodes land here the moment they publish. Subscribe above to catch the first one."
            />
          )}
        </section>
      </DetailTemplate>
    </div>
  )
}
