'use client'

import { useMemo, useState, useTransition } from 'react'
import { Search, Zap, ArrowUp } from 'lucide-react'
import { assignRole } from '@/app/(main)/admin/actions'
import { ROLE_HIERARCHY, type CommunityRole } from '@/lib/core/roles'
import { ROLE_LABEL, roleBadgeStyle } from '@/lib/community-roles'
import { nextRole } from '@/lib/roles-meta'
import { getInitials } from '@/lib/utils'

export type RoleMember = {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
  role: CommunityRole
  zaps: number
}

export function RoleManager({ members }: { members: RoleMember[] }) {
  const [query, setQuery] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.handle.toLowerCase().includes(q),
    )
  }, [members, query])

  function update(id: string, role: CommunityRole) {
    setError(null)
    setSavingId(id)
    startTransition(async () => {
      try {
        await assignRole(id, role)
        // Full reload so badges + counts everywhere reflect the change.
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update role.')
        setSavingId(null)
      }
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text">Members · advancement</h2>
            <p className="text-xs text-muted">
              Sorted by contribution (season zaps). Promote anyone ready to advance.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2">
          <Search className="h-4 w-4 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name or @handle…"
            className="w-full bg-transparent text-sm text-text placeholder:text-subtle outline-none"
          />
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      <ul className="divide-y divide-border">
        {filtered.length === 0 && (
          <li className="p-6 text-center text-sm text-muted">No members match “{query}”.</li>
        )}
        {filtered.map((m, i) => {
          const up = nextRole(m.role)
          const saving = savingId === m.id
          return (
            <li key={m.id} className="flex items-center gap-3 p-3">
              <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-subtle">
                {i + 1}
              </span>
              {m.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-muted">
                  {getInitials(m.displayName)}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-text">{m.displayName}</span>
                  <span className="rank-badge text-xs font-bold leading-tight" style={roleBadgeStyle(m.role)}>
                    {ROLE_LABEL[m.role]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-subtle">
                  {m.handle && <span className="truncate">@{m.handle}</span>}
                  <span className="inline-flex items-center gap-0.5 text-muted">
                    <Zap className="h-3 w-3 fill-current text-primary" />
                    {m.zaps.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {up && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => update(m.id, up)}
                    title={`Promote to ${ROLE_LABEL[up]}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    {ROLE_LABEL[up]}
                  </button>
                )}
                <select
                  value={m.role}
                  disabled={saving}
                  onChange={(e) => update(m.id, e.target.value as CommunityRole)}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-medium text-text outline-none disabled:opacity-50"
                  aria-label={`Role for ${m.displayName}`}
                >
                  {ROLE_HIERARCHY.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
