// Per-member code provisioning. Each member owns ONE persistent personal code (the
// `connect` purpose) — destination_type 'url' → the home SPLASH (the beta front
// door). Because any owner-owned code credits its owner when a scanner signs up,
// this single code IS the referral code: scanning routes through `/q`, which logs
// the scan and drops the owner's referral cookie, then lands on the splash. If the
// scanner signs up for the beta, the owner earns zaps (invite_accepted). The
// destination is one constant (personalCodeTargetUrl) so it can be retargeted later
// with no reprint. (The earlier referral / gift_zap codes are retired; any already
// minted keep working but aren't re-provisioned.) Server-only.

import { createClient } from '@/lib/supabase/server'
import { SITE_URL } from '@/lib/site'
import { getPlatformSetting } from '@/lib/platform-flags'
import { generateSlug } from './codes'
import { STYLE_PRESETS, DEFAULT_STYLE, type QrStyle } from './style'

export type MemberCodePurpose = 'connect' | 'referral' | 'gift_zap'

export interface MemberCodeRow {
  id: string
  slug: string
  purpose: MemberCodePurpose
  title: string
  style: unknown
  scan_count: number
}

// Only the profile code is provisioned now (one per member).
const PURPOSES: MemberCodePurpose[] = ['connect']

function preset(key: string): QrStyle {
  return STYLE_PRESETS.find((p) => p.key === key)?.style ?? DEFAULT_STYLE
}

// The personal `connect` code mints in the STANDARD format (DEFAULT_STYLE: connected modules,
// rounded eyes/pupils, round logo buffer). Its center logo is the member's profile pic, layered
// on at render (withMemberAvatar) so a new photo never needs a reprint; the stored Frequency mark
// is the fallback for a member with no avatar.
const SPEC: Record<MemberCodePurpose, { title: string; destination_type: string; style: QrStyle }> = {
  connect: { title: 'My personal code', destination_type: 'url', style: { ...DEFAULT_STYLE } },
  referral: { title: 'Invite to Frequency', destination_type: 'action', style: preset('forest') },
  gift_zap: { title: 'Gift me a zap', destination_type: 'action', style: preset('midnight') },
}

/** Return the member's personal codes (currently just `connect`), creating any that don't exist yet. */
export async function ensureMemberCodes(profileId: string, handle: string): Promise<MemberCodeRow[]> {
  const db = await createClient()
  // `handle` is retained in the signature for call-site compatibility — the personal
  // code now lands on the splash (personalCodeTargetUrl), so the handle is no longer
  // baked into the destination.
  void handle

  const { data: existing } = await db
    .from('qr_codes')
    .select('id, slug, purpose, title, style, scan_count')
    .eq('owner_profile_id', profileId)
    .in('purpose', PURPOSES)

  const have = new Set((existing ?? []).map((c) => c.purpose))
  const missing = PURPOSES.filter((p) => !have.has(p))

  if (missing.length > 0) {
    // Where the connect code lands a scanner — operator-set (platform_settings
    // 'personal_code_landing', a same-site path); defaults to '/', the splash.
    const landing = await getPlatformSetting('personal_code_landing', '/')
    const connectTarget = `${SITE_URL}${landing.startsWith('/') ? landing : '/'}`
    const rows = missing.map((purpose) => ({
      slug: generateSlug(),
      title: SPEC[purpose].title,
      destination_type: SPEC[purpose].destination_type,
      target_url: purpose === 'connect' ? connectTarget : null,
      purpose,
      owner_profile_id: profileId,
      created_by: profileId,
      style: SPEC[purpose].style as unknown as never,
    }))
    // Unique (owner, purpose) index makes this safe against a double-provision race.
    // NOTE: ON CONFLICT column inference requires a FULL unique index on
    // (owner_profile_id, purpose) — a partial one breaks every provision (see
    // migration 20260610170000). Never swallow this error: it is the difference
    // between "invite link works" and a silent empty return.
    const { error } = await db
      .from('qr_codes')
      .upsert(rows, { onConflict: 'owner_profile_id,purpose', ignoreDuplicates: true })
    if (error) console.error('[member-codes]', error.message)
  }

  const { data: all, error: selectError } = await db
    .from('qr_codes')
    .select('id, slug, purpose, title, style, scan_count')
    .eq('owner_profile_id', profileId)
    .in('purpose', PURPOSES)
  if (selectError) console.error('[member-codes]', selectError.message)

  // Stable order: connect, referral, gift_zap.
  return (all ?? [])
    .map((c) => ({ ...c, purpose: c.purpose as MemberCodePurpose }))
    .sort((a, b) => PURPOSES.indexOf(a.purpose) - PURPOSES.indexOf(b.purpose))
}
