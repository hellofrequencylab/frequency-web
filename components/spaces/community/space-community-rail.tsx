import Link from 'next/link'
import { Calendar, Clock, Compass, Globe, Mail, MapPin, Phone, Sparkles, Ticket, Users } from 'lucide-react'
import type { SpaceProfileData } from '@/lib/spaces/profile-data'
import type {
  SpaceEventItem,
  SpacePracticesData,
  SpaceCircleItem,
  SpaceBookingInfo,
} from '@/lib/spaces/content-data'

// THE COMMUNITY RIGHT RAIL (best-practice business page): core business info + DYNAMIC feature cards that
// appear only when the business has that feature turned on (events, practices/journeys, circles, booking).
// Server component (no hooks); every section is honest-empty (renders nothing when there is no data), so a
// brand-new Space shows a clean rail, never a hollow box. Semantic DAWN tokens, voice canon (no em dashes).

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-text">
        <span className="text-primary-strong" aria-hidden>{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function SpaceCommunityRail({
  slug,
  brandName,
  tagline,
  profile,
  booking,
  events,
  practices,
  circles,
}: {
  slug: string
  brandName: string
  tagline: string | null
  profile: SpaceProfileData
  booking: SpaceBookingInfo
  events: SpaceEventItem[]
  practices: SpacePracticesData
  circles: SpaceCircleItem[]
}) {
  const about = profile.about?.trim() || tagline?.trim() || ''
  const hasContact = !!(profile.address || profile.hours || profile.phone || profile.email || profile.website)
  const allPractices = [...practices.practices, ...practices.journeys]

  return (
    <div className="space-y-4">
      {/* About */}
      {about && (
        <Card title={`About ${brandName}`} icon={<Sparkles className="h-4 w-4" />}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted line-clamp-6">{about}</p>
          <Link href={`/spaces/${slug}`} className="text-xs font-semibold text-primary-strong hover:underline">
            More about us
          </Link>
        </Card>
      )}

      {/* Primary action */}
      {booking.enabled && booking.href && (
        <Link
          href={booking.href}
          className="flex items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Ticket className="h-4 w-4" aria-hidden /> Book with {brandName}
        </Link>
      )}

      {/* Contact + hours */}
      {hasContact && (
        <Card title="Visit or reach us" icon={<MapPin className="h-4 w-4" />}>
          <ul className="space-y-2 text-sm text-muted">
            {profile.hours && (
              <li className="flex gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="whitespace-pre-wrap">{profile.hours}</span>
              </li>
            )}
            {profile.address && (
              <li className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(profile.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-primary-strong"
                >
                  {profile.address}
                </a>
              </li>
            )}
            {profile.phone && (
              <li className="flex gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <a href={`tel:${profile.phone}`} className="hover:text-primary-strong">{profile.phone}</a>
              </li>
            )}
            {profile.email && (
              <li className="flex gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <a href={`mailto:${profile.email}`} className="hover:text-primary-strong">{profile.email}</a>
              </li>
            )}
            {profile.website && (
              <li className="flex gap-2">
                <Globe className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <a href={profile.website} target="_blank" rel="noreferrer" className="truncate hover:text-primary-strong">
                  {profile.website.replace(/^https?:\/\//, '')}
                </a>
              </li>
            )}
          </ul>
        </Card>
      )}

      {/* Dynamic: upcoming events */}
      {events.length > 0 && (
        <Card title="Upcoming events" icon={<Calendar className="h-4 w-4" />}>
          <ul className="space-y-2">
            {events.slice(0, 4).map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.slug}`} className="flex items-start gap-2 text-sm hover:text-primary-strong">
                  <span className="mt-0.5 shrink-0 rounded-md bg-primary-bg px-1.5 py-0.5 text-2xs font-bold text-primary-strong">
                    {shortDate(e.startsAt)}
                  </span>
                  <span className="font-medium text-text">{e.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Dynamic: practices + journeys */}
      {allPractices.length > 0 && (
        <Card title="Practices and Journeys" icon={<Compass className="h-4 w-4" />}>
          <ul className="space-y-2">
            {allPractices.slice(0, 5).map((p) => (
              <li key={`${p.kind}-${p.id}`}>
                <Link
                  href={p.kind === 'journey' ? `/journeys/${p.slug}` : `/practices/${p.slug}`}
                  className="flex items-center gap-2 text-sm font-medium text-text hover:text-primary-strong"
                >
                  {p.emoji && <span aria-hidden>{p.emoji}</span>}
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Dynamic: circles */}
      {circles.length > 0 && (
        <Card title="Circles" icon={<Users className="h-4 w-4" />}>
          <ul className="space-y-2">
            {circles.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={`/circles/${c.slug}`} className="flex items-center justify-between gap-2 text-sm hover:text-primary-strong">
                  <span className="font-medium text-text">{c.name}</span>
                  {c.memberCount > 0 && <span className="text-xs text-subtle">{c.memberCount}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
