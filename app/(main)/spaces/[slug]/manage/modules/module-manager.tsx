'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronUp, ChevronDown, Eye, EyeOff, Lock } from 'lucide-react'
import { isError } from '@/lib/action-result'
import {
  spaceModuleById,
  SPACE_MODULE_FAMILY_ORDER,
  SPACE_MODULE_FAMILY_LABEL,
  type SpaceModuleFamily,
} from '@/lib/admin/modules/space-modules'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import { SectionHeader } from '@/components/ui/section-header'
import { Switch } from '@/components/ui/switch'
import { setSpaceFeatureEnabled } from '../../settings/features/actions'
import { saveSpaceModuleMenu } from './actions'

// The Module Manager grid (ADR-546, docs/MODULAR-MENU.md — P3, client). The owner turns each SERVICE
// feature on or off, reorders the modules in their menu, and hides the ones they do not use. Three writes,
// each optimistic with rollback, all gated owner/admin server-side:
//   • feature ON/OFF   -> setSpaceFeatureEnabled (spaces.entitlements; the shipped Phase-G path).
//   • reorder / hide    -> saveSpaceModuleMenu (spaces.preferences.moduleMenu).
// The shell config surfaces (Identity / Info / Page / Settings), Danger, and this Module Manager itself are
// never toggleable or hideable (hard-disabled) so the owner can never strand themselves. Rows group by
// family; reorder moves a module within its family only (families stay coherent in the menu). Plain owner
// copy, no em dashes (CONTENT-VOICE); DAWN tokens only.

/** The three-tier band a module sits in, shown as a small badge. */
type ModuleTier = 'standard' | 'primary' | 'extra'

const TIER_LABEL: Record<ModuleTier, string> = {
  standard: 'Always shown',
  primary: 'Main menu',
  extra: 'Under More',
}

/** One module row, seeded server-side (serializable — no Icons; the client looks each Icon up by id). */
export interface ModuleManagerRow {
  id: string
  label: string
  desc: string
  family: SpaceModuleFamily
  tier: ModuleTier
  /** The feature this module toggles, or null for a shell module with no on/off. */
  featureKey: SpaceFunctionKey | null
  /** Current on/off (default-on). Only meaningful when featureKey is set. */
  enabled: boolean
  /** A plan-gated feature the plan does not grant yet: the toggle is locked with an upgrade nudge. */
  locked: boolean
  /** Whether this module may be hidden from the menu (false for shell / Danger / Module Manager). */
  hideable: boolean
  /** Whether the owner has currently hidden it. */
  hidden: boolean
}

