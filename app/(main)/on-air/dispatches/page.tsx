// The Dispatch archive (On Air P2, ADR-229) — every past Dispatch from Vera,
// newest first, replayed straight from the cache. No live Vera here, by design:
// what she said is what stays said.

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Radio, ChevronRight } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { listDispatches } from '@/lib/vera-dispatch'
import { dispatchDay } from '@/lib/on-air/dispatch-day'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata: Metadata = {
  title: 'Dispatches from Vera',
  description: 'Your past assignments, saved.',
}

// `d.day` IS THE COMMUNITY'S CALENDAR DAY (HOME_TZ), because that is the key the Dispatch is
// minted and de-duplicated under — `dispatchDay()` in lib/on-air/dispatch-day.ts, one row per
// (profile, community day). Today / Yesterday are compared in that SAME zone, by importing the
// same function rather than re-deriving the string here.
//
// This comment used to say the opposite, and it was honest at the time: the key really was the
// server's UTC day, so labelling in HOME_TZ while the key stayed UTC would have been the bug
// pointed the other way (a Dispatch written at 6pm Pacific stops reading "Today" the instant it is
// saved). SCAN-106 moved the key and this label together, in one change, which is what that note
// asked for.
//
// The full-date fallback still anchors at NOON UTC and formats in UTC. That is not a zone claim —
// `day` is already a plain YYYY-MM-DD, and a noon anchor is the safe way to render exactly that
// calendar date without a DST shift dragging it across a boundary.
function dayLabel(day: string): string {
  if (day === dispatchDay()) return 'Today'
  if (day === dispatchDay(new Date(Date.now() - 86_400_000))) return 'Yesterday'
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default async function DispatchesPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const dispatches = await listDispatches(profileId, 30)

  return (
    <FocusTemplate
      eyebrow="Mindless"
      title="Dispatches from Vera"
      description="Every assignment, saved. What she said is what stays said."
      back={{ href: '/on-air', label: 'Mindless' }}
      width="narrow"
    >
      {dispatches.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No Dispatches yet"
          description="Tune out once and Vera sends your first assignment."
          action={
            <Link
              href="/on-air"
              className="rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Tune out
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {dispatches.map((d) => (
            <li
              key={d.day}
              className="rounded-card border border-border bg-surface px-4 py-3 lift-1"
            >
              <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest text-muted">
                <Radio className="h-3 w-3 text-primary" /> {dayLabel(d.day)}
              </p>
              <p className="mt-1.5 text-body-sm font-medium leading-relaxed text-text">{d.copy}</p>
              {d.actionHref && (
                <Link
                  href={d.actionHref}
                  className="mt-2 inline-flex items-center gap-1 text-meta font-semibold text-primary-strong hover:underline"
                >
                  {d.actionLabel} <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </FocusTemplate>
  )
}
