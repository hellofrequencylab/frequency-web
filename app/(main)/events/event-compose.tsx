'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'

type Group = { id: string; name: string }

// The "New Event" entry on the events page. It opens the guided Vera composer at /events/new
// (the EventSpark wizard: a few questions → Vera drafts the event → review → the draft editor),
// matching how Journeys and Practices are created. Replaces the old in-place Studio quick-create
// popup. Rendered only for members who can host (the page gates on `isCrew`); we still hide it
// when the member is in no circle, since an event needs a circle to belong to.
export function EventCompose({ groups }: { groups: Group[] }) {
  if (groups.length === 0) return null

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
