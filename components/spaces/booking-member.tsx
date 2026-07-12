import { CalendarDays } from 'lucide-react'
import { listOpenSlots, getSpaceBookingTimezone, type OpenSlot } from '@/lib/spaces/booking'
import { viewerManagesSpace } from '@/lib/spaces/operator'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminSetupPrompt } from '@/components/spaces/admin-setup-prompt'
import { BookingPicker } from '@/components/spaces/booking-picker'

// MEMBER BOOKING SURFACE (ENTITY-SPACES-SYSTEM section 2.4, booking v1). The self-fetching server
// half of the Practitioner's Book tab: it loads the next ~14 days of OPEN slots for this Space
// (listOpenSlots returns only open instants, never who booked), groups them by day in the Space's
// configured timezone, and hands them to the client BookingPicker so a member can pick a time and
// confirm. When the practitioner has not published any availability, an EmptyState names the
// situation and the next step (follow to hear when times open). Server-first; the slot fetch sits
// behind a <Suspense> in the caller (entity-cta) so the tab paints instantly.
//
// COPY: plain camp-counselor voice, no narrated feelings, no em/en dashes (CONTENT-VOICE section 10).
// TIMEZONE: v1 displays every slot in the Space's configured IANA timezone, LABELED. Per-member tz
// conversion is deferred.

/** A day group of open slots (the local calendar date label + its slots). */
export interface SlotDay {
  /** A stable key (the local YYYY-MM-DD in the Space timezone). */
  key: string
  /** The day label, e.g. "Tuesday, June 23". */
  label: string
  slots: OpenSlot[]
}

/** Group open slots by their local calendar day in `timezone`, preserving ascending order. */
export function groupSlotsByDay(slots: OpenSlot[], timezone: string): SlotDay[] {
  const dayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const groups = new Map<string, SlotDay>()
  for (const slot of slots) {
    const d = new Date(slot.startsAt)
    const key = dayKey.format(d)
    let group = groups.get(key)
    if (!group) {
      group = { key, label: dayLabel.format(d), slots: [] }
      groups.set(key, group)
    }
    group.slots.push(slot)
  }
  return [...groups.values()]
}

/** A plain-language session-length label for the header, derived from the open slots' durations (no
 *  IO). One length reads "30 minute sessions"; mixed lengths read "30 or 60 minute sessions" so a
 *  member knows what to expect before they pick. Returns null when there are no slots to describe. */
export function sessionLengthLabel(slots: OpenSlot[]): string | null {
  const lengths = [...new Set(slots.map((s) => s.slotMinutes))].sort((a, b) => a - b)
  if (lengths.length === 0) return null
  const list =
    lengths.length === 1
      ? String(lengths[0])
      : `${lengths.slice(0, -1).join(', ')} or ${lengths[lengths.length - 1]}`
  return `${list} minute sessions`
}

/** A short, friendly timezone label for the header, e.g. "EDT" or the IANA name if no short form. */
function timezoneLabel(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone
  } catch {
    return timezone
  }
}

export async function BookingMember({
  spaceId,
  slug,
  ownerProfileId,
}: {
  spaceId: string
  slug: string
  ownerProfileId: string | null
}) {
  const slots = await listOpenSlots(spaceId)

  if (slots.length === 0) {
    // OPERATOR (owner / admin / editor): guide them to publish availability instead of showing the
    // member "nothing here" copy, and offer to change what the primary button opens (the Focus).
    if (await viewerManagesSpace({ id: spaceId, ownerProfileId })) {
      return (
        <AdminSetupPrompt
          icon={CalendarDays}
          title="Your button opens booking, but your calendar is empty."
          description="Set your weekly times so members can book you. You can also change what your button opens."
          links={[
            { href: `/spaces/${slug}/settings/offerings#availability`, label: 'Set up availability' },
            {
              href: `/spaces/${slug}/manage/mode`,
              label: 'Change what your button opens',
              tone: 'secondary',
            },
          ]}
        />
      )
    }
    return (
      <EmptyState
        icon={CalendarDays}
        title="No open times yet."
        description="This practitioner has not posted availability. Follow this space to hear the moment new times open."
      />
    )
  }

  // v1 is one timezone per Space: every slot's window shares it, so we resolve it once for the whole
  // surface and label it. listOpenSlots returns instants (no tz), so the tz comes from the lib.
  const timezone = await getSpaceBookingTimezone(spaceId)
  const days = groupSlotsByDay(slots, timezone)
  const tzLabel = timezoneLabel(timezone)
  const sessionLabel = sessionLengthLabel(slots)

  return (
    <BookingPicker
      spaceId={spaceId}
      days={days}
      timezone={timezone}
      tzLabel={tzLabel}
      sessionLabel={sessionLabel}
    />
  )
}
