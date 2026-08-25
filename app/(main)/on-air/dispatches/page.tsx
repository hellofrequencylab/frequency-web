// The Dispatch archive (On Air P2, ADR-229) — every past Dispatch from Vera,
// newest first, replayed straight from the cache. No live Vera here, by design:
// what she said is what stays said.

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Radio, ChevronRight } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { listDispatches } from '@/lib/vera-dispatch'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata: Metadata = {
  title: 'Dispatches from Vera',
  description: 'Your past assignments, saved.',
}

// 🔴 `d.day` IS A UTC CALENDAR DAY, because that is the key the Dispatch is minted and
// de-duplicated under: `todayUTC()` in lib/vera-dispatch.ts, one row per (profile, UTC day). So
// Today / Yesterday are compared in UTC ON PURPOSE. Re-keying them to the community's zone here
// while the row's key stays UTC would be the same bug pointed the other way: a Dispatch generated
// at 6pm Pacific is stored under TOMORROW's UTC date, and would stop reading "Today" the moment it
// was written. Moving this to HOME_TZ means moving `todayUTC()` with it, in one change.
//
// What IS pinned: the date label. It used to read the AMBIENT server zone, which is UTC on Vercel
// and something else everywhere it is developed. The anchor is noon UTC, so an explicit zone names
// the same calendar date it always did, and can no longer drift with where the render happens.
function dayLabel(day: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (day === today) return 'Today'
  const d = new Date(`${day}T12:00:00Z`)
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  if (day === yesterday) return 'Yesterday'
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
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
