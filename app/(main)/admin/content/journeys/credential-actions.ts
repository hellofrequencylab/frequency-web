'use server'

import { revalidatePath } from 'next/cache'
import { authorizeAction } from '@/lib/admin/guard'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { decideSubmission } from '@/lib/courses/credentials'
import { sendCredentialEmail } from '@/lib/email'
import { SITE_URL } from '@/lib/site'
import { courseHref } from '@/lib/courses/tracks'
import { log } from '@/lib/log'
import { parseInput, z } from '@/lib/validation'

const decideInput = z.object({
  id: z.string().uuid(),
  decision: z.enum(['certified', 'returned']),
  note: z.string().max(4000).optional(),
})

export type DecideResult = { ok: true } | { ok: false; error: string }

/**
 * Certify or return one Community Book (owner 2026-11-17: "Frequency reviews it for Certified"). Platform
 * reviewers only: Frequency admins, or staff with community write. Certifying issues the Certified credential
 * (lib/courses/credentials.ts) and emails the holder its link; returning emails the reviewer's note. The
 * decision only lands on a submission that is still waiting, so two reviewers cannot both decide it.
 */
export async function decideCommunityBookAction(input: { id: string; decision: 'certified' | 'returned'; note?: string }): Promise<DecideResult> {
  let reviewerId: string
  try {
    reviewerId = (await authorizeAction(await getCallerProfile(), 'admin', 'community')).id
  } catch {
    return { ok: false, error: 'Only Frequency reviewers can decide a Community Book.' }
  }
  const parsed = parseInput(decideInput, input)
  const note = (parsed.note || '').trim() || null
  if (parsed.decision === 'returned' && !note) return { ok: false, error: 'Add a note so they know what to change.' }
  const res = await decideSubmission({ id: parsed.id, decision: parsed.decision, reviewerId, note })
  if (!res) return { ok: false, error: 'Someone already decided this one.' }
  try {
    const admin = createAdminClient()
    const [{ data: plan }, { data: profile }] = await Promise.all([
      admin.from('journey_plans').select('title, slug').eq('id', res.planId).maybeSingle(),
      admin.from('profiles').select('display_name, auth_user_id').eq('id', res.profileId).maybeSingle(),
    ])
    const user = profile?.auth_user_id ? (await admin.auth.admin.getUserById(profile.auth_user_id)).data.user : null
    if (plan && user?.email) {
      const base = SITE_URL.replace(/\/$/, '')
      await sendCredentialEmail({
        to: user.email,
        name: profile?.display_name ?? null,
        courseTitle: plan.title,
        level: parsed.decision === 'certified' ? 'certified' : null,
        credentialUrl: res.credentialId ? `${base}/credentials/${res.credentialId}` : null,
        note,
        retryUrl: `${base}/courses/${plan.slug}/certify`,
        courseUrl: `${base}${courseHref(plan.slug)}`,
      })
    }
  } catch (err) {
    log.error('credentials.decision_email_failed', { error: err instanceof Error ? err.message : String(err) })
  }
  revalidatePath('/admin/content/journeys')
  return { ok: true }
}
