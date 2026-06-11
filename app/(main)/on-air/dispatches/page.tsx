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

function dayLabel(day: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (day === today) return 'Today'
  const d = new Date(`${day}T12:00:00Z`)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (day === yesterday) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default async function DispatchesPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const dispatches = await listDispatches(profileId, 30)

  return (
    <FocusTemplate
      eyebrow="On Air"
      title="Dispatches from Vera"
      description="Every assignment, saved. What she said is what stays said."
      back={{ href: '/on-air', label: 'On Air' }}
      width="narrow"
    >
      {dispatches.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No Dispatches yet"
          description="Finish a session On Air and Vera sends your first assignment."
          action={
            <Link
              href="/on-air"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Go on air
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {dispatches.map((d) => (
            <li
              key={d.day}
              className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm"
            >
              <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest text-subtle">
                <Radio className="h-3 w-3 text-primary" /> {dayLabel(d.day)}
              </p>
              <p className="mt-1.5 text-sm font-medium leading-relaxed text-text">{d.copy}</p>
              {d.actionHref && (
                <Link
                  href={d.actionHref}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline"
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
