'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'

// The "New Event" entry on the events page. It opens the guided Vera composer at /events/new
// (the EventSpark wizard: a few questions → Vera drafts the event → review → the draft editor),
// matching how Journeys and Practices are created. Crew (and stewards) can create whether or
// not they belong to a circle — the wizard scopes a circle-less event as a public local event
// in the member's area. The page gates the entry: Crew get this link, non-Crew get the upgrade
// popup (see CrewGateButton on /events).
export function EventCompose() {
  return (
    <Link
      href="/events/new"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
    >
      <Plus className="h-4 w-4" />
      New Event
    </Link>
  )
}
