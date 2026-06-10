// Acquisition backfill (ADR-095) — infer a first-touch channel for members who
// signed up before edge capture existed, from the durable facts we DO have:
// referred_by_profile_id (a person sent them) and meta.beta.{heard_about,sequence}.
// Idempotent: skips anyone already attributed. Honest: members we can't infer are
// left untagged (they show as "unattributed" in the rollup, not mislabeled 'direct').

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { assignTag } from '@/lib/traits/tags'
import { ACQUISITION_CHANNELS, channelTag, type AcquisitionChannel } from './channels'

/** "How did you hear?" answers → channel (substring match, case-insensitive). */
const HEARD_ABOUT_RULES: { needle: string; channel: AcquisitionChannel }[] = [
  { needle: 'instagram', channel: 'social' },
  { needle: 'tiktok', channel: 'social' },
  { needle: 'twitter', channel: 'social' },
  { needle: ' x ', channel: 'social' },
  { needle: 'x /', channel: 'social' },
  { needle: 'facebook', channel: 'social' },
  { needle: 'linkedin', channel: 'social' },
  { needle: 'reddit', channel: 'social' },
  { needle: 'youtube', channel: 'video' },
  { needle: 'video', channel: 'video' },
  { needle: 'search', channel: 'search' },
  { needle: 'google', channel: 'search' },
  { needle: 'event', channel: 'event_guest' },
  { needle: 'meetup', channel: 'event_guest' },
  { needle: 'friend', channel: 'referral' },
  { needle: 'member', channel: 'referral' },
  { needle: 'invited', channel: 'referral' },
  { needle: 'daniel', channel: 'referral' },
  { needle: 'founder', channel: 'referral' },
  { needle: 'partner', channel: 'referral' },
  { needle: 'collaborator', channel: 'referral' },
]

function channelFromHeardAbout(heard: string | null | undefined): AcquisitionChannel | null {
  if (!heard) return null
  const h = ` ${heard.toLowerCase()} `
  for (const r of HEARD_ABOUT_RULES) if (h.includes(r.needle)) return r.channel
  return null
}

function channelFromSequence(seq: string | null | undefined): AcquisitionChannel | null {
  if (!seq) return null
  // The base flow (`beta-default`) carries no channel signal; legacy slugs keep
  // their historic meaning (early-adopter was the video on-ramp).
  if (seq === 'beta-default') return null
  return seq === 'early-adopter' ? 'video' : 'referral'
}

/** Infer a channel from the durable signals, strongest first. Null = leave untagged. */
function inferChannel(referredBy: string | null | undefined, beta: Record<string, unknown> | null): AcquisitionChannel | null {
  if (referredBy) return 'referral'
  return (
    channelFromHeardAbout(typeof beta?.heard_about === 'string' ? (beta.heard_about as string) : null) ??
    channelFromSequence(typeof beta?.sequence === 'string' ? (beta.sequence as string) : null)
  )
}

export interface BackfillResult {
  scanned: number
  tagged: number
  skipped: number
}

/** Backfill acquisition for all members. Idempotent; safe to re-run. */
export async function backfillAcquisition(): Promise<BackfillResult> {
  const db = createAdminClient() as unknown as SupabaseClient

  // Who's already attributed (any source_* tag)?
  const tagKeys = ACQUISITION_CHANNELS.map(channelTag)
  const { data: taggedRows } = await db.from('member_tags').select('profile_id').in('tag_key', tagKeys)
  const taggedSet = new Set((taggedRows ?? []).map((r) => (r as { profile_id: string }).profile_id))

  const { data: profiles } = await db
    .from('profiles')
    .select('id, referred_by_profile_id, meta')
  const all = (profiles ?? []) as { id: string; referred_by_profile_id: string | null; meta: Record<string, unknown> | null }[]

  let tagged = 0
  let skipped = 0
  for (const p of all) {
    const meta = (p.meta ?? {}) as Record<string, unknown>
    if (taggedSet.has(p.id) || meta.acquisition) {
      skipped++
      continue
    }
    const beta = (meta.beta as Record<string, unknown> | undefined) ?? null
    const channel = inferChannel(p.referred_by_profile_id, beta)
    if (!channel) {
      skipped++
      continue
    }

    await assignTag(p.id, channelTag(channel), {
      source: 'backfill',
      context: { channel, backfilled: true },
    }).catch(() => {})

    const record = {
      channel,
      first_touch: null,
      last_touch_channel: channel,
      signals: p.referred_by_profile_id ? { referrer_profile_id: p.referred_by_profile_id } : {},
      stamped_at: new Date().toISOString(),
      backfilled: true,
    }
    await db.from('profiles').update({ meta: { ...meta, acquisition: record } }).eq('id', p.id)
    tagged++
  }

  return { scanned: all.length, tagged, skipped }
}
