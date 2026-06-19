import Link from 'next/link'
import { CalendarDays, MapPin, ArrowRight } from 'lucide-react'
import { getCrewContext } from '@/lib/quest/crew-context'
import { getNextGathering } from '@/lib/quest/next-gathering'
import { eventDateBadge, formatEventDate } from '@/lib/utils'

// My Quest layout module (ADR-270/294): "Your next gathering" — the one upcoming event to show
// up to in person (the point of the whole thing). Prefers an event the member RSVP'd to, else the
// nearest community event. Self-fetching RSC keyed to the member via getCrewContext; renders
// nothing when there's no viewer or no upcoming event. Arrange / hide it from Settings → Layout.
export async function QuestNextGathering() {
  const ctx = await getCrewContext()
  if (!ctx?.profileId) return null
  const g = await getNextGathering(ctx.profileId)
  if (!g) return null

  const { month, day } = eventDateBadge(g.startsAt)
  const dateStr = formatEventDate(g.startsAt)

  return (
    <Link
      href={`/events/${g.slug}`}
      className="group block rounded-2xl border border-success-bg bg-success-bg/50 px-4 py-3.5 shadow-sm transition-colors hover:border-success dark:bg-success-bg/20"
    >
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-success-bg">
          <span className="text-3xs font-bold uppercase leading-none text-success">{month}</span>
          <span className="text-lg font-bold leading-tight text-success">{day}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3 text-success" aria-hidden />
            <span className="text-3xs font-black uppercase tracking-widest text-success">
              {g.rsvped ? 'You’re going' : 'Your next gathering'}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-base font-bold text-text transition-colors group-hover:text-success">
            {g.title}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-2xs text-subtle">
            <span className="tabular-nums">{dateStr}</span>
            {g.location && (
              <span className="flex items-center gap-0.5">
                <MapPin className="h-2.5 w-2.5" aria-hidden /> {g.location}
              </span>
            )}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-success transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  )
}
