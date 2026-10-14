import type { Metadata } from 'next'
import Link from 'next/link'
import { DetailTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { JsonLd } from '@/components/json-ld'
import { ShowEpisodes, type ShowEpisodeItem } from '@/components/airwaves/show-episodes'
import { ShowSubscribe } from '@/components/airwaves/show-subscribe'
import { formatTime } from '@/components/airwaves/player/playback'
import { podcastSchema, podcastEpisodeSchema } from '@/lib/jsonld'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { SITE_URL } from '@/lib/site'
import type { ShowFeed } from '@/lib/airwaves/shows'
import type { Space } from '@/lib/spaces/types'
import { SITE_DESIGN } from '@/lib/theme/design'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import '@/app/themes/frequency/members-b.css'

// Shared Show page (SCAN-644). The sitemap URL lives under (public); signed-in
// members of a private Space rewrite to /full. One view so the two routes cannot
// drift. No session client here.

const EPISODE_SCHEMA_CAP = 10

const UTC_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

function dateLabel(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isFinite(t) ? UTC_DATE.format(new Date(t)) : ''
}

export function showPageMetadata(
  slug: string,
  showSlug: string,
  feed: ShowFeed,
): Metadata {
  const { show, coverUrl } = feed
  const description = show.description ?? `Listen to ${show.title}.`
  return {
    title: show.title,
    description,
    alternates: {
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
      ...(coverUrl ? { images: [{ url: coverUrl }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: show.title,
      description,
      ...(coverUrl ? { images: [coverUrl] } : {}),
    },
  }
}

export async function ShowPageView({
  slug,
  showSlug,
  space,
  feed,
}: {
  slug: string
  showSlug: string
  space: Space
  feed: ShowFeed
}) {
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
  const structuredData = (
    <>
      <JsonLd data={seriesJsonLd} />
      {episodeJsonLd.map((node, i) => (
        <JsonLd key={items[i].id} data={node} />
      ))}
    </>
  )

  // THE DESIGN SWITCH (ADR-1737, build-time). Under Frequency the Show is the kit's page: the split
  // hero card (cover, the Space, the title, who makes it, Subscribe), then the episodes. Same feed,
  // same players, same JSON-LD. DAWN below is unchanged.
  if (SITE_DESIGN === 'frequency') {
    return (
      <MembersBody>
        {structuredData}
        <Link className="meta fqm-back" href={`/spaces/${slug}`}>
          ← Back to {spaceName}
        </Link>
        <section className="card fqm-ev">
          <div className="ph fqm-ev-ph" style={coverUrl ? { backgroundImage: `url('${coverUrl}')` } : undefined}>
            <span className="tag glass">Show</span>
          </div>
          <div className="fqm-ev-in">
            <span className="k">{spaceName}</span>
            <h1 className="h1">{show.title}</h1>
            {show.author && <span className="t2">{show.author}</span>}
            {show.description && <p className="body fqm-pre">{show.description}</p>}
            <div className="fqm-ev-act">
              <ShowSubscribe feedUrl={feedUrl} />
            </div>
          </div>
        </section>
        <section className="sec stack">
          <h2 className="h2">
            Episodes <span className="t2">{items.length}</span>
          </h2>
          {items.length > 0 ? (
            <ShowEpisodes episodes={items} />
          ) : (
            <div className="empty stack">
              <span className="h3">No episodes yet</span>
              <span className="t2">New episodes land here the moment they publish. Subscribe above to catch the first one.</span>
            </div>
          )}
        </section>
      </MembersBody>
    )
  }

  const hero = await resolveDetailHero(`/spaces/${slug}/podcasts/${showSlug}`)

  return (
    <div className="mx-auto max-w-3xl">
      {structuredData}
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
                  className="h-40 w-40 rounded-card border border-border object-cover lift-1 sm:h-48 sm:w-48"
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
              <p className="eyebrow text-subtle">Show</p>
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
