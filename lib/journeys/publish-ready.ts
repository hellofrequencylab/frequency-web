// Journeys: the publish READINESS check, enforced on the server (JRN-005). Server-only.
//
// readyCheck/readyToPublish (lib/journeys/wizard.ts) are the guide's Ready checklist: a real name,
// and phases with steps inside. Only the guide's client honoured them; the editor header's Publish,
// the settings visibility control and a plain action call went straight to setJourneyVisibility, so
// a fresh draft (three empty phases) could go live in the library with nothing to start. This runs
// the SAME pure checklist over the stored row + block counts, so every publish door agrees.

import { createAdminClient } from '@/lib/supabase/admin'
import { readyCheck, readyToPublish } from './wizard'

type PublishReady = { ok: true } | { ok: false; error: string }

export async function checkJourneyReadyToPublish(planId: string): Promise<PublishReady> {
  const admin = createAdminClient()
  const [{ data: plan, error: planError }, { data: items, error: itemsError }] = await Promise.all([
    admin
      .from('journey_plans')
      .select('title, summary, intro, cover_image, drip_interval_days, window_starts_at, window_ends_at')
      .eq('id', planId)
      .maybeSingle(),
    admin.from('journey_plan_items').select('block_type').eq('plan_id', planId),
  ])
  if (planError || itemsError) return { ok: false, error: 'Could not check this Journey. Try again.' }
  if (!plan) return { ok: false, error: 'That Journey is gone.' }
  const rows = (items ?? []) as { block_type: string | null }[]
  const phaseCount = rows.filter((r) => r.block_type === 'phase').length
  const stepCount = rows.filter((r) => (r.block_type ?? 'practice') !== 'phase' && r.block_type !== 'module').length
  const p = plan as {
    title: string; summary: string | null; intro: string | null; cover_image: string | null
    drip_interval_days: number | null; window_starts_at: string | null; window_ends_at: string | null
  }
  const checks = readyCheck({
    title: p.title ?? '',
    summary: p.summary,
    intro: p.intro,
    coverImage: p.cover_image,
    phaseCount,
    stepCount,
    dripIntervalDays: p.drip_interval_days ?? 7,
    windowStartsAt: p.window_starts_at,
    windowEndsAt: p.window_ends_at,
  })
  if (readyToPublish(checks)) return { ok: true }
  const missing = checks.find((c) => c.required && !c.ok)
  return { ok: false, error: missing ? `Before it goes live: ${missing.detail}` : 'This Journey is not ready to go live yet.' }
}
