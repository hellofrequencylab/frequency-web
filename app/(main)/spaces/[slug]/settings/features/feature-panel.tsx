'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Lock, RotateCcw } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { SPACE_ROLES, type SpaceRole } from '@/lib/spaces/membership'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import { setSpaceFeatureEnabled, setSpaceFeatureMinRole } from './actions'

// OWNER "Features and access" panel (per-space-roles Phase 1, client). The owner turns the tools their
// space uses on or off and sets who can use each one. Optimistic local state with rollback, saving
// through the owner/admin-gated actions. Three row shapes:
//   • UNIVERSAL function — a free toggle (Members, QR codes, Profile, the per-type surfaces, …).
//   • PLAN-GATED + the plan HAS it — a toggle (can turn off, or back on within the plan).
//   • PLAN-GATED + the plan LACKS it — LOCKED, with a calm upgrade nudge to the billing page.
// Plain owner copy, no em dashes (CONTENT-VOICE).

const ROLE_LABEL: Record<SpaceRole, string> = {
  viewer: 'Member',
  editor: 'Editor',
  moderator: 'Moderator',
  admin: 'Admin',
}

/** One function row, seeded server-side. `locked` = a plan feature this plan does not include. */
export interface OwnerFunctionRow {
  key: SpaceFunctionKey
  label: string
  description: string
  planGated: boolean
  /** True only for a plan-gated function the plan does NOT grant (renders the upgrade nudge). */
  locked: boolean
  enabled: boolean
  minRole: SpaceRole
  defaultMinRole: SpaceRole
}

export function FeaturePanel({
  slug,
  rows,
  readOnly = false,
}: {
  slug: string
  rows: OwnerFunctionRow[]
  /** Staff preview: render the controls disabled (the write actions stay gated server-side anyway). */
  readOnly?: boolean
}) {
  const [state, setState] = useState<Record<string, { enabled: boolean; minRole: SpaceRole }>>(() => {
    const out: Record<string, { enabled: boolean; minRole: SpaceRole }> = {}
    for (const r of rows) out[r.key] = { enabled: r.enabled, minRole: r.minRole }
    return out
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function toggle(key: SpaceFunctionKey, enabled: boolean) {
    const prev = state[key]
    setState((s) => ({ ...s, [key]: { ...s[key], enabled } }))
    setError(null)
    setSavingKey(key)
    startTransition(async () => {
      try {
        const res = await setSpaceFeatureEnabled(slug, key, enabled)
        if (isError(res)) throw new Error(res.error)
      } catch (e) {
        setState((s) => ({ ...s, [key]: prev }))
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
        const res = await setSpaceFeatureMinRole(slug, key, minRole)
        if (isError(res)) throw new Error(res.error)
      } catch (e) {
        setState((s) => ({ ...s, [key]: prev }))
        setError(e instanceof Error ? e.message : 'Could not save.')
      } finally {
        setSavingKey(null)
      }
    })
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {rows.map((r) => {
        const cur = state[r.key]
        const isCustom = cur.minRole !== r.defaultMinRole
        return (
          <div
            key={r.key}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text">{r.label}</span>
                {isCustom && !r.locked && (
                  <span
                    title={`Default: ${ROLE_LABEL[r.defaultMinRole]}`}
                    className="inline-flex items-center gap-0.5 rounded-full bg-primary-bg px-1.5 py-0.5 text-xs font-semibold text-primary-strong"
                  >
                    <RotateCcw className="h-2.5 w-2.5" /> custom
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">{r.description}</p>
            </div>

            {r.locked ? (
              // Plan-gated function the plan lacks: a calm upgrade nudge, not a dead control.
              <Link
                href={`/spaces/${slug}/settings/billing`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-elevated/70"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden /> Upgrade to unlock
              </Link>
            ) : (
              <div className="flex shrink-0 items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-medium text-muted">
                  <input
                    type="checkbox"
                    aria-label={`${r.label}: enabled`}
                    checked={cur.enabled}
                    disabled={readOnly || savingKey === r.key}
                    onChange={(e) => toggle(r.key, e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-[var(--color-primary,#7a5c3a)] disabled:opacity-50"
                  />
                  On
                </label>
                <select
                  aria-label={`${r.label}: lowest role`}
                  value={cur.minRole}
                  disabled={readOnly || savingKey === r.key || !cur.enabled}
                  onChange={(e) => chooseRole(r.key, e.target.value as SpaceRole)}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-primary disabled:opacity-50"
                >
                  {SPACE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
