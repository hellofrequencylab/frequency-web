import Image from 'next/image'
import { CalendarDays, Check, MapPin, Users } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'
import { BrandAnchor } from '@/components/spaces/brand-anchor'
import type { CalendarEvent } from '@/lib/calendar/item'

const PILL = 'rounded-pill bg-surface/90 px-2.5 py-0.5 text-2xs font-semibold text-text lift-1 backdrop-blur-sm'

/** "The Group Encinitas" under a "The Group" network reads "Encinitas": the repeated prefix is what
 * made every chapter title cut to the same words. The full name stays in the card's link label. */
function chapterShortName(name: string, parentName: string): string {
  const prefix = parentName.trim()
  if (prefix && name.toLowerCase().startsWith(prefix.toLowerCase())) {
    const rest = name.slice(prefix.length).replace(/^[\s:·\-–—]+/, '').trim()
    if (rest) return rest
  }
  return name
}

function Cover({ url, focus, children }: { url: string | null | undefined; focus?: string | null; children?: React.ReactNode }) {
  return url
    ? <Image src={url} alt="" fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" style={focus ? { objectPosition: focus } : undefined} unoptimized={url.includes('/object/sign/')} />
    : <div className="h-full w-full bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg">{children}</div>
}

function nextEventLabel(event: CalendarEvent) {
  const { month, day } = dateBlock(event.dayKey)
  return `${month} ${day}, ${event.title}`
}

export function ChapterCard({ href, name, parentName, logoUrl, coverUrl, city, tagline, nextEvent, eventCount }: {
  href: string; name: string; parentName: string; logoUrl: string | null; coverUrl: string | null
  city: string | null; tagline: string | null; nextEvent: CalendarEvent | null; eventCount: number
}) {
  const short = chapterShortName(name, parentName)
  return (
    <EntityCard href={href} wrapTitle coverAspect="short" title={short} context={short !== name ? `${parentName} chapter` : undefined}
      description={tagline ?? undefined}
      cover={<Cover url={coverUrl} />}
      coverOverlay={<>
        {coverUrl && <div className="absolute inset-0 bg-gradient-to-t from-ink/35 via-transparent to-transparent" />}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {city && <span className={`${PILL} inline-flex items-center gap-1`}><MapPin className="h-3 w-3" aria-hidden />{city}</span>}
          {eventCount > 0 && <span className={PILL}>{eventCount} {eventCount === 1 ? 'event' : 'events'} this month</span>}
        </div>
      </>}
      anchor={<BrandAnchor name={name} logoUrl={logoUrl} size="card" />}
      meta={nextEvent
        ? <span className="flex min-w-0 items-center gap-1 font-medium text-muted"><CalendarDays className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">Next: {nextEventLabel(nextEvent)}</span></span>
        : <span>No events scheduled yet</span>}
    />
  )
}

function dateBlock(dayKey: string) {
  const d = new Date(`${dayKey}T12:00:00Z`)
  return { month: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }), day: d.getUTCDate() }
}

export function NetworkEventCard({ event, hostChapters, going }: { event: CalendarEvent; hostChapters: string[]; going: boolean }) {
  const { month, day } = dateBlock(event.dayKey)
  return (
    <EntityCard href={`/events/${event.slug}`} wrapTitle coverAspect="short" title={event.title} context={event.whenLabel}
      cover={<Cover url={event.coverUrl} focus={event.coverFocus} />}
      coverOverlay={<>
        {event.coverUrl && <div className="absolute inset-0 bg-gradient-to-t from-ink/35 via-transparent to-transparent" />}
        <div className="absolute bottom-3 left-3 flex flex-col items-center rounded-card bg-surface/95 px-2.5 py-1 text-text lift-1">
          <span className="eyebrow leading-none">{month}</span><span className="text-stat-md font-bold leading-tight">{day}</span>
        </div>
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {hostChapters.map(c => <span key={c} className={PILL}>{c}</span>)}
        </div>
        {going && <span className={`${PILL} absolute right-3 top-3 inline-flex items-center gap-1`}><Check className="h-3 w-3" aria-hidden />Going</span>}
      </>}
      meta={<>
        {event.goingCount > 0 && <span className="flex items-center gap-1 font-medium text-muted"><Users className="h-3 w-3" aria-hidden />{event.goingCount} going</span>}
        {event.location && <span className="flex min-w-0 items-center gap-0.5"><MapPin className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{event.location}</span></span>}
      </>}
    />
  )
}
