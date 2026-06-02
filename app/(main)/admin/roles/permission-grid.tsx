'use client'

import { useMemo, useState, useTransition } from 'react'
import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { NAV_AREAS, ACCESS_LEVELS, type NavAccess } from '@/lib/nav-areas'
import { ROLE_LABEL } from '@/lib/community-roles'
import { setAreaPermission } from './actions'

const LEVEL_LABEL: Record<NavAccess, string> = {
  visitor: 'Visitor',
  member: ROLE_LABEL.member,
  crew: ROLE_LABEL.crew,
  host: ROLE_LABEL.host,
  guide: ROLE_LABEL.guide,
  mentor: ROLE_LABEL.mentor,
  admin: ROLE_LABEL.admin,
  janitor: ROLE_LABEL.janitor,
}

// Group the areas by their section header, preserving declaration order.
function groupedAreas() {
  const groups: { section: string; keys: typeof NAV_AREAS[number][] }[] = []
  for (const area of NAV_AREAS) {
    const section = area.section ?? 'General'
    const last = groups[groups.length - 1]
    if (last && last.section === section) last.keys.push(area)
    else groups.push({ section, keys: [area] })
  }
  return groups
}

export function PermissionGrid({
  initial,
  defaults,
}: {
  /** Persisted overrides, area_key → level. */
  initial: Record<string, NavAccess>
  /** Code defaults, area_key → level (fallback when no override). */
  defaults: Record<string, NavAccess>
}) {
  // Effective current value per area = override ?? default.
  const [values, setValues] = useState<Record<string, NavAccess>>(() => {
    const out: Record<string, NavAccess> = {}
    for (const area of NAV_AREAS) out[area.key] = initial[area.key] ?? defaults[area.key]
    return out
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const groups = useMemo(() => groupedAreas(), [])

  function choose(areaKey: string, level: NavAccess) {
    if (values[areaKey] === level) return
    const prev = values[areaKey]
    setValues((v) => ({ ...v, [areaKey]: level }))
    setError(null)
    setSavingKey(areaKey)
    startTransition(async () => {
      try {
        await setAreaPermission(areaKey, level)
      } catch (e) {
        setValues((v) => ({ ...v, [areaKey]: prev })) // roll back on failure
        setError(e instanceof Error ? e.message : 'Could not save.')
      } finally {
        setSavingKey(null)
      }
    })
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
            <SlidersHorizontal className="h-4 w-4 text-primary-strong" />
            Area permissions
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Set the lowest role that can use each area. Everyone below sees it muted in their menu.
            Changes save instantly and apply on each member’s next page load.
          </p>
        </div>
      </div>

      {error && <p className="px-4 pt-3 text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto p-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-xs font-semibold text-subtle">
                Area
              </th>
              {ACCESS_LEVELS.map((lvl) => (
                <th key={lvl} className="px-2 py-2 text-center text-[11px] font-semibold text-muted">
                  {LEVEL_LABEL[lvl]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GroupRows
                key={group.section}
                section={group.section}
                areas={group.keys}
                values={values}
                defaults={defaults}
                savingKey={savingKey}
                onChoose={choose}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function GroupRows({
  section,
  areas,
  values,
  defaults,
  savingKey,
  onChoose,
}: {
  section: string
  areas: typeof NAV_AREAS[number][]
  values: Record<string, NavAccess>
  defaults: Record<string, NavAccess>
  savingKey: string | null
  onChoose: (key: string, level: NavAccess) => void
}) {
  return (
    <>
      <tr>
        <td
          colSpan={ACCESS_LEVELS.length + 1}
          className="bg-surface-elevated px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle"
        >
          {section}
        </td>
      </tr>
      {areas.map((area) => {
        const current = values[area.key]
        const isDefault = current === defaults[area.key]
        return (
          <tr key={area.key} className="border-t border-border">
            <th
              scope="row"
              className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-text"
            >
              <span className="flex items-center gap-2">
                {area.label}
                {!isDefault && (
                  <span
                    title={`Default: ${LEVEL_LABEL[defaults[area.key]]}`}
                    className="inline-flex items-center gap-0.5 rounded-full bg-primary-bg px-1.5 py-0.5 text-[9px] font-semibold text-primary-strong"
                  >
                    <RotateCcw className="h-2.5 w-2.5" /> custom
                  </span>
                )}
              </span>
            </th>
            {ACCESS_LEVELS.map((lvl) => (
              <td key={lvl} className="px-2 py-2 text-center">
                <input
                  type="radio"
                  name={`area-${area.key}`}
                  aria-label={`${area.label}: ${LEVEL_LABEL[lvl]}`}
                  checked={current === lvl}
                  disabled={savingKey === area.key}
                  onChange={() => onChoose(area.key, lvl)}
                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-primary,#7a5c3a)] disabled:opacity-50"
                />
              </td>
            ))}
          </tr>
        )
      })}
    </>
  )
}
