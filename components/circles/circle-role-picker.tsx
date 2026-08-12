'use client'

import { useState, useTransition } from 'react'
import { Select } from '@/components/ui/select'
import { setCircleMemberRole } from '@/app/(main)/circles/[slug]/(circle)/members/actions'
import {
  ASSIGNABLE_CIRCLE_ROLES,
  CIRCLE_ROLE_LABEL,
  type AssignableCircleRole,
} from '@/lib/core/circle-roles'

// The role control, ON THE PERSON'S ROW (ADR-1014).
//
// 🔴 NOT A PERMISSIONS MATRIX. A grid of capabilities against roles is an operator's mental
// model, not a Host's: the Host is looking at Ada and deciding what Ada does here. So the
// control is three named presets on Ada's card, and the matrix is the read-only disclosure
// underneath the roster (`CircleRoleLegend`), where it explains rather than asks.
//
// It rides the EntityCard `footer` slot, which sits OUTSIDE the card's profile link — a
// <select> nested in an <a> is not a control, it is a broken one.
//
// The picker is an affordance. `setCircleMemberRole` re-resolves `circle.manageRoles` from
// the live circle on every call and refuses the Host's own row, so nothing here is trusted.

export function CircleRolePicker({
  circleId,
  profileId,
  personName,
  role,
}: {
  circleId: string
  profileId: string
  /** Names the control for a screen reader: "Role for Ada Lovelace". */
  personName: string
  role: AssignableCircleRole
}) {
  const [current, setCurrent] = useState<AssignableCircleRole>(role)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function change(next: AssignableCircleRole) {
    const previous = current
    setError(null)
    setCurrent(next)
    startTransition(async () => {
      const result = await setCircleMemberRole(circleId, profileId, next)
      if ('error' in result) {
        // Put the control back where it was. A picker that keeps showing a role the server
        // refused is a lie the Host would only find out about later.
        setCurrent(previous)
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-1.5">
      <Select
        aria-label={`Role for ${personName}`}
        value={current}
        disabled={pending}
        wrapperClassName="inline-block w-max max-w-full"
        className="text-meta"
        onChange={(e) => change(e.target.value as AssignableCircleRole)}
        options={ASSIGNABLE_CIRCLE_ROLES.map((r) => ({ value: r, label: CIRCLE_ROLE_LABEL[r] }))}
      />
      {error && (
        <p role="status" className="text-meta text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
