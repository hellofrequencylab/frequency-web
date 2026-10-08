import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { memberSpacePlan, isCollectivePlan, memberSpaceCapacity } from './member-spaces'
import { asSpacePlan, type SpacePlan } from '@/lib/pricing/plans'

/** Errors grant no inherited paid depth. Never persist the effective label over the owned plan. */
export const inheritedSpacePlan = cache(async (spaceId: string, ownPlan: string | null | undefined): Promise<SpacePlan> => {
  const own = asSpacePlan(ownPlan)
  if (own !== 'free') return own
  try {
    const db = createAdminClient()
    const { data, error } = await db.from('spaces').select('parent_id, owner_profile_id, status, type').eq('id', spaceId).maybeSingle()
    if (error || !data || !data.owner_profile_id || data.status !== 'active' || data.type === 'root') return own
    const parentId = data.parent_id
    if (!parentId) return own
    const parent = await db.from('spaces').select('plan, status, owner_profile_id, type, parent_id').eq('id', parentId).maybeSingle()
    if (parent.error || !parent.data || parent.data.owner_profile_id !== data.owner_profile_id
      || parent.data.type === 'root' || parent.data.parent_id !== null) return own
    return memberSpacePlan(own, parent.data, { childOwnerId: data.owner_profile_id,
      parentOwnerId: parent.data.owner_profile_id, childStatus: data.status, childType: data.type,
      parentType: parent.data.type, parentParentId: parent.data.parent_id })
  } catch { return own }
})

interface MemberSpaceOption { id: string; slug: string; name: string; status: string; parent_id: string | null }
export interface MemberSpaceManagement {
  capacity: number; active: boolean; members: MemberSpaceOption[]; candidates: MemberSpaceOption[]
}

/** Caller must own the parent. Private sibling Spaces never escape this ownership filter. */
export async function loadMemberSpaceManagement(spaceId: string, ownerId: string): Promise<MemberSpaceManagement | null> {
  const db = createAdminClient()
  const parent = await db.from('spaces').select('owner_profile_id, plan, status').eq('id', spaceId).maybeSingle()
  if (parent.error || !parent.data || parent.data.owner_profile_id !== ownerId) return null
  const active = parent.data.status === 'active' && isCollectivePlan(parent.data.plan)
  const [spaces, items] = await Promise.all([
    db.from('spaces').select('id, slug, name, status, plan, parent_id').eq('owner_profile_id', ownerId).neq('id', spaceId)
      .neq('type', 'root').order('name'),
    db.from('space_subscription_items').select('item_key, status, quantity').eq('space_id', spaceId),
  ])
  if (spaces.error || items.error) return null
  const rows = (spaces.data ?? []) as unknown as (MemberSpaceOption & { plan?: string | null })[]
  const members = rows.filter(s => s.parent_id === spaceId)
  if (!active && !members.length) return null
  return { active, capacity: active ? memberSpaceCapacity(items.data ?? []) : 0, members,
    candidates: active ? rows.filter(s => s.parent_id === null && s.status === 'active' && !isCollectivePlan(s.plan) && !rows.some(child => child.parent_id === s.id)) : [] }
}
