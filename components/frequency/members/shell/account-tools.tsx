'use client'

import { useState, useTransition } from 'react'
import { setOperatorContext } from '@/app/(main)/context-actions'
import { setViewAsRole } from '@/app/(main)/view-as-actions'
import { serializeContext, type AvailableContext, type OperatorContext } from '@/lib/context/operator-context'
import { ROLE_HIERARCHY, roleRank } from '@/lib/core/roles'
import { ROLE_LABEL, type CommunityRole } from '@/lib/community-roles'
import { roleUnlocked } from '@/lib/unlocks'
import { Select } from '@/components/ui/select'
import { DemoToggle } from '@/components/layout/demo-toggle'

export interface AccountToolsProps {
  realRole: CommunityRole
  currentRole: CommunityRole
  previewVisitor: boolean
  context: OperatorContext
  available: AvailableContext[]
  demoHidden: boolean
}

/** The active account sheet owns these controls. Native selects keep keyboard
 * focus inside its modal; the server actions independently re-check authority. */
export function AccountTools({ realRole, currentRole, previewVisitor, context, available, demoHidden }: AccountToolsProps) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return <div className="fqm-acct-g">
    <span className="k">Your view</span>
    {available.length > 1 && <label className="fqm-acct-row">
      <span>Operating as</span>
      <Select wrapperClassName="min-w-0 flex-1" className="text-body-sm" aria-label="Operating as" value={serializeContext(context)} disabled={pending} onChange={event => {
        const target = event.currentTarget.value
        setError(null)
        start(async () => {
          try { const result = await setOperatorContext(target); window.location.assign(result.href) }
          catch { setError('Could not change your identity. Try again.') }
        })
      }}>
        {available.map(option => <option key={serializeContext(option)} value={serializeContext(option)}>{option.label}</option>)}
      </Select>
    </label>}
    {roleUnlocked('view-as', realRole) && <label className="fqm-acct-row">
      <span>View as role</span>
      <Select wrapperClassName="min-w-0 flex-1" className="text-body-sm" aria-label="View as role" value={previewVisitor ? 'visitor' : currentRole} disabled={pending} onChange={event => {
        const target = event.currentTarget.value as CommunityRole | 'visitor'
        setError(null)
        start(async () => {
          try { await setViewAsRole(target === realRole ? null : target); window.location.reload() }
          catch { setError('Could not change your preview. Try again.') }
        })
      }}>
        {ROLE_HIERARCHY.filter(role => roleRank(role) <= roleRank(realRole)).map(role => <option key={role} value={role}>{ROLE_LABEL[role]}{role === realRole ? ' (you)' : ''}</option>)}
        <option value="visitor">Visitor</option>
      </Select>
    </label>}
    {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
    <DemoToggle initialHidden={demoHidden} variant="sheet" />
  </div>
}
