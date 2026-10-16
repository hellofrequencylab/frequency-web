'use server'
import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { canBePartner, canRespondToPartnerInvite, isPartnerHub, LIVE_PARTNER_STATUSES, partnerHandle, partnerInviteRefusal, type PartnershipRow } from './partners'
import { PARTNER_COLS, PARTNER_SPACE_COLS, partnershipRows, partnerSpacesById, type PartnerSpaceRow } from './partners-live-store'

// Cross-owner invites (SCAN-982). The hub owner invites; only the partner Space's owner accepts.
// Either side can withdraw or leave. The database trigger re-checks owners at commit.
async function ownsSpace(spaceId: string, callerId: string): Promise<boolean> {
  const space = await getSpaceById(spaceId)
  return !!space && space.ownerProfileId === callerId && spaceFunctionAccess(space, 'profile', 'admin')
}
export async function invitePartnerSpace(hubId: string, partnerInput: string): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller || typeof hubId !== 'string' || !await ownsSpace(hubId, caller.id)) return fail('Not allowed.')
  const handle = partnerHandle(partnerInput)
  if (!handle) return fail('Enter the Space handle, like the part after /spaces/ in its link.')
  const admin = createAdminClient()
  const { data: partner, error } = await admin.from('spaces').select(PARTNER_SPACE_COLS).eq('slug', handle).maybeSingle()
  if (error) return fail('That Space could not be checked. Try again.')
  let hub: PartnerSpaceRow | undefined, rows: PartnershipRow[]
  try {
    hub = (await partnerSpacesById([hubId])).get(hubId)
    rows = await partnershipRows('hub_space_id', [hubId], LIVE_PARTNER_STATUSES)
  } catch { return fail('Partners could not be checked. Try again.') }
  const refusal = partnerInviteRefusal(hub ?? null, (partner as unknown as PartnerSpaceRow | null) ?? null, caller.id, rows)
  if (refusal) return fail(refusal)
  const { error: insertError } = await admin.from('collective_partners').insert({ hub_space_id: hubId, partner_space_id: (partner as unknown as PartnerSpaceRow).id, invited_by: caller.id, status: 'pending' })
  if (insertError) return fail('This invite could not be sent. It may already be pending.')
  revalidatePath('/spaces', 'layout')
  return ok()
}

export async function respondPartnerInvite(id: string, next: 'accepted' | 'declined' | 'revoked'): Promise<ActionResult> {
  if (!['accepted', 'declined', 'revoked'].includes(next)) return fail('Not allowed.')
  const caller = await getCallerProfile()
  if (!caller || typeof id !== 'string') return fail('Not allowed.')
  const admin = createAdminClient()
  const { data, error } = await admin.from('collective_partners').select(PARTNER_COLS).eq('id', id).maybeSingle()
  if (error || !data) return fail('Not allowed.')
  const row = data as unknown as PartnershipRow
  const [hubOwn, partnerOwn] = await Promise.all([ownsSpace(row.hub_space_id, caller.id), ownsSpace(row.partner_space_id, caller.id)])
  if (!hubOwn && !partnerOwn) return fail('Not allowed.')
  const side = partnerOwn ? 'partner' : 'hub'
  if (!canRespondToPartnerInvite(row.status, side, next)) return fail('This invite has already changed.')
  if (next === 'accepted') {
    let spaces: Map<string, PartnerSpaceRow>
    try { spaces = await partnerSpacesById([row.hub_space_id, row.partner_space_id]) } catch { return fail('This invite could not be checked. Try again.') }
    const hub = spaces.get(row.hub_space_id), partner = spaces.get(row.partner_space_id)
    if (!isPartnerHub(hub) || !canBePartner(partner) || hub!.owner_profile_id !== row.invited_by || hub!.owner_profile_id === partner!.owner_profile_id) return fail('This invite is no longer available.')
  }
  const { data: updated, error: updateError } = await admin.from('collective_partners')
    .update({ status: next, responded_by: caller.id, responded_at: new Date().toISOString() }).eq('id', id).eq('status', row.status).select('id')
  if (updateError || !updated?.length) return fail('This invite has already changed.')
  revalidatePath('/spaces', 'layout')
  return ok()
}
