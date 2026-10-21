'use server'

// ─────────────────────────────────────────────────────────────────────────────
// THE OWNER LAUNCH (server). A member's own front door onto the Business Seeder pipeline: the answers
// become one intake in `owner` mode, the durable research job drafts the page in the standard Space
// layout, and `launchSpace` applies it with the member as the owner. Three actions, all bound to the
// signed-in member: they can only start, watch and launch THEIR OWN intake.
//
// Guards, each for a stated reason:
//   • AI off (the master switch)  → a plain "not available", and the Create a Space wizard stays the way in.
//   • The member's Space cap      → the same Crew / paid-Space rule createSpace enforces (ADR-810).
//   • A daily cap on launches     → every launch runs a paid research and drafting pass.
//   • A claimed or applied intake → launching twice lands on the same Space, never a second one.
//
// Tracking is first-party only (the engagement ledger), never a pixel, and carries no answer text.
// ─────────────────────────────────────────────────────────────────────────────

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { aiEnabled } from '@/lib/ai/client'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitOk } from '@/lib/rate-limit'
import { featureGatesLive } from '@/lib/pricing/settings'
import { isPaidSpacePlan, spaceCreationBlockReason } from '@/lib/pricing/space-limits'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { createIntake, getIntake } from '@/lib/importer/store'
import { enqueueResearch } from '@/lib/importer/queue'
import { runResearch } from '@/lib/importer/pipeline'
import { applyIntake } from '@/lib/importer/materialize'
import { postCreateLanding } from '@/lib/spaces/setup'
import { LAUNCH_DAILY_LIMIT, launchAnswersToInputs, launchReady, type LaunchAnswers } from '@/lib/importer/launch'
import type { BusinessProfile } from '@/lib/importer/schema'

export type LaunchStartResult = { ok: true; intakeId: string } | { ok: false; error: string }

/** What the member sees while the draft is being made, and once it is ready to look over. */
export interface LaunchStatus {
  state: 'working' | 'ready' | 'failed' | 'launched'
  error?: string
  preview?: {
    name: string
    tagline: string
    about: string
    offerings: { title: string; price?: number }[]
    faqCount: number
  }
}

/** The active Spaces a member owns (plan only), for the creation cap. Fail-safe to [] like createSpace's. */
async function ownedSpacePlans(profileId: string): Promise<{ plan: string | null }[]> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ data: { plan: string | null }[] | null }> }
        }
      }
    }
    const { data } = await db.from('spaces').select('plan').eq('owner_profile_id', profileId).eq('status', 'active')
    return data ?? []
  } catch {
    return []
  }
}

export async function startLaunch(answers: LaunchAnswers): Promise<LaunchStartResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'Sign in to launch your page.' }
  if (!launchReady(answers)) return { ok: false, error: 'Tell us your business name to start.' }
  if (!aiEnabled()) {
    return { ok: false, error: 'Vera is not available right now. You can still create your Space by hand.' }
  }

  if (await featureGatesLive()) {
    const caller = await getCallerProfile()
    const owned = await ownedSpacePlans(profileId)
    const blocked = spaceCreationBlockReason({
      tier: caller?.realMembershipTier ?? 'free',
      ownedSpaceCount: owned.length,
      ownsPaidSpace: owned.some((r) => isPaidSpacePlan(r.plan)),
    })
    if (blocked) return { ok: false, error: blocked }
  }

  if (!(await rateLimitOk('owner_launch', profileId, LAUNCH_DAILY_LIMIT, '1 d'))) {
    return { ok: false, error: 'You have started a few launches today. Try again tomorrow, or finish one of them.' }
  }

  const intakeId = await createIntake({ createdBy: profileId, mode: 'owner', inputs: launchAnswersToInputs(answers) })
  if (!intakeId) return { ok: false, error: 'Could not start your launch. Try again in a moment.' }

  // Durable path first (the process-queue cron drains it), plus an inline run behind after() so the
  // member is not left waiting on the cron. runResearch is idempotent on a double drain.
  await enqueueResearch(intakeId)
  after(() => runResearch(intakeId))

  // First-party only, and only that a launch started and which questions were answered: no text.
  void recordEngagementEvent({
    idempotencyKey: `owner_launch_start:${intakeId}`,
    source: 'web',
    eventType: 'owner_launch_start',
    actorProfileId: profileId,
    context: { intakeId, answered: Object.keys(answers).filter((k) => (answers[k as keyof LaunchAnswers] ?? '').trim()) },
  }).catch(() => {})

  return { ok: true, intakeId }
}

export async function launchStatus(intakeId: string): Promise<LaunchStatus> {
  const profileId = await getMyProfileId()
  const row = profileId ? await getIntake(intakeId) : null
  if (!row || row.createdBy !== profileId || row.mode !== 'owner') {
    return { state: 'failed', error: 'We could not find that launch.' }
  }
  if (row.status === 'applied') return { state: 'launched' }
  if (row.status === 'failed') return { state: 'failed', error: row.error ?? 'Vera could not finish the draft.' }
  if (row.status !== 'review') return { state: 'working' }

  const draft = row.draft as unknown as BusinessProfile
  return {
    state: 'ready',
    preview: {
      name: draft.name ?? '',
      tagline: draft.tagline ?? '',
      about: (draft.about ?? draft.story ?? '').slice(0, 600),
      offerings: (draft.offerings ?? []).slice(0, 6).map((o) => ({ title: o.title, price: o.price })),
      faqCount: (draft.faq ?? []).length,
    },
  }
}

/** Apply the draft with the member as owner, then hand them to the setup walk. Redirects on success. */
export async function launchSpace(intakeId: string): Promise<{ ok: false; error: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'Sign in to launch your page.' }
  const row = await getIntake(intakeId)
  if (!row || row.createdBy !== profileId || row.mode !== 'owner') return { ok: false, error: 'We could not find that launch.' }
  if (row.status !== 'review' && row.status !== 'applied') return { ok: false, error: 'Your draft is not ready yet.' }

  const result = await applyIntake(intakeId, { ownerProfileId: profileId })
  if (!result.ok || !result.slug) return { ok: false, error: result.error ?? 'Could not launch your page. Try again.' }

  void recordEngagementEvent({
    idempotencyKey: `owner_launch_done:${intakeId}`,
    source: 'web',
    eventType: 'owner_launch_done',
    actorProfileId: profileId,
    context: { intakeId, spaceId: result.spaceId },
  }).catch(() => {})

  redirect(postCreateLanding('business', result.slug))
}
