import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { assembleShowFeed } from '@/lib/airwaves/shows'
import { formatTime } from '@/components/airwaves/player/playback'
import { ShowSubscribe } from '@/components/airwaves/show-subscribe'
import { ShowEpisodes, type ShowEpisodeItem } from '@/components/airwaves/show-episodes'
import { EmptyState } from '@/components/ui/empty-state'
import { DetailTemplate } from '@/components/templates'
import { SITE_URL } from '@/lib/site'

// Airwaves P3 — the PUBLIC Show page (ADR-608). The in-app, shell-framed listening surface: cover +
// title + description, the subscribe row (Apple / Spotify / Copy RSS), and the Episode list rendered
// with the real <AirwavesPlayer>. It reads the SAME `assembleShowFeed` the RSS route does, so the page
// and the feed never drift — both show only published, public Episodes with a playable enclosure, and
// both 404 on a missing / draft / private-feed Show (no gating needed on this listing).

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
      types: {
        'application/rss+xml': `${SITE_URL}/podcasts/${slug}/${showSlug}/rss.xml`,
      },
    },
    openGraph: {
      title: show.title,
      description,
      type: 'website',
      images: coverUrl ? [{ url: coverUrl }] : undefined,
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
  return (
    <div className="mx-auto max-w-3xl">
      <DetailTemplate
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
                  className="h-40 w-40 rounded-2xl border border-border object-cover shadow-sm sm:h-48 sm:w-48"
                />
              ) : (
                <div
                  aria-hidden
                  className="grid h-40 w-40 place-items-center rounded-2xl border border-dashed border-border bg-surface-elevated text-2xl font-bold text-subtle sm:h-48 sm:w-48"
                >
                  {show.title.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-subtle">Show</p>
              <h1 className="mt-1 text-balance text-2xl font-bold leading-tight text-text sm:text-3xl">{show.title}</h1>
              {show.author && <p className="mt-1 text-sm text-muted">{show.author}</p>}
              {show.description && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted">{show.description}</p>
              )}
              <div className="mt-4">
                <ShowSubscribe feedUrl={feedUrl} />
              </div>
            </div>
          </div>
        }
      >
        <section className="mt-8">
          <h2 className="mb-3 flex items-baseline gap-2 text-sm font-bold tracking-tight text-text">
            Episodes
            <span className="text-xs font-medium tabular-nums text-subtle">{items.length}</span>
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
