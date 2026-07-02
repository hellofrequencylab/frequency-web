'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Users } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { HostInviteButton } from '@/components/circles/host-invite-button'
import { HostInviteEmail } from '@/components/circles/host-invite-email'
import { getCirclePeopleData, type CirclePeopleData } from '@/app/(main)/circles/admin-actions'

// In-place "People" module (ADMIN-RAIL.md Phase 7, the 'people' spine cell). Renders in the page
// admin dock on /circles/[slug]; the server returns null unless the caller holds circle.moderate,
// so the module shows nothing for anyone else. Summarises the roster (members, crew, capacity fill),
// lists the first slice of members with their role, and reuses the host invite tools.

function roleLabel(role: string | null): string | null {
  if (!role || role === 'member') return null
  // Titlecase a plain role token (host / guide / mentor / crew) for the chip.
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function CirclePeopleModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CirclePeopleData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getCirclePeopleData(slug)
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

  const mod = moduleById('circle.people')
  const Icon = mod?.Icon ?? Users
  const cap = data.memberCap
  const fillPct = cap && cap > 0 ? Math.min(100, Math.round((data.memberCount / cap) * 100)) : null

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
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Members', value: data.memberCount },
            { label: 'Capacity', value: cap },
            { label: 'Crew', value: data.crewCount },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
              <div className="text-lg font-bold text-text">{s.value}</div>
              <div className="text-2xs font-medium uppercase tracking-wide text-subtle">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Capacity fill. */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>How full</span>
            <span className="font-medium text-text">
              {data.memberCount} / {cap}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${fillPct ?? 0}%` }} />
          </div>
        </div>

        {/* Roster slice with roles. */}
        {data.members.length > 0 && (
          <ul className="mt-5 space-y-2">
            {data.members.map((m) => {
              const chip = m.isHost ? 'Host' : roleLabel(m.role)
              return (
                <li
                  key={m.profileId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-2.5"
                >
                  <span className="min-w-0 truncate text-sm text-text">
                    {m.displayName}
                    {m.handle && <span className="text-subtle"> @{m.handle}</span>}
                  </span>
                  {chip && (
                    <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
                      {chip}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* Invite tools — reuse the host invite link + email actions. */}
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <p className="text-xs font-semibold text-text">Invite someone</p>
          <HostInviteButton circleId={data.circleId} />
          <HostInviteEmail circleId={data.circleId} />
        </div>
      </section>
    </div>
  )
}
