'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Check, ChevronRight, Users } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getEventPeopleData, approveEventRsvp, type EventPeopleData } from '@/app/(main)/events/admin-actions'

// In-place "People" module (ENTITY-MANAGEMENT-OVERHAUL §4, the 'people' spine cell). Renders in
// the page admin dock on /events/[slug]; the server returns null unless the caller holds
// event.editSettings, so the module shows nothing for anyone else. Summarises the RSVP roster
// (going / maybe / waitlist / +1s), the capacity fill, and the approval queue, and links to the
// full Manage Dashboard for deeper work.

export function EventPeopleModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<EventPeopleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [approved, setApproved] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!slug) return
    let active = true
    getEventPeopleData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const mod = moduleById('event.people')
  const Icon = mod?.Icon ?? Users
  const { analytics } = data
  const cap = analytics.capacity.capacity
  const fillPct = cap && cap > 0 ? Math.min(100, Math.round((analytics.going / cap) * 100)) : null

  function handleApprove(profileId: string) {
    if (!data || pending) return
    startTransition(async () => {
      const res = await approveEventRsvp(data!.eventId, slug!, profileId)
      if ('error' in res) {
        setError(res.error)
      } else {
        setError(null)
        setApproved((prev) => new Set(prev).add(profileId))
      }
    })
  }

  const stillPending = data.pending.filter((p) => !approved.has(p.profileId))

  return (
    <div className="@container space-y-6">
      <section>
        <header className="mb-4 space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" />}
            {mod?.label ?? 'People'}
          </h3>
          {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
        </header>

        {/* Counts — the roster at a glance. */}
        <div className="grid grid-cols-2 gap-2 @sm:grid-cols-4">
          {[
            { label: 'Going', value: analytics.going },
            { label: 'Headcount', value: analytics.headcount },
            { label: 'Maybe', value: analytics.maybe },
            { label: 'Waitlist', value: analytics.waitlist },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
              <div className="text-lg font-bold text-text">{s.value}</div>
              <div className="text-2xs font-medium uppercase tracking-wide text-subtle">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Capacity fill — only when the event caps attendance. */}
        <div className="mt-3 space-y-1.5">
          {cap && cap > 0 ? (
            <>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Capacity</span>
                <span className="font-medium text-text">
                  {analytics.going} / {cap}
                  {analytics.checkedIn > 0 && <span className="text-subtle"> · {analytics.checkedIn} checked in</span>}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-subtle">
              No capacity limit set{analytics.checkedIn > 0 ? ` · ${analytics.checkedIn} checked in` : ''}.
            </p>
          )}
        </div>

        {/* Approval queue — approve a guest without leaving the page. */}
        {stillPending.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold text-text">Waiting for your approval ({stillPending.length})</p>
            <ul className="space-y-2">
              {stillPending.map((p) => (
                <li
                  key={p.profileId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-2.5"
                >
                  <span className="min-w-0 truncate text-sm text-text">
                    {p.displayName}
                    {p.handle && <span className="text-subtle"> @{p.handle}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleApprove(p.profileId)}
                    disabled={pending}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="mt-3 text-xs font-medium text-danger">{error}</p>}

        <Link
          href={`/events/${slug}/manage`}
          className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-elevated"
        >
          <Users className="h-5 w-5 shrink-0 text-primary-strong" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">Open the guest dashboard</span>
            <span className="block text-xs text-muted">The full roster, +1s, check-in, and questions.</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
        </Link>
      </section>
    </div>
  )
}
