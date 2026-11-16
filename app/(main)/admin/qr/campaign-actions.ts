'use server'

// QR campaign challenges (scavenger hunts) authored on the existing gamification
// engine (ADR-094): a campaign is a `season_challenges` row (criteria type=qr_scan,
// target N) plus a `challenge_qr_codes` set scoping which codes count. Progress,
// completion, rewards, and the member /crew/challenges surface are all reused.
// Host+ only; service-role writes.

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import type { Json } from '@/lib/database.types'

export interface CampaignInput {
  title: string
  description: string
  rewardZaps: number
  /** collect_all → target is the whole set; collect_n → an explicit count. */
  mode: 'collect_all' | 'collect_n'
  target: number
  codeIds: string[]
  /** Optional run window (ISO), null = no bound. */
  validFrom: string | null
  validUntil: string | null
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'qr-campaign'
}

export async function createCampaign(input: CampaignInput): Promise<ActionResult<{ id: string }>> {
  await requireAdmin('host', { staff: 'qr' })

  const title = input.title.trim()
  if (!title) return fail('Give the campaign a name.')
  const codeIds = [...new Set(input.codeIds)].filter(Boolean)
  if (codeIds.length === 0) return fail('Select at least one code for the hunt.')

  const reward = Number.isFinite(input.rewardZaps) ? Math.max(0, Math.round(input.rewardZaps)) : 0
  const target =
    input.mode === 'collect_all'
      ? codeIds.length
      : Math.min(Math.max(1, Math.round(input.target || 1)), codeIds.length)

  const db = createAdminClient()
  const season = (await getCurrentSeason())?.season_number ?? 1
  const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`

  const { data: challenge, error } = await db
    .from('season_challenges')
    .insert({
      season,
      slug,
      name: title,
      description: input.description.trim() || `Scan ${target} of ${codeIds.length} codes`,
      category: 'special',
      difficulty: 'normal',
      criteria: { type: 'qr_scan' } as unknown as Json,
      target,
      zaps_reward: reward,
      valid_from: input.validFrom || null,
      valid_until: input.validUntil || null,
    })
    .select('id')
    .single()
  if (error || !challenge) return fail('Could not create the campaign.')

  const { error: linkErr } = await db
    .from('challenge_qr_codes')
    .insert(codeIds.map((qr_code_id) => ({ challenge_id: challenge.id, qr_code_id })))
  if (linkErr) {
    await db.from('season_challenges').delete().eq('id', challenge.id) // no orphan
    return fail('Could not attach the codes.')
  }

  revalidatePath('/admin/qr')
  return ok({ id: challenge.id })
}

export async function updateCampaign(id: string, input: CampaignInput): Promise<ActionResult> {
  await requireAdmin('host', { staff: 'qr' })

  const title = input.title.trim()
  if (!title) return fail('Give the campaign a name.')
  const codeIds = [...new Set(input.codeIds)].filter(Boolean)
  if (codeIds.length === 0) return fail('Select at least one code for the hunt.')
  const reward = Number.isFinite(input.rewardZaps) ? Math.max(0, Math.round(input.rewardZaps)) : 0
  const target =
    input.mode === 'collect_all'
      ? codeIds.length
      : Math.min(Math.max(1, Math.round(input.target || 1)), codeIds.length)

  const db = createAdminClient()
  // Guard: only edit QR campaigns, never a seeded season challenge.
  const { data: c } = await db.from('season_challenges').select('criteria').eq('id', id).maybeSingle()
  if (((c?.criteria as Record<string, unknown> | null)?.type ?? null) !== 'qr_scan') {
    return fail('Not a QR campaign.')
  }

  const { error } = await db
    .from('season_challenges')
    .update({
      name: title,
      description: input.description.trim() || `Scan ${target} of ${codeIds.length} codes`,
      target,
      zaps_reward: reward,
      valid_from: input.validFrom || null,
      valid_until: input.validUntil || null,
    })
    .eq('id', id)
  if (error) return fail('Could not save the campaign.')

  // Diff the code set (add new, drop removed).
  const { data: existing } = await db.from('challenge_qr_codes').select('qr_code_id').eq('challenge_id', id)
  const have = new Set((existing ?? []).map((r) => r.qr_code_id))
  const want = new Set(codeIds)
  const toAdd = codeIds.filter((x) => !have.has(x))
  const toRemove = [...have].filter((x) => !want.has(x))
  if (toAdd.length) {
    const { error: addErr } = await db
      .from('challenge_qr_codes')
      .insert(toAdd.map((qr_code_id) => ({ challenge_id: id, qr_code_id })))
    if (addErr) return fail('Could not attach the codes.')
  }
  if (toRemove.length) {
    const { error: removeErr } = await db
      .from('challenge_qr_codes')
      .delete()
      .eq('challenge_id', id)
      .in('qr_code_id', toRemove)
    if (removeErr) return fail('Could not detach the codes.')
  }

  revalidatePath('/admin/qr')
  return ok()
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  await requireAdmin('host', { staff: 'qr' })
  const db = createAdminClient()

  // Guard: only delete QR campaigns, never a seeded season challenge.
  const { data: c } = await db.from('season_challenges').select('criteria').eq('id', id).maybeSingle()
  if (((c?.criteria as Record<string, unknown> | null)?.type ?? null) !== 'qr_scan') {
    return fail('Not a QR campaign.')
  }
  const { error } = await db.from('season_challenges').delete().eq('id', id) // cascades set + progress
  if (error) return fail('Could not delete the campaign.')

  revalidatePath('/admin/qr')
  return ok()
}
