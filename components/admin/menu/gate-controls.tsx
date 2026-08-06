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
import { registryGateFor } from '@/lib/menus/gates'
import { ACCESS_ORDER, ACCESS_LABEL } from './known-routes'

// Shared visibility gate editor (ADR-390) for a menu link OR a category. Two axes,
// matching the admin nav's gate exactly:
//   • min access — the lowest role on the trust/staff ladder that may SEE this element.
//   • staff capability — an optional staff DOMAIN (+ level) that ALSO unlocks it, so a
//     functional operator (e.g. a Marketer whose community token is just 'member') still
//     sees their surfaces. Unioned at render time by canSeeMenuEl.
// The per-role matrix (role_modes) remains a separate, finer override layer.
//
// 🔴 FOR A PAGE THE CODE REGISTRY KNOWS, THESE SELECTS ARE NOT THE GATE (owner decision
// 2026-08-06; docs/MENU-AUDIT-2026-08-06.md §4.2-§4.4). `applyRegistryGates` re-derives
// permissions from lib/nav/registry.ts at read time, so a stored value here would be
// overwritten before any renderer saw it. Showing three live-looking dropdowns that decide
// nothing is worse than showing none: it is how the live rail came to have an Admin row
// seeded at 'visitor' and six admin rows with their staff domain deleted.
//
// So a KNOWN href renders the registry's gate READ-ONLY, and says where it comes from. An
// UNKNOWN href — an operator-added page the registry never declared — keeps the real editors,
// because there its stored gate genuinely is the gate. That is the honest split, and it is the
// same split the resolver makes.

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
  href,
  minAccess,
  staffDomain,
  staffLevel,
  disabled,
  onSave,
}: {
  /** The element's destination. When the registry declares it, permissions are inherited
   *  from code and this renders read-only. Omitted (a category, which has no href of its
   *  own) keeps the editors. */
  href?: string
  minAccess?: MenuAccess
  staffDomain?: StaffDomain
  staffLevel?: Access
  disabled?: boolean
  onSave: (patch: GatePatch) => void
}) {
  const inherited = href ? registryGateFor(href) : null

  if (inherited) {
    return (
      <div className="rounded-lg border border-border bg-surface/50 p-3">
        <p className="text-meta font-semibold text-subtle">Permissions</p>
        <p className="mt-1 text-body-sm text-text">
          {ACCESS_LABEL[inherited.minAccess] ?? inherited.minAccess} and above
          {inherited.staffDomain ? (
            <>
              , or {STAFF_DOMAIN_LABEL[inherited.staffDomain]} staff
              {inherited.staffLevel === 'write' ? ' with write access' : ''}
            </>
          ) : null}
          {inherited.requiresOperatedSpaces ? ', and only for people who run a Space' : ''}.
        </p>
        <p className="mt-1.5 text-2xs leading-relaxed text-muted">
          Set in code, not here, so this page and its menu link can never disagree. Change it in
          the navigation registry. You can still rename this link, move it, give it a different
          icon, or switch it off.
        </p>
      </div>
    )
  }

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
