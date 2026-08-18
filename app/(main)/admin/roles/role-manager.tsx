'use client'

import Image from 'next/image'
import { useMemo, useState, useTransition } from 'react'
import { Search, Zap, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { assignRole } from '@/app/(main)/admin/actions'
import { ROLE_HIERARCHY, type CommunityRole } from '@/lib/core/roles'
import { ROLE_LABEL, RoleBadge } from '@/lib/community-roles'
import { nextRole } from '@/lib/roles-meta'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { Input } from '@/components/ui/field'

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
    <section className="rounded-2xl border border-border bg-surface lift-1">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-body-sm font-semibold text-text">Members · advancement</h2>
            <p className="text-meta text-muted">
              Sorted by contribution (season Zaps). Promote anyone ready to advance.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-card border border-border bg-surface-elevated px-3 py-2">
          <Search className="h-4 w-4 text-subtle" />
          <Input
            variant="seamless"
            aria-label="Search members"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name or @handle…"
            className="w-full text-body-sm text-text"
          />
        </div>
        {error && <p className="mt-2 text-body-sm text-danger">{error}</p>}
      </div>

      <ul className="divide-y divide-border">
        {filtered.length === 0 && (
          <li className="p-6 text-center text-body-sm text-muted">No members match “{query}”.</li>
        )}
        {filtered.map((m, i) => {
          const up = nextRole(m.role)
          const saving = savingId === m.id
          return (
            <li key={m.id} className="flex items-center gap-3 p-3">
              <span className="w-6 shrink-0 text-center text-meta font-semibold tabular-nums text-subtle">
                {i + 1}
              </span>
              {m.avatarUrl ? (
                <Image src={avatarSrc(m.avatarUrl)} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-pill object-cover" style={avatarFocusStyle(m.avatarUrl)} />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-surface-elevated text-meta font-semibold text-muted">
                  {getInitials(m.displayName)}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-body-sm font-medium text-text">{m.displayName}</span>
                  <RoleBadge role={m.role} size="lg" />
                </div>
                <div className="flex items-center gap-2 text-meta text-subtle">
                  {m.handle && <span className="truncate">@{m.handle}</span>}
                  <span className="inline-flex items-center gap-0.5 text-muted">
                    <Zap className="h-3 w-3 fill-current text-primary" />
                    {m.zaps.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {up && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={saving}
                    onClick={() => update(m.id, up)}
                    title={`Promote to ${ROLE_LABEL[up]}`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    {ROLE_LABEL[up]}
                  </Button>
                )}
                <Select
                  value={m.role}
                  disabled={saving}
                  onChange={(e) => update(m.id, e.target.value as CommunityRole)}
                  className="text-meta"
                  wrapperClassName="inline-block w-max max-w-full"
                  aria-label={`Role for ${m.displayName}`}
                >
                  {ROLE_HIERARCHY.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
