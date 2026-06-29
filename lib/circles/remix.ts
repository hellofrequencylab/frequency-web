// Starter Circles — the Remix lifecycle: adopt a blueprint into a private draft,
// then publish it as a completely original live Circle. Server-only (admin
// client; the action layer enforces authz). Mirrors the create + claim flows
// (app/(main)/admin/actions.ts createCircle, circles/[slug]/claim-actions.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { awardZapsForAction } from '@/lib/zaps'
import { assignTraining } from '@/lib/onboarding/training'
import { stampCircleSpaceId } from './store'
import { getTemplateById } from './templates-data'

type Admin = ReturnType<typeof createAdminClient>

async function uniqueCircleSlug(admin: Admin, base: string): Promise<string> {
  let slug = slugify(base) || 'circle'
  const { data } = await admin.from('circles').select('id').eq('slug', slug).maybeSingle()
  if (data) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`
  return slug
}

/** Pick a starting member_cap from a free-text size label ("5 to 10", "4 to 10
 *  per table"): the largest number stated, clamped to the in-person ceiling. */
function capFromSize(label: string | null): number {
  if (!label) return 12
  const nums = label.match(/\d+/g)
  const max = nums && nums.length ? Math.max(...nums.map(Number)) : 12
  return Math.min(50, Math.max(2, max || 12))
}

export interface RemixResult {
  circleId: string
  slug: string
}

/** "Make it yours": clone a Starter Circle blueprint into a private DRAFT the
 *  adopter owns and edits before going live. */
export async function remixTemplate(input: { templateId: string; profileId: string }): Promise<RemixResult> {
  const template = await getTemplateById(input.templateId)
  if (!template) throw new Error('That Starter Circle is not available.')

  const admin = createAdminClient()
  const slug = await uniqueCircleSlug(admin, template.name)
  const spaceId = await stampCircleSpaceId()

  // The draft Circle: owned by the adopter, status 'draft' so it is hidden from
  // discovery and visible only to them until they publish. Default to in-person
  // (the recommended format); the Host can switch it in the builder. space_id +
  // status 'draft' are newer than the generated DB types, so cast the payload
  // to reach them (ADR-246), exactly like createCircle.
  const { data: circle, error } = await admin
    .from('circles')
    .insert({
      name: template.name,
      about: template.oneLiner || template.identity || null,
      type: 'in-person',
      member_cap: capFromSize(template.sizeLabel),
      status: 'draft',
      slug,
      host_id: input.profileId,
      member_count: 0,
      primary_pillar: template.primaryPillar,
      origin_template_id: template.id,
      ...(spaceId ? { space_id: spaceId } : {}),
    } as never)
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const circleId = String((circle as { id: string }).id)

  // The rich content travels into the 1:1 profile. The template's own callouts
  // become edit-mode notes; the standard guidance library is layered in by the
  // editor at render time. circle_profiles is not in the generated types yet.
  // circle_profiles is now in the generated types; the typed client + payload
  // cast (as never, for the jsonb columns) is the sanctioned ADR-246 pattern.
  await admin.from('circle_profiles').insert({
    circle_id: circleId,
    pillars_inside: template.pillarsInside,
    meetup: template.meetup,
    gathering: template.gathering,
    thread: template.thread,
    format: template.format,
    size_label: template.sizeLabel,
    agreements: template.agreements,
    recommended_journey_pillar: template.recommendedJourneyPillar,
    remix_options: template.remixOptions,
    editor_notes: template.callouts,
  } as never)

  // The adopter is a member of their own draft, as host.
  await admin
    .from('memberships')
    .upsert(
      { profile_id: input.profileId, circle_id: circleId, status: 'active', volunteer_role: 'host' },
      { onConflict: 'profile_id,circle_id' },
    )

  // Creating a Circle makes you a Host: this opens the Leadership tab (/lead) so
  // they can find and finish the draft.
  await ensureHostOnOwnership(input.profileId)

  return { circleId, slug }
}

/** Publish a draft as a live, original Circle. Idempotent (a non-draft returns
 *  its slug unchanged). Host-only. Best-effort on rewards + announcement. */
export async function publishCircle(input: { circleId: string; profileId: string }): Promise<{ slug: string }> {
  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('id, slug, host_id, status, name, about')
    .eq('id', input.circleId)
    .maybeSingle()
  if (!circle) throw new Error('Circle not found.')
  const c = circle as { id: string; slug: string; host_id: string | null; status: string; name: string; about: string | null }
  if (c.host_id !== input.profileId) throw new Error('Only the Host can publish this Circle.')
  if (c.status !== 'draft') return { slug: c.slug }

  const { error } = await admin.from('circles').update({ status: 'active' } as never).eq('id', input.circleId)
  if (error) throw new Error(error.message)

  await ensureHostOnOwnership(input.profileId)

  // Lifecycle reward (idempotent via the engagement ledger), best-effort.
  try {
    const { recorded } = await recordEngagementEvent({
      idempotencyKey: `circle_start:${c.id}`,
      source: 'web',
      eventType: 'circle.started',
      actorProfileId: input.profileId,
      context: { circleId: c.id, origin: 'starter_circle' },
    })
    if (recorded) await awardZapsForAction(input.profileId, 'circle_start')
  } catch {
    /* rewards must never block publish */
  }

  // Announce the new Circle, best-effort (mirrors createCircle).
  try {
    await admin.from('posts').insert({
      author_id: input.profileId,
      body: c.about ? `Started a new circle: ${c.name}.\n\n${c.about}` : `Started a new circle: ${c.name}.`,
      scope_id: c.id,
      visibility: 'cluster',
      post_type: 'announcement',
      is_pinned: true,
    })
  } catch {
    /* announcement is best-effort */
  }

  return { slug: c.slug }
}

/**
 * Becoming a Circle Host elevates community_role to 'host' so the Leadership tab
 * (requireLeadFloor, host+) opens. UPWARD-ONLY and capped at 'host': it never
 * touches guide/mentor/staff and can never escalate, so it is safe to run as a
 * system effect of the member's own action — unlike the escalation-guarded
 * operator assignRole (admin/actions.ts). Idempotent; side effects best-effort.
 */
export async function ensureHostOnOwnership(profileId: string): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('community_role').eq('id', profileId).maybeSingle()
  const role = ((data as { community_role?: string } | null)?.community_role ?? 'member') as CommunityRole
  if (atLeastRole(role, 'host')) return // already host+; never downgrade
  const { error } = await admin.from('profiles').update({ community_role: 'host' }).eq('id', profileId)
  if (error) return
  // Assign the Host training Journey on promotion (ADR-157 §7.1), best-effort.
  assignTraining(profileId, 'host').catch(() => {})
}