export function ModuleManager({
  slug,
  rows,
  readOnly = false,
}: {
  slug: string
  /** Every catalog module, in the owner's current menu order. */
  rows: ModuleManagerRow[]
  /** Staff preview / editor: render every control disabled (the writes stay gated server-side anyway). */
  readOnly?: boolean
}) {
  const [ids, setIds] = useState<string[]>(() => rows.map((r) => r.id))
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    for (const r of rows) out[r.id] = r.enabled
    return out
  })
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(rows.filter((r) => r.hidden).map((r) => r.id)))
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const rowById = new Map(rows.map((r) => [r.id, r]))

  /** Persist the current order + hidden set; roll the whole client state back on failure. */
  function persistMenu(nextIds: string[], nextHidden: Set<string>, prev: { ids: string[]; hidden: Set<string> }) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await saveSpaceModuleMenu(slug, { order: nextIds, hidden: [...nextHidden] })
        if (isError(res)) throw new Error(res.error)
      } catch (e) {
        setIds(prev.ids)
        setHidden(prev.hidden)
        setError(e instanceof Error ? e.message : 'Could not save your menu.')
      }
    })
  }

  function move(id: string, dir: -1 | 1) {
    const i = ids.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    // Only reorder within the same family (families stay coherent in the menu).
    if (rowById.get(ids[j])?.family !== rowById.get(id)?.family) return
    const prev = { ids, hidden }
    const next = ids.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setIds(next)
    persistMenu(next, hidden, prev)
  }

  function toggleHidden(id: string) {
    const prev = { ids, hidden }
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setHidden(next)
    persistMenu(ids, next, prev)
  }

  function toggleFeature(id: string, key: SpaceFunctionKey, on: boolean) {
    const prev = enabled[id]
    setEnabled((s) => ({ ...s, [id]: on }))
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        const res = await setSpaceFeatureEnabled(slug, key, on)
        if (isError(res)) throw new Error(res.error)
      } catch (e) {
        setEnabled((s) => ({ ...s, [id]: prev }))
        setError(e instanceof Error ? e.message : 'Could not save that change.')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {SPACE_MODULE_FAMILY_ORDER.map((family) => {
        const familyIds = ids.filter((id) => rowById.get(id)?.family === family)
        if (familyIds.length === 0) return null
        return (
          <section key={family} className="space-y-2">
            <SectionHeader title={SPACE_MODULE_FAMILY_LABEL[family]} />
            <ul className="space-y-2">
              {familyIds.map((id, idx) => {
                const row = rowById.get(id)
                if (!row) return null
                const Icon = spaceModuleById(id)?.Icon
                const isHidden = hidden.has(id)
                const isOn = enabled[id]
                const canMoveUp = idx > 0
                const canMoveDown = idx < familyIds.length - 1
                return (
                  <li
                    key={id}
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                        {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-text">{row.label}</span>
                          <span className="inline-flex items-center rounded-full bg-surface-elevated px-1.5 py-0.5 text-2xs font-semibold text-muted">
                            {TIER_LABEL[row.tier]}
                          </span>
                          {isHidden && (
                            <span className="inline-flex items-center rounded-full bg-surface-elevated px-1.5 py-0.5 text-2xs font-semibold text-subtle">
                              Hidden
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted">{row.desc}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-1.5">
                      {/* Reorder within the family */}
                      <div className="flex items-center">
                        <button
                          type="button"
                          aria-label={`Move ${row.label} up`}
                          disabled={readOnly || !canMoveUp}
                          onClick={() => move(id, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-l-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-elevated disabled:opacity-40 motion-reduce:transition-none"
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${row.label} down`}
                          disabled={readOnly || !canMoveDown}
                          onClick={() => move(id, 1)}
                          className="-ml-px flex h-7 w-7 items-center justify-center rounded-r-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-elevated disabled:opacity-40 motion-reduce:transition-none"
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        </button>
                      </div>

                      {/* Hide from menu */}
                      <button
                        type="button"
                        aria-pressed={isHidden}
                        aria-label={isHidden ? `Show ${row.label} in the menu` : `Hide ${row.label} from the menu`}
                        title={row.hideable ? undefined : 'This part of your space is always shown.'}
                        disabled={readOnly || !row.hideable}
                        onClick={() => toggleHidden(id)}
                        className="flex h-7 items-center gap-1 rounded-lg border border-border bg-surface px-2 text-2xs font-semibold text-muted transition-colors hover:bg-surface-elevated disabled:opacity-40 motion-reduce:transition-none"
                      >
                        {isHidden ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                        {isHidden ? 'Hidden' : 'Shown'}
                      </button>

                      {/* Feature on/off (services only; shell modules have no featureKey) */}
                      {row.featureKey ? (
                        row.locked ? (
                          <Link
                            href={`/spaces/${slug}/settings/billing`}
                            className="flex h-7 items-center gap-1 rounded-lg bg-surface-elevated px-2 text-2xs font-semibold text-muted hover:bg-surface-elevated/70"
                          >
                            <Lock className="h-3.5 w-3.5" aria-hidden /> Upgrade
                          </Link>
                        ) : (
                          <Switch
                            checked={isOn}
                            aria-label={`${row.label}: turn ${isOn ? 'off' : 'on'}`}
                            disabled={readOnly || busyId === id}
                            onCheckedChange={(on) => toggleFeature(id, row.featureKey as SpaceFunctionKey, on)}
                          />
                        )
                      ) : (
                        <span className="flex h-7 items-center rounded-lg px-2 text-2xs font-medium text-subtle">
                          Always on
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
