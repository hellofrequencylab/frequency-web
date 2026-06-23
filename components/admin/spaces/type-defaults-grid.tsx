'use client'

import { useState, useTransition } from 'react'
import { RotateCcw } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { SPACE_ROLES, type SpaceRole } from '@/lib/spaces/membership'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import { setTypeFunctionDefault } from '@/app/(main)/admin/spaces/defaults/actions'

// OPERATOR per-TYPE function-defaults grid (per-space-roles Phase 2, client). One TABLE per space type:
// a row per function that type offers, each with an ENABLED toggle and a MIN-ROLE select. These set what
// every NEW Space of that type starts with (the seed merges them over the code defaults at provision
// time). Optimistic local state with rollback, saving through the janitor-gated action. The "custom"
// pill marks a cell that differs from the code default. Plain operator copy, no em dashes.

const ROLE_LABEL: Record<SpaceRole, string> = {
  viewer: 'Member',
  editor: 'Editor',
  moderator: 'Moderator',
  admin: 'Admin',
}

/** One function row for a type, seeded server-side from the operator defaults merged over the code
 *  defaults. `planGated` is informational; plan-gated tools are not seeded ON (a new Space starts free),
 *  so their toggle here only ever sets a min-role for when the plan later grants the tool. */
export interface TypeDefaultRow {
  key: SpaceFunctionKey
  label: string
  description: string
  planGated: boolean
  enabled: boolean
  minRole: SpaceRole
  defaultEnabled: boolean
  defaultMinRole: SpaceRole
}

/** One type's block: its label + the rows it offers. */
export interface TypeDefaultBlock {
  type: string
  typeLabel: string
  rows: TypeDefaultRow[]
}

export function TypeDefaultsGrid({ blocks }: { blocks: TypeDefaultBlock[] }) {
  return (
    <div className="space-y-8">
      {blocks.map((b) => (
        <TypeBlock key={b.type} block={b} />
      ))}
    </div>
  )
}

function TypeBlock({ block }: { block: TypeDefaultBlock }) {
  const [state, setState] = useState<Record<string, { enabled: boolean; minRole: SpaceRole }>>(() => {
    const out: Record<string, { enabled: boolean; minRole: SpaceRole }> = {}
    for (const r of block.rows) out[r.key] = { enabled: r.enabled, minRole: r.minRole }
    return out
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function save(key: SpaceFunctionKey, next: { enabled: boolean; minRole: SpaceRole }) {
    const prev = state[key]
    setState((s) => ({ ...s, [key]: next }))
    setError(null)
    setSavingKey(key)
    startTransition(async () => {
      try {
        const res = await setTypeFunctionDefault(block.type, key, next.enabled, next.minRole)
        if (isError(res)) throw new Error(res.error)
      } catch (e) {
        setState((s) => ({ ...s, [key]: prev })) // roll back
        setError(e instanceof Error ? e.message : 'Could not save.')
      } finally {
        setSavingKey(null)
      }
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold text-text">{block.typeLabel}</h2>
        <p className="mt-0.5 text-xs text-muted">
          What a new {block.typeLabel.toLowerCase()} space starts with. Universal tools start on; the
          lowest role sets who can use each one. Plan tools turn on when a plan grants them.
        </p>
      </div>

      {error && <p className="px-4 pt-3 text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto p-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-xs font-semibold text-subtle">
                Function
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-muted">On for new spaces</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-muted">Lowest role</th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r) => {
              const cur = state[r.key]
              const isCustom = cur.enabled !== r.defaultEnabled || cur.minRole !== r.defaultMinRole
              return (
                <tr key={r.key} className="border-t border-border align-top">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-3 py-3 text-left font-medium text-text"
                  >
                    <span className="flex items-center gap-2">
                      {r.label}
                      {r.planGated && (
                        <span
                          title="Plan tool. It turns on when a plan grants it; this only sets its lowest role."
                          className="inline-flex items-center rounded-full bg-surface-elevated px-1.5 py-0.5 text-[11px] font-semibold text-muted"
                        >
                          Plan
                        </span>
                      )}
                      {isCustom && (
                        <span
                          title={`Default: ${r.defaultEnabled ? 'on' : 'off'}, ${ROLE_LABEL[r.defaultMinRole]}`}
                          className="inline-flex items-center gap-0.5 rounded-full bg-primary-bg px-1.5 py-0.5 text-xs font-semibold text-primary-strong"
                        >
                          <RotateCcw className="h-2.5 w-2.5" /> custom
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block max-w-prose text-xs font-normal text-muted">
                      {r.description}
                    </span>
                  </th>
                  <td className="px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${block.typeLabel} ${r.label}: on for new spaces`}
                      checked={cur.enabled}
                      disabled={savingKey === r.key}
                      onChange={(e) => save(r.key, { ...cur, enabled: e.target.checked })}
                      className="h-4 w-4 cursor-pointer accent-[var(--color-primary,#7a5c3a)] disabled:opacity-50"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <select
                      aria-label={`${block.typeLabel} ${r.label}: lowest role`}
                      value={cur.minRole}
                      disabled={savingKey === r.key}
                      onChange={(e) => save(r.key, { ...cur, minRole: e.target.value as SpaceRole })}
                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-primary disabled:opacity-50"
                    >
                      {SPACE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
