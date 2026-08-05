'use client'

import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import type { MenuAccess } from '@/lib/menus/types'
import {
  STAFF_DOMAINS,
  STAFF_DOMAIN_LABEL,
  ACCESS_LEVELS,
  type StaffDomain,
  type Access,
} from '@/lib/core/staff-roles'
import { ACCESS_ORDER, ACCESS_LABEL } from './known-routes'

// Shared visibility gate editor (ADR-390) for a menu link OR a category. Two axes,
// matching the admin nav's gate exactly:
//   • min access — the lowest role on the trust/staff ladder that may SEE this element.
//   • staff capability — an optional staff DOMAIN (+ level) that ALSO unlocks it, so a
//     functional operator (e.g. a Marketer whose community token is just 'member') still
//     sees their surfaces. Unioned at render time by canSeeMenuEl.
// The per-role matrix (role_modes) remains a separate, finer override layer.

export type GatePatch = {
  minAccess?: MenuAccess
  staffDomain?: StaffDomain | null
  staffLevel?: Access | null
}

const STAFF_LEVEL_LABEL: Record<Access, string> = {
  none: 'None',
  read: 'Read',
  write: 'Write',
}

export function GateControls({
  minAccess,
  staffDomain,
  staffLevel,
  disabled,
  onSave,
}: {
  minAccess?: MenuAccess
  staffDomain?: StaffDomain
  staffLevel?: Access
  disabled?: boolean
  onSave: (patch: GatePatch) => void
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface/50 p-3 sm:grid-cols-3">
      {/* Field, not a bare <label> + sibling <select>: the three labels here carried no
          `htmlFor` and the selects no `id`, so none of them named its control. */}
      <Field label="Minimum access" className="min-w-0" labelClassName="font-semibold text-subtle">
        <Select
          value={minAccess ?? 'visitor'}
          disabled={disabled}
          onChange={(e) => onSave({ minAccess: e.target.value as MenuAccess })}
        >
          {ACCESS_ORDER.map((a) => (
            <option key={a} value={a}>
              {ACCESS_LABEL[a]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Staff domain" className="min-w-0" labelClassName="font-semibold text-subtle">
        <Select
          value={staffDomain ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value
            // Clearing the domain clears the level too; setting one defaults level to write.
            if (!next) onSave({ staffDomain: null, staffLevel: null })
            else onSave({ staffDomain: next as StaffDomain, staffLevel: staffLevel ?? 'write' })
          }}
          emptyLabel="None"
        >
          {STAFF_DOMAINS.map((d) => (
            <option key={d} value={d}>
              {STAFF_DOMAIN_LABEL[d]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Staff level" className="min-w-0" labelClassName="font-semibold text-subtle">
        <Select
          value={staffLevel ?? 'write'}
          disabled={disabled || !staffDomain}
          onChange={(e) => onSave({ staffLevel: e.target.value as Access })}
        >
          {ACCESS_LEVELS.map((l) => (
            <option key={l} value={l}>
              {STAFF_LEVEL_LABEL[l]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}
