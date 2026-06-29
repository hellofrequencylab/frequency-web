// The flexible details harvested from a captured poster, rendered on the event page below the
// description. Content-driven: each section renders ONLY when the poster actually carried it (a plain
// flyer shows nothing extra). Crop thumbnails arrive as short-lived signed URLs resolved by the page
// (the crops live in a private bucket). Server-friendly (no hooks).
//
// SPLIT INTO MOVABLE SECTIONS: each poster section is its own exported presentational component so
// the event interior can place each as an INDEPENDENT layout module (lineup, schedule, good-to-know,
// pricing, links, sponsors, details) — an operator moves/hides any one of them from the Layout
// editor. `PosterDetails` keeps the original "render the whole harvest in order" composition for any
// caller that still wants the lumped block; the event page no longer uses it (it renders the
// per-section modules), but it stays correct + tested.

import { ExternalLink, UserRound } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { normalizeHttpUrl } from '@/lib/safe-url'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'

function centsLabel(cents: number | null | undefined): string | null {
  if (cents == null) return null
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(2)}`
}

/** Resolve link hrefs once (default-https + http/https-only); drop any that can't be made safe so
 *  the section count and render agree. Shared by the Links section + the hasPosterDetails check. */
function safeLinksOf(details: EventDetailsWithMedia) {
  return (details.links ?? [])
    .map((l) => ({ ...l, href: normalizeHttpUrl(l.url) }))
    .filter((l): l is typeof l & { href: string } => !!l.href)
}

/** Whether the harvest carries ANY renderable section (drives the page's "show poster details" gate). */
export function hasPosterDetails(details: EventDetailsWithMedia): boolean {
  const { lineup, schedule, features, tickets, sponsors, other } = details
  return (
    (lineup?.length ?? 0) > 0 ||
    (schedule?.length ?? 0) > 0 ||
    (features?.length ?? 0) > 0 ||
    (tickets?.length ?? 0) > 0 ||
    safeLinksOf(details).length > 0 ||
    (sponsors?.length ?? 0) > 0 ||
    (other?.length ?? 0) > 0
  )
}

// ── Per-section presentational components (each renders nothing when its slice is empty) ──

export function PosterLineup({
  details,
  signedUrls,
}: {
  details: EventDetailsWithMedia
  signedUrls: Record<string, string>
}) {
  const { lineup } = details
  const media = details.media
  if (!lineup || lineup.length === 0) return null
  return (
    <section>
      <SectionHeader title="Lineup" count={lineup.length} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {lineup.map((item, i) => {
          const path = media?.lineup?.[String(i)]
          const url = path ? signedUrls[path] : undefined
          return (
            <div key={`${item.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={item.name} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-subtle">
                  <UserRound className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{item.name}</p>
                <p className="truncate text-xs capitalize text-subtle">
                  {item.role}
                  {item.note ? ` · ${item.note}` : ''}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function PosterSchedule({ details }: { details: EventDetailsWithMedia }) {
  const { schedule } = details
  if (!schedule || schedule.length === 0) return null
  return (
    <section>
      <SectionHeader title="Schedule" />
      <ul className="space-y-1.5">
        {schedule.map((item, i) => (
          <li key={`${item.title}-${i}`} className="flex items-baseline gap-3 text-sm">
            {item.time && (
              <span className="w-16 shrink-0 font-semibold tabular-nums text-primary-strong">{item.time}</span>
            )}
            <span className="min-w-0 text-text">
              {item.title}
              {item.note && <span className="ml-1.5 text-xs text-subtle">{item.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PosterFeatures({ details }: { details: EventDetailsWithMedia }) {
  const { features } = details
  if (!features || features.length === 0) return null
  return (
    <section>
      <SectionHeader title="Good to know" />
      <div className="flex flex-wrap gap-1.5">
        {features.map((f) => (
          <span key={f} className="rounded-full bg-primary-bg px-2.5 py-1 text-xs font-medium text-primary-strong">
            {f}
          </span>
        ))}
      </div>
    </section>
  )
}

export function PosterPricing({ details }: { details: EventDetailsWithMedia }) {
  const { tickets } = details
  if (!tickets || tickets.length === 0) return null
  return (
    <section>
      <SectionHeader title="Pricing" />
      <div className="rounded-2xl border border-border bg-surface p-4">
        <ul className="space-y-1.5">
          {tickets.map((t, i) => (
            <li key={`${t.label}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 text-text">
                {t.label}
                {t.note && <span className="ml-1.5 text-xs text-subtle">{t.note}</span>}
              </span>
              {centsLabel(t.priceCents) && (
                <span className="shrink-0 font-semibold tabular-nums text-text">{centsLabel(t.priceCents)}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-subtle">As printed on the poster. Check with the organizer.</p>
      </div>
    </section>
  )
}

export function PosterLinks({ details }: { details: EventDetailsWithMedia }) {
  const safeLinks = safeLinksOf(details)
  if (safeLinks.length === 0) return null
  return (
    <section>
      <SectionHeader title="Links" />
      <div className="flex flex-wrap gap-2">
        {safeLinks.map((l, i) => (
          <a
            key={`${l.url}-${i}`}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated"
          >
            <ExternalLink className="h-3.5 w-3.5 text-subtle" /> {l.label}
          </a>
        ))}
      </div>
    </section>
  )
}

export function PosterSponsors({ details }: { details: EventDetailsWithMedia }) {
  const { sponsors } = details
  if (!sponsors || sponsors.length === 0) return null
  return <p className="text-xs text-subtle">With support from {sponsors.join(', ')}.</p>
}

export function PosterOther({ details }: { details: EventDetailsWithMedia }) {
  const { other } = details
  if (!other || other.length === 0) return null
  return (
    <section>
      <SectionHeader title="Details" />
      <dl className="space-y-1">
        {other.map((o, i) => (
          <div key={`${o.label}-${i}`} className="flex gap-2 text-sm">
            <dt className="shrink-0 font-medium capitalize text-muted">{o.label}:</dt>
            <dd className="min-w-0 text-text">{o.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** The whole poster harvest in fixed order — Lineup · Schedule · Good to know · Pricing · Links ·
 *  Sponsors · Details — for any caller that wants the lumped block. Renders nothing when empty. */
export function PosterDetails({
  details,
  signedUrls,
}: {
  details: EventDetailsWithMedia
  /** storage path → signed URL for the lineup + gallery crops. */
  signedUrls: Record<string, string>
}) {
  if (!hasPosterDetails(details)) return null
  return (
    <div className="mb-6 space-y-6">
      <PosterLineup details={details} signedUrls={signedUrls} />
      <PosterSchedule details={details} />
      <PosterFeatures details={details} />
      <PosterPricing details={details} />
      <PosterLinks details={details} />
      <PosterSponsors details={details} />
      <PosterOther details={details} />
    </div>
  )
}
