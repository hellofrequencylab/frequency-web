import { spaceFunctionAvailable } from '@/lib/spaces/functions'

/** Metadata is loaded by the existing privileged Circle store, never by this pure gate. */
export interface CircleParentSpace {
  id: string
  status: string | null
  visibility: string | null
  owner_profile_id: string | null
  entitlements: unknown
}

type ParentCapabilities = { role: string | null; canEditProfile: boolean }

/** Parent tenancy wall, additional to the Circle's own visibility/entry rules.
 * Missing metadata is denial; only the store may recognize a genuinely unpartitioned Circle. */
export function canReadCircleParentSpace(parent: CircleParentSpace | null, caps?: ParentCapabilities): boolean {
  if (!parent || parent.status !== 'active') return false
  if (parent.visibility !== null && parent.visibility !== 'network' && parent.visibility !== 'private') return false
  const enabled = spaceFunctionAvailable(parent, 'circles')
  if (parent.visibility === 'private' && !caps?.role) return false
  return enabled || caps?.canEditProfile === true
}
