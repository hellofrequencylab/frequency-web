'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronUp, ChevronDown, Eye, EyeOff, Lock, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { Dialog } from '@/components/ui/dialog'
import {
  spaceModuleById,
  SPACE_MODULE_FAMILY_ORDER,
  SPACE_MODULE_FAMILY_LABEL,
  type SpaceModuleFamily,
} from '@/lib/admin/modules/space-modules'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import { SPACE_ROLES, type SpaceRole } from '@/lib/spaces/membership'
import { SectionHeader } from '@/components/ui/section-header'
import { Switch } from '@/components/ui/switch'
import { setSpaceFeatureEnabled, setSpaceFeatureMinRole, saveSpaceModuleMenu } from './actions'

// The Module Manager grid (ADR-546, docs/MODULAR-MENU.md — P3, client). The ONE place an owner manages
// their menu + features (ADR-552 Phase 4 folded the retired settings/features surface in here). Each row
// owns every control that module has, all optimistic with rollback and all gated owner/admin server-side:
//   • feature ON/OFF   -> setSpaceFeatureEnabled (spaces.entitlements).
//   • lowest role       -> setSpaceFeatureMinRole (spaces.feature_roles) — who on the team can use it.
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

/** The member-facing label for each role in the "lowest role" picker. */
const ROLE_LABEL: Record<SpaceRole, string> = {
  viewer: 'Member',
  editor: 'Editor',
  moderator: 'Moderator',
  admin: 'Admin',
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
  /** The lowest role that may use this module's function (only meaningful when featureKey is set). */
  minRole: SpaceRole
  /** The code-default lowest role, for the "custom" hint + the sparse reset. */
  defaultMinRole: SpaceRole
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
  const [minRole, setMinRole] = useState<Record<string, SpaceRole>>(() => {
    const out: Record<string, SpaceRole> = {}
    for (const r of rows) out[r.id] = r.minRole
    return out
  })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  // The one module whose OFF direction needs a confirm (reviews): the row we are asking about, or null.
  const [confirmOff, setConfirmOff] = useState<{ id: string; key: SpaceFunctionKey; label: string } | null>(null)

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

  // The actual write: optimistic flip, server call, rollback + error on failure. Returns a promise so the
  // confirm dialog can await it and show pending; the plain Switch path fires it inside a transition.
  async function runFeatureToggle(id: string, key: SpaceFunctionKey, on: boolean): Promise<void> {
    const prev = enabled[id]
    setEnabled((s) => ({ ...s, [id]: on }))
    setError(null)
    setBusyId(id)
    try {
      const res = await setSpaceFeatureEnabled(slug, key, on)
      if (isError(res)) throw new Error(res.error)
    } catch (e) {
      setEnabled((s) => ({ ...s, [id]: prev }))
      setError(e instanceof Error ? e.message : 'Could not save that change.')
    } finally {
      setBusyId(null)
    }
  }

  function toggleFeature(id: string, key: SpaceFunctionKey, on: boolean) {
    // Turning Reviews OFF is the one destructive-feeling toggle: confirm it first (turning it back ON, and
    // every other module, stays instant). We intercept only the OFF direction of the reviews row.
    if (!on && id === 'space.reviews') {
      const row = rowById.get(id)
      setConfirmOff({ id, key, label: row?.label ?? 'Reviews' })
      return
    }
    startTransition(() => {
      void runFeatureToggle(id, key, on)
    })
  }

  function chooseRole(id: string, key: SpaceFunctionKey, role: SpaceRole) {
    const prev = minRole[id]
    if (prev === role) return
    setMinRole((s) => ({ ...s, [id]: role }))
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        const res = await setSpaceFeatureMinRole(slug, key, role)
        if (isError(res)) throw new Error(res.error)
      } catch (e) {
        setMinRole((s) => ({ ...s, [id]: prev }))
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

                      {/* Feature on/off + lowest role (services only; shell modules have no featureKey) */}
                      {row.featureKey ? (
                        row.locked ? (
                          <Link
                            href={`/spaces/${slug}/settings/billing`}
                            className="flex h-7 items-center gap-1 rounded-lg bg-surface-elevated px-2 text-2xs font-semibold text-muted hover:bg-surface-elevated/70"
                          >
                            <Lock className="h-3.5 w-3.5" aria-hidden /> Move up a plan
                          </Link>
                        ) : (
                          <>
                            {/* Lowest role that may use this module (owner tunes team access here). */}
                            <select
                              aria-label={`${row.label}: lowest role`}
                              value={minRole[id]}
                              disabled={readOnly || busyId === id || !isOn}
                              onChange={(e) =>
                                chooseRole(id, row.featureKey as SpaceFunctionKey, e.target.value as SpaceRole)
                              }
                              className="h-7 rounded-lg border border-border bg-surface px-1.5 text-2xs text-text outline-none focus:border-primary disabled:opacity-40"
                            >
                              {SPACE_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABEL[role]}
                                </option>
                              ))}
                            </select>
                            <Switch
                              checked={isOn}
                              aria-label={`${row.label}: turn ${isOn ? 'off' : 'on'}`}
                              disabled={readOnly || busyId === id}
                              onCheckedChange={(on) => toggleFeature(id, row.featureKey as SpaceFunctionKey, on)}
                            />
                          </>
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

      {confirmOff && (
        <ReviewsOffDialog
          label={confirmOff.label}
          onKeepOn={() => setConfirmOff(null)}
          onConfirm={async () => {
            await runFeatureToggle(confirmOff.id, confirmOff.key, false)
            setConfirmOff(null)
          }}
        />
      )}
    </div>
  )
}

// The confirm shown before Reviews is turned OFF. The primary action keeps reviews on; a quieter secondary
// action confirms the turn-off with a pending state so a stray double-tap cannot fire it twice. On-voice,
// no em dashes (CONTENT-VOICE), DAWN tokens only.
function ReviewsOffDialog({
  label,
  onKeepOn,
  onConfirm,
}: {
  label: string
  onKeepOn: () => void
  onConfirm: () => Promise<void>
}) {
  const [pending, startTransition] = useTransition()
  return (
    <Dialog
      open
      onClose={pending ? () => {} : onKeepOn}
      ariaLabel="Are you sure you want to turn reviews off?"
      className="max-w-sm"
    >
      <div className="relative w-full rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <h2 className="text-base font-bold leading-tight text-text">Are you sure?</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Reviews build trust with new members. We recommend keeping them on. Turning {label.toLowerCase()} off
          hides the rating and review wall from your profile until you turn it back on.
        </p>

        {/* The primary action keeps reviews on. */}
        <button
          type="button"
          onClick={onKeepOn}
          disabled={pending}
          className="mt-5 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-70"
        >
          Keep reviews on
        </button>

        {/* The quieter confirm. Pending state so a stray double-tap cannot fire it twice. */}
        <button
          type="button"
          onClick={() => startTransition(() => void onConfirm())}
          disabled={pending}
          aria-busy={pending}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-medium text-subtle transition-colors hover:text-danger disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Turning reviews off…
            </>
          ) : (
            'Turn reviews off'
          )}
        </button>
      </div>
    </Dialog>
  )
}
