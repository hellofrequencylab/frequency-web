'use server'

import { requireProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ensureMemberCodes } from '@/lib/qr/member-codes'
import { shortLinkUrl } from '@/lib/qr/links'

// Invite a member: every member's personal code already credits them when a scanner
// signs up (lib/qr/member-codes.ts → fq_ref → applyReferralAttribution awards
// `invite_accepted` = 40 zaps). So the invite link IS that code's short link; this
// just provisions it on demand and hands it back for the Invite surface.
export async function getInviteLink(): Promise<{ url: string; codeId: string } | { error: string }> {
  const profileId = await requireProfileId()
  const supabase = await createClient()
  const { data: me } = await supabase.from('profiles').select('handle').eq('id', profileId).maybeSingle()
  if (!me?.handle) return { error: 'Finish setting up your profile first.' }

  const codes = await ensureMemberCodes(profileId, me.handle as string)
  const code = codes[0]
  if (!code) return { error: 'Could not generate your invite link.' }
  return { url: shortLinkUrl(code.slug), codeId: code.id }
}
