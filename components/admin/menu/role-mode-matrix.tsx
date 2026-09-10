'use client'

import type { MenuMode } from '@/lib/menus/types'
import { Radio } from '@/components/ui/radio'
import { MODE_LABEL, MODE_ORDER, MODE_SHORT, ROLE_ORDER, ACCESS_LABEL } from './known-routes'

// A compact per-role mode matrix: for each role (visitor … janitor) choose how the
// element presents (Active / Ghost / Hidden), overriding the element's on/off base mode
// for that role only. Used by items and rail cards. An absent role entry means "follow
// the on/off toggle", so we render a leading "Default" choice that clears the override.
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
      <legend className="mb-1 text-meta font-semibold text-subtle">{legend}</legend>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th scope="col" className="px-2.5 py-1.5 text-left text-meta font-semibold text-muted">
                Role
              </th>
              <th
                scope="col"
                title="Follow the on/off toggle for this role"
                className="px-2 py-1.5 text-center text-meta font-semibold text-muted"
              >
                Default
              </th>
              {MODE_ORDER.map((m) => (
                <th
                  key={m}
                  scope="col"
                  title={MODE_LABEL[m]}
                  className="px-2 py-1.5 text-center text-meta font-semibold text-muted"
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
                    {/* The kit's Radio (components/ui/radio.tsx), in place of a hand-rolled 14px
                        `accent-primary` input. The ring, the fill, the disabled fade and the
                        `tap-target` floor come from the primitive. */}
                    <Radio
                      name={name}
                      aria-label={`${ACCESS_LABEL[role]}: default (follow on/off)`}
                      title="Default (follow on/off)"
                      checked={current == null}
                      disabled={disabled}
                      onChange={() => setRole(role, null)}
                      className="cursor-pointer"
                    />
                  </td>
                  {MODE_ORDER.map((m) => (
                    <td key={m} className="px-2 py-1.5 text-center">
                      <Radio
                        name={name}
                        aria-label={`${ACCESS_LABEL[role]}: ${MODE_LABEL[m]}`}
                        title={`${MODE_SHORT[m]} (${MODE_LABEL[m]})`}
                        checked={current === m}
                        disabled={disabled}
                        onChange={() => setRole(role, m)}
                        className="cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-meta text-subtle">
        Leave a role on Default to follow the on/off toggle. Active shows it, Ghost previews
        it as an upsell, Hidden removes it for that role only.
      </p>
    </fieldset>
  )
}
