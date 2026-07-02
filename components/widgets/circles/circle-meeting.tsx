import { Clock, Globe, MapPin } from 'lucide-react'
import { getCircleContext } from '@/lib/circles/active-circle'
import { createAdminClient } from '@/lib/supabase/admin'

// The movable "How we meet" block (the `circle-meeting` layout module, paired with the Place & Time
// editor). A zero-prop self-fetching RSC reading the active circle from the request-scoped context
// (lib/circles/active-circle.ts). It surfaces the plain meeting facts the map doesn't spell out: in
// person or online, the area, and the time zone. It returns null when there is nothing to say (an
// in-person circle with no area and no zone), so it never leaves an empty slot. DAWN tokens only;
// container-query friendly.

/** A saved IANA zone → a short human label ('America/Los_Angeles' → 'Los Angeles'). */
function zoneLabel(tz: string): string {
  const tail = tz.split('/').pop() ?? tz
  return tail.replace(/_/g, ' ')
}

export const CircleMeeting = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle } = ctx

  // timezone is not carried on the shared circle context → one tiny scoped read.
  const admin = createAdminClient()
  const { data } = await admin.from('circles').select('timezone').eq('id', circle.id).maybeSingle()
  const timezone = (data as { timezone?: string | null } | null)?.timezone ?? null

  const isOnline = circle.type === 'online'
  const place = isOnline ? 'Meets online' : [circle.neighborhood, circle.city].filter(Boolean).join(', ')

  // Nothing meaningful to add (in-person with no area and no zone) → render nothing.
  if (!place && !timezone) return null

  return (
    <div className="@container rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text">
        {isOnline ? (
          <Globe className="h-4 w-4 shrink-0 text-primary-strong" />
        ) : (
          <MapPin className="h-4 w-4 shrink-0 text-primary-strong" />
        )}
        How we meet
      </h3>
      <ul className="space-y-2 text-sm text-muted">
        {place && (
          <li className="flex items-start gap-2">
            {isOnline ? (
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
            ) : (
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
            )}
            <span className="text-text">{place}</span>
          </li>
        )}
        {timezone && (
          <li className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
            <span>Times in {zoneLabel(timezone)}</span>
          </li>
        )}
      </ul>
    </div>
  )
}
