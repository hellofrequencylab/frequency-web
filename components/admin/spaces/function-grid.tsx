'use client'

import { useState, useTransition } from 'react'
import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { SPACE_ROLES, type SpaceRole } from '@/lib/spaces/membership'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import { setSpaceFunctionEnabled, setSpaceFunctionMinRole } from '@/app/(main)/admin/spaces/[id]/actions'

// OPERATOR "Features and access" grid (per-space-roles Phase 1). One row per function this Space type
// offers: an ENABLED toggle and a MIN-ROLE select (the lowest member role that may use it). Mirrors
// app/(main)/admin/roles/permission-grid.tsx: optimistic local state, save on change through the
// janitor-gated actions, roll back on failure. The "custom" pill marks a min-role that differs from the
// code default. Plain operator copy, no em dashes.

// The space-role nouns, shown member-facing (the ladder, lib/spaces/membership.ts). 'viewer' reads as
// the plain "Member", matching components/spaces/invite-form.tsx.
const ROLE_LABEL: Record<SpaceRole, string> = {
  viewer: 'Member',
  editor: 'Editor',
  moderator: 'Moderator',
  admin: 'Admin',
}

/** One function's current state, seeded server-side from the Space's entitlements + feature_roles
 *  merged over the code defaults. */
export interface FunctionRow {
  key: SpaceFunctionKey
  label: string
  description: string
  /** Is this function plan-gated (its on/off is an entitlement)? Purely informational in the grid. */
  planGated: boolean
  /** Current ON state (resolved on/off). */
  enabled: boolean
  /** Current effective min-role (override or code default). */
  minRole: SpaceRole
  /** The code default min-role (drives the "custom" pill). */
  defaultMinRole: SpaceRole
}

export function FunctionGrid({ spaceId, rows }: { spaceId: string; rows: FunctionRow[] }) {
  const [state, setState] = useState<Record<string, { enabled: boolean; minRole: SpaceRole }>>(() => {
    const out: Record<string, { enabled: boolean; minRole: SpaceRole }> = {}
    for (const r of rows) out[r.key] = { enabled: r.enabled, minRole: r.minRole }
    return out
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function toggleEnabled(key: SpaceFunctionKey, enabled: boolean) {
    const prev = state[key]
    setState((s) => ({ ...s, [key]: { ...s[key], enabled } }))
    setError(null)
    setSavingKey(key)
    startTransition(async () => {
      try {
        const res = await setSpaceFunctionEnabled(spaceId, key, enabled)
        if (isError(res)) throw new Error(res.error)
      } catch (e) {
        setState((s) => ({ ...s, [key]: prev })) // roll back
        setError(e instanceof Error ? e.message : 'Could not save.')
      } finally {
        setSavingKey(null)
      }
    })
  }

  function chooseRole(key: SpaceFunctionKey, minRole: SpaceRole) {
    if (state[key].minRole === minRole) return
    const prev = state[key]
    setState((s) => ({ ...s, [key]: { ...s[key], minRole } }))
    setError(null)
    setSavingKey(key)
    startTransition(async () => {
      try {
        const res = await setSpaceFunctionMinRole(spaceId, key, minRole)
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
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
            <SlidersHorizontal className="h-4 w-4 text-primary-strong" />
            Features and access
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Turn the tools this space uses on or off, and set the lowest role that can use each one.
            Changes save instantly. An operator switch beats the plan, so turning a paid feature on here
            grants it regardless of plan.
          </p>
        </div>
      </div>

      {error && <p className="px-4 pt-3 text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto p-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-xs font-semibold text-subtle">
                Function
              </th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-muted">On</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-muted">Lowest role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cur = state[r.key]
              const isCustom = cur.minRole !== r.defaultMinRole
              return (
                <tr key={r.key} className="border-t border-border align-top">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-3 text-left font-medium text-text">
                    <span className="flex items-center gap-2">
                      {r.label}
                      {r.planGated && (
                        <span
                          title="Plan feature. The operator switch here grants it regardless of plan."
                          className="inline-flex items-center rounded-full bg-surface-elevated px-1.5 py-0.5 text-xs font-semibold text-muted"
                        >
                          Plan
                        </span>
                      )}
                      {isCustom && (
                        <span
                          title={`Default: ${ROLE_LABEL[r.defaultMinRole]}`}
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
                      aria-label={`${r.label}: enabled`}
                      checked={cur.enabled}
                      disabled={savingKey === r.key}
                      onChange={(e) => toggleEnabled(r.key, e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-[var(--color-primary)] disabled:opacity-50"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <select
                      aria-label={`${r.label}: lowest role`}
                      value={cur.minRole}
                      disabled={savingKey === r.key || !cur.enabled}
                      onChange={(e) => chooseRole(r.key, e.target.value as SpaceRole)}
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
