'use client'

import type { MenuMode } from '@/lib/menus/types'
import { MODE_LABEL, MODE_ORDER, MODE_SHORT, ROLE_ORDER, ACCESS_LABEL } from './known-routes'

// A compact per-role mode matrix: for each role (visitor … janitor) choose how the
// element presents (Active / Ghost / Hidden), overriding the element's default mode
// for that role only. Used by items (requirement 8) and rail cards (requirement 10).
// An absent role entry means "fall back to the default mode", so we render a fourth
// "Default" choice that clears the override.
export function RoleModeMatrix({
  roleModes,
  onChange,
  disabled,
  legend = 'Per-role presentation',
}: {
  roleModes: Record<string, MenuMode>
  onChange: (next: Record<string, MenuMode>) => void
  disabled?: boolean
  legend?: string
}) {
  function setRole(role: string, mode: MenuMode | null) {
    const next = { ...roleModes }
    if (mode == null) delete next[role]
    else next[role] = mode
    onChange(next)
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-semibold text-subtle">{legend}</legend>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th scope="col" className="px-2.5 py-1.5 text-left text-xs font-semibold text-muted">
                Role
              </th>
              <th scope="col" className="px-2 py-1.5 text-center text-xs font-semibold text-muted">
                Default
              </th>
              {MODE_ORDER.map((m) => (
                <th
                  key={m}
                  scope="col"
                  title={MODE_LABEL[m]}
                  className="px-2 py-1.5 text-center text-xs font-semibold text-muted"
                >
                  {MODE_LABEL[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_ORDER.map((role) => {
              const current = roleModes[role]
              const name = `rolemode-${role}`
              return (
                <tr key={role} className="border-t border-border">
                  <th scope="row" className="px-2.5 py-1.5 text-left font-medium text-text">
                    {ACCESS_LABEL[role]}
                  </th>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="radio"
                      name={name}
                      aria-label={`${ACCESS_LABEL[role]}: default`}
                      checked={current == null}
                      disabled={disabled}
                      onChange={() => setRole(role, null)}
                      className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:opacity-50"
                    />
                  </td>
                  {MODE_ORDER.map((m) => (
                    <td key={m} className="px-2 py-1.5 text-center">
                      <input
                        type="radio"
                        name={name}
                        aria-label={`${ACCESS_LABEL[role]}: ${MODE_LABEL[m]}`}
                        title={`${MODE_SHORT[m]} (${MODE_LABEL[m]})`}
                        checked={current === m}
                        disabled={disabled}
                        onChange={() => setRole(role, m)}
                        className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:opacity-50"
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  )
}
