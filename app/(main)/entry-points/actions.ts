'use server'

// Entry-point mutations (ADR-126, docs/ENTRY-POINTS.md). Crew-gated. An entry point
// is a qr_codes row owned by the member with template_id set (purpose NULL). It
// reuses the whole QR pipeline; this just writes the template + flyer + destination
// and rewards setting one up. The new qr_codes columns aren't in the generated types
// until regen, so writes go through an untyped admin handle (repo convention).

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { isPaid } from '@/lib/core/entitlement'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSlug } from '@/lib/qr/codes'
import { STYLE_PRESETS, DEFAULT_STYLE, parseStyle } from '@/lib/qr/style'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { awardZapsForAction } from '@/lib/zaps'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { getEntryTemplate, isEntryTemplateId } from '@/lib/entry-points/templates'
import { isValidEntryDestination } from '@/lib/entry-points/destinations'
import { countMyEntryPoints } from '@/lib/entry-points/store'
import { campaignExists } from '@/lib/entry-points/campaigns'
import type { Json } from '@/lib/database.types'

// Reward setting up an entry point for the first few only — enough to encourage
// participation, capped so it can't be farmed (ADR-126; the real payoff is the
// invite_accepted credit when a scan converts).
const CREATE_REWARD_CAP = 5

export interface EntryPointInput {
  templateId: string
  title: string
  /** Site-relative destination path (a /start lead flow, circle/event, or curated page). */
  destination: string
  headline: string
  subhead: string
  footer: string
  /** Optional campaign to file this entry point under (admin builder, Phase 2). */
  campaignId?: string
}

interface CleanEntry {
  title: string
  target_url: string
  template_id: string
  flyer: { headline: string; subhead: string; footer: string }
  style: Json
}

// Crew = the paid membership tier. Entry points are a paid (Crew) feature.
async function requireCrew(): Promise<{ id: string } | string> {
  const me = await getCallerProfile()
  if (!me) return 'Sign in first.'
  if (!isPaid(me.membershipTier)) return 'Entry points are a Crew (paid membership) feature.'
  return { id: me.id }
}

function clean(input: EntryPointInput): CleanEntry | string {
  const title = input.title.trim().slice(0, 80)
  if (!title) return 'Give your entry point a name.'
  if (!isEntryTemplateId(input.templateId)) return 'Pick a template.'
  if (!isValidEntryDestination(input.destination)) return 'Pick where it should point.'
  const template = getEntryTemplate(input.templateId)
  const slot = (v: string, fallback: string) => (v.trim() ? v.trim().slice(0, 160) : fallback)
  const style = STYLE_PRESETS.find((p) => p.key === template.stylePreset)?.style ?? DEFAULT_STYLE
  return {
    title,
    target_url: input.destination,
    template_id: template.id,
    flyer: {
      headline: slot(input.headline, template.slots.headline),
      subhead: slot(input.subhead, template.slots.subhead),
      footer: slot(input.footer, template.slots.footer),
    },
    style: parseStyle(style) as unknown as Json,
  }
}

export async function createEntryPoint(input: EntryPointInput): Promise<ActionResult<{ id: string }>> {
  const crew = await requireCrew()
  if (typeof crew === 'string') return fail(crew)
  const row = clean(input)
  if (typeof row === 'string') return fail(row)

  const db = createAdminClient()

  // Optional campaign (admin builder) — only set it if it really exists.
  const campaignId = input.campaignId && (await campaignExists(input.campaignId)) ? input.campaignId : null

  // Count BEFORE inserting — drives the reward cap + the idempotency key.
  const prior = await countMyEntryPoints(crew.id)

  const { data, error } = await db
    .from('qr_codes')
    .insert({
      slug: generateSlug(),
      title: row.title,
      destination_type: 'url',
      target_url: row.target_url,
      owner_profile_id: crew.id,
      created_by: crew.id,
      template_id: row.template_id,
      flyer: row.flyer,
      style: row.style,
      campaign_id: campaignId,
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not create the entry point.')

  // Reward setting one up — exactly-once (ledger) and only for the first few.
  if (prior < CREATE_REWARD_CAP) {
    try {
      const { recorded } = await recordEngagementEvent({
        idempotencyKey: `entry_point_created:${crew.id}:${prior + 1}`,
        source: 'system',
        eventType: 'entry_point.created',
        actorProfileId: crew.id,
        context: { entryPointId: (data as { id: string }).id, templateId: row.template_id },
      })
      if (recorded) await awardZapsForAction(crew.id, 'entry_point_created').catch(() => {})
    } catch {
      // reward is a bonus, never blocks creation
    }
  }

  revalidatePath('/entry-points')
  revalidatePath('/admin/marketing/funnels')
  return ok({ id: (data as { id: string }).id })
}

// A member can manage an entry point they OWN or CREATED — the latter covers codes
// made in the older QR flow that never got an `owner_profile_id`/`template_id`. The
// first edit claims them (sets owner + template), so they become proper entry points.
async function ownEntryPoint(db: SupabaseClient, id: string, ownerId: string): Promise<boolean> {
  const { data } = await db.from('qr_codes').select('owner_profile_id, created_by').eq('id', id).maybeSingle()
  const row = data as { owner_profile_id: string | null; created_by: string | null } | null
  return !!row && (row.owner_profile_id === ownerId || row.created_by === ownerId)
}

export async function updateEntryPoint(id: string, input: EntryPointInput): Promise<ActionResult> {
  const crew = await requireCrew()
  if (typeof crew === 'string') return fail(crew)
  const row = clean(input)
  if (typeof row === 'string') return fail(row)

  const db = createAdminClient()
  if (!(await ownEntryPoint(db, id, crew.id))) return fail('That isn’t your entry point.')

  const campaignId = input.campaignId && (await campaignExists(input.campaignId)) ? input.campaignId : undefined
  const { error } = await db
    .from('qr_codes')
    .update({
      title: row.title,
      target_url: row.target_url,
      template_id: row.template_id,
      flyer: row.flyer,
      style: row.style,
      // Claim a legacy/ownerless code on first edit, so it's fully owned afterward.
      owner_profile_id: crew.id,
      ...(campaignId ? { campaign_id: campaignId } : {}),
    })
    .eq('id', id)
  if (error) return fail('Could not save changes.')

  revalidatePath('/entry-points')
  revalidatePath('/admin/marketing/funnels')
  return ok()
}

export async function deleteEntryPoint(id: string): Promise<ActionResult> {
  const crew = await requireCrew()
  if (typeof crew === 'string') return fail(crew)

  const db = createAdminClient()
  if (!(await ownEntryPoint(db, id, crew.id))) return fail('That isn’t your entry point.')

  const { error } = await db.from('qr_codes').delete().eq('id', id)
  if (error) return fail('Could not delete the entry point.')

  revalidatePath('/entry-points')
  revalidatePath('/admin/marketing/funnels')
  return ok()
}
