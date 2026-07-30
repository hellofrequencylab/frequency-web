import Link from 'next/link'

// ── "at <Space>" — the VENUE credit on an event's host line (ADR-911) ──────────────────────
//
// The fourth role in the event model, and the one that had no way to be said. `events` has carried
// two distinct Space axes since ADR-819 — `space_id` is pure tenancy ("lives under") and
// `host_space_id` is "hosted by, billed, paid" — but both the read path and the write path forced
// them equal, so an event AT one Space HOSTED BY another could not be expressed. Naming the host
// re-homed the event. Owner report: "hosted by Audrey DeWitt, at Royal Temple. I want it to say
// Part of Royal Temple but list Audrey as the host."
//
// WHY IT LIVES ON THE HOST LINE and not in the "Part of" strip, and not on the WHERE line:
//   • "Part of" already showed a Space chip resolved from the HOST axis, so the venue and the host
//     were the same name twice. The Space left that strip entirely (it keeps Circle + Journey), which
//     makes the duplicate structurally impossible instead of a conditional someone can forget.
//   • The WHERE line carries the PHYSICAL venue name + street address and deep-links to Maps. A
//     Space is an account, not a place; putting it there reads as a second address.
//   • On the host line it reads the way a person says it out loud: "Audrey DeWitt, at Royal Temple."
//
// Deliberately NOT a logo, NOT bold, and NOT a featured card. A venue holds no money and no rights
// (docs/NAMING.md: money follows the Host, calendars follow the Venue and Collaborators, rights
// follow the Host and Cohosts). A venue that wants brand presence on the card becomes a
// Collaborator — an existing relation, so that stays a data choice rather than a code change.
//
// Renders NOTHING when `venue` is null, which is every event whose venue is its host. That is the
// common case and the component is mounted unconditionally, so callers need no branch.
export function VenueCredit({ venue }: { venue: { slug: string; name: string } | null }) {
  if (!venue) return null
  return (
    <span className="text-subtle">
      {' · at '}
      <Link href={`/spaces/${venue.slug}`} className="font-medium hover:underline">
        {venue.name}
      </Link>
    </span>
  )
}
