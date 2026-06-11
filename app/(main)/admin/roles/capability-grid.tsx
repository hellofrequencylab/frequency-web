'use client'

import { useState, useTransition } from 'react'
import { Grid3x3, RotateCcw } from 'lucide-react'
import {
  STAFF_ROLES,
  STAFF_DOMAINS,
  ACCESS_LEVELS,
  STAFF_ROLE_LABEL,
  STAFF_DOMAIN_LABEL,
  type Access,
  type StaffDomain,
  type StaffRole,
} from '@/lib/core/staff-roles'
import { setCapabilityPermission } from './actions'

const ACCESS_LABEL: Record<Access, string> = {
  none: 'No access',
  read: 'Read',
  write: 'Write',
}
// Short cell glyphs (semantic tokens only — no hardcoded hex).
const ACCESS_GLYPH: Record<Access, string> = { none: '—', read: 'R', write: 'W' }

// Cycle a cell forward through none → read → write → none on click.
function nextAccess(a: Access): Access {
  const i = ACCESS_LEVELS.indexOf(a)
  return ACCESS_LEVELS[(i + 1) % ACCESS_LEVELS.length]
}

function cellClasses(a: Access, isDefault: boolean): string {
  const base = 'inline-flex h-7 w-9 items-center justify-center rounded-md text-xs font-bold tabular-nums transition-colors disabled:opacity-50'
  const tone =
    a === 'write'
      ? 'bg-success-bg text-success'
      : a === 'read'
        ? 'bg-primary-bg text-primary-strong'
        : 'bg-surface-elevated text-subtle'
  const ring = isDefault ? '' : ' ring-1 ring-inset ring-border-strong'
  return `${base} ${tone}${ring}`
}

/**
 * The per-FUNCTION permission grid (P1.7, ADR-222). Rows = capability domains,
 * columns = staff roles. Each cell shows the EFFECTIVE access (override ?? code
 * default); clicking cycles none → read → write and saves instantly. A cell that
 * differs from its code default is ringed and tagged "custom". Janitor-only — this
 * panel is only rendered for the janitor on /admin/roles.
 */
export function CapabilityGrid({
  defaults,
  initial,
}: {
  /** Code defaults: role → domain → access (the ADR-127 CAPS matrix). */
  defaults: Record<StaffRole, Record<StaffDomain, Access>>
  /** Persisted overrides: role → domain → access (sparse). */
  initial: Partial<Record<StaffRole, Partial<Record<StaffDomain, Access>>>>
}) {
  // Effective value per (role, domain) = override ?? default.
  const [values, setValues] = useState<Record<string, Access>>(() => {
    const out: Record<string, Access> = {}
    for (const role of STAFF_ROLES) {
      for (const domain of STAFF_DOMAINS) {
        out[`${role}:${domain}`] = initial[role]?.[domain] ?? defaults[role][domain]
      }
    }
    return out
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function cycle(role: StaffRole, domain: StaffDomain) {
    const key = `${role}:${domain}`
    const prev = values[key]
    const next = nextAccess(prev)
    setValues((v) => ({ ...v, [key]: next }))
    setError(null)
    setSavingKey(key)
    startTransition(async () => {
      try {
        await setCapabilityPermission(role, domain, next)
      } catch (e) {
        setValues((v) => ({ ...v, [key]: prev })) // roll back on failure
        setError(e instanceof Error ? e.message : 'Could not save.')
      } finally {
        setSavingKey(null)
      }
    })
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <Grid3x3 className="h-4 w-4 text-primary-strong" />
          Per-function permissions
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Grant or deny each staff role at the capability level — finer than the route grid above.
          Click a cell to cycle No access → Read → Write. A ringed cell differs from its default;
          set it back to default to clear the override. Changes save instantly.
        </p>
      </div>

      {error && <p className="px-4 pt-3 text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto p-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-xs font-semibold text-subtle">
                Capability
              </th>
              {STAFF_ROLES.map((role) => (
                <th key={role} className="px-2 py-2 text-center text-xs font-semibold text-muted">
                  {STAFF_ROLE_LABEL[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAFF_DOMAINS.map((domain) => (
              <tr key={domain} className="border-t border-border">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-text"
                >
                  {STAFF_DOMAIN_LABEL[domain]}
                </th>
                {STAFF_ROLES.map((role) => {
                  const key = `${role}:${domain}`
                  const current = values[key]
                  const isDefault = current === defaults[role][domain]
                  return (
                    <td key={role} className="px-1.5 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => cycle(role, domain)}
                        disabled={savingKey === key}
                        aria-label={`${STAFF_ROLE_LABEL[role]} · ${STAFF_DOMAIN_LABEL[domain]}: ${ACCESS_LABEL[current]}${isDefault ? '' : ' (custom)'}`}
                        title={`${ACCESS_LABEL[current]}${isDefault ? '' : ` — default: ${ACCESS_LABEL[defaults[role][domain]]}`}`}
                        className={cellClasses(current, isDefault)}
                      >
                        {isDefault ? (
                          ACCESS_GLYPH[current]
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <RotateCcw className="h-2.5 w-2.5" />
                            {ACCESS_GLYPH[current]}
                          </span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
