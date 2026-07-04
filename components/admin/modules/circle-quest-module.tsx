'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getCircleAdminData } from '@/app/(main)/circles/admin-actions'
import type { CircleQuestItem } from '@/app/(main)/circles/admin-actions'

// In-place "Circle Quest" admin module. Lists (read-only) the Journeys and Practices this group has
// adopted. Self-loads via getCircleAdminData, which returns null unless the caller holds
// circle.editSettings — so a viewer who can't manage this circle sees nothing here. The "This week's
// practice" picker was extracted into its own rail module (circle.practice, ADR-515 Phase 4), so it no
// longer lives here (it would otherwise render twice in the engage section). The adopt/drop CHALLENGE
// editor was likewise de-duplicated out: challenges are edited in exactly ONE place, the first-class
// `circle.engage` module (getCircleEngageData), so mounting CircleChallenges here too was the "excess
// editing options" the owner flagged — same fix as the practice picker above.

type CircleData = NonNullable<Awaited<ReturnType<typeof getCircleAdminData>>>

export function CircleQuestModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CircleData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getCircleAdminData(slug).then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-24 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  // No card chrome — sits flush on the panel's white surface.
  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h3 className="text-sm font-bold text-text">Circle Quest</h3>
        <p className="text-sm text-muted">
          The journeys and practices your group has taken on.
        </p>
      </header>

      <QuestList label="Journeys" items={data.adoptedJourneys} empty="No journeys adopted yet" />
      <QuestList label="Practices" items={data.adoptedPractices} empty="No practices adopted yet" />
    </section>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="text-2xs font-semibold uppercase tracking-wide text-subtle">{children}</h4>
}

function QuestList({ label, items, empty }: { label: string; items: CircleQuestItem[]; empty: string }) {
  return (
    <div className="space-y-2">
      <SectionLabel>{label}</SectionLabel>
      {items.length === 0 ? (
        <p className="text-sm text-subtle">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="block truncate rounded-md px-2 py-1 text-sm text-text hover:bg-surface-elevated hover:text-primary-strong transition-colors"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
