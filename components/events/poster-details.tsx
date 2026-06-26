// The flexible details harvested from a captured poster, rendered on the event
// page below the description. Content-driven: each section renders ONLY when
// the poster actually carried it (a plain flyer shows nothing extra), in a
// fixed order — Lineup, Schedule, Features, Tickets, Links, Sponsors, Gallery,
// Other details. Crop thumbnails arrive as short-lived signed URLs resolved by
// the page (the crops live in a private bucket). Server-friendly (no hooks).

import { ExternalLink, UserRound } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { normalizeHttpUrl } from '@/lib/safe-url'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'

function centsLabel(cents: number | null | undefined): string | null {
  if (cents == null) return null
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(2)}`
}

export function PosterDetails({
  details,
  signedUrls,
}: {
  details: EventDetailsWithMedia
  /** storage path → signed URL for the lineup + gallery crops. */
  signedUrls: Record<string, string>
}) {
  const { lineup, schedule, features, tickets, links, sponsors, other } = details
  const media = details.media
  const gallery = (details.imageRegions ?? [])
    .map((r, i) => ({ ...r, url: media?.gallery?.[String(i)] ? signedUrls[media.gallery[String(i)]] : undefined }))
    .filter((r) => !!r.url)
  // Resolve link hrefs once (default-https + http/https-only); drop any that
  // can't be made safe so the section count and render agree.
  const safeLinks = (links ?? [])
    .map((l) => ({ ...l, href: normalizeHttpUrl(l.url) }))
    .filter((l): l is typeof l & { href: string } => !!l.href)

  const hasAnything =
    (lineup?.length ?? 0) > 0 ||
    (schedule?.length ?? 0) > 0 ||
    (features?.length ?? 0) > 0 ||
    (tickets?.length ?? 0) > 0 ||
    safeLinks.length > 0 ||
    (sponsors?.length ?? 0) > 0 ||
    gallery.length > 0 ||
    (other?.length ?? 0) > 0
  if (!hasAnything) return null

  return (
    <div className="mb-6 space-y-6">
      {/* ── Lineup ── */}
      {lineup && lineup.length > 0 && (
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
      )}

      {/* ── Schedule ── */}
      {schedule && schedule.length > 0 && (
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
      )}

      {/* ── Features ── */}
      {features && features.length > 0 && (
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
      )}

      {/* ── Tickets (as printed on the poster) ── */}
      {tickets && tickets.length > 0 && (
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
      )}

      {/* ── Links ── */}
      {safeLinks.length > 0 && (
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
      )}

      {/* ── Sponsors: a quiet credits line ── */}
      {sponsors && sponsors.length > 0 && (
        <p className="text-xs text-subtle">With support from {sponsors.join(', ')}.</p>
      )}

      {/* ── Gallery ── */}
      {gallery.length > 0 && (
        <section>
          <SectionHeader title="From the poster" />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {gallery.map((g, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={g.url}
                alt={g.note ?? ''}
                className="h-28 w-28 shrink-0 rounded-xl border border-border object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Other details ── */}
      {other && other.length > 0 && (
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
      )}
    </div>
  )
}
