// The operator lifecycle send (LIVE-1141): a Space owner gets the day 1, 3 and 7 emails from lib/marketing/operator-emails.
// Runs inside the daily lifecycle-triggers cron with that cron's own service-role client, so it adds no admin client of its
// own. Idempotent twice over: a send is only due in the day after its mark,
// and the outbox dedupes on the Space and the day. Every send passes the lifecycle send gate (preference, consent and
// suppression in one decision), and one owner's failure never stops the next.
import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { buildOperatorEmail, operatorFocus, OPERATOR_DAYS, type OperatorDay } from '@/lib/marketing/operator-emails'
import { log } from '@/lib/log'

const DAY_MS = 86_400_000
/** A send is due for the day after its mark. The cron runs daily, so each Space lands in exactly one window per email,
 *  and the outbox key stops a re-run inside it. */
const GRACE_DAYS = 1

type SpaceRow = {
  id: string
  name: string | null
  slug: string | null
  type: string | null
  mode_variant: string | null
  owner_profile_id: string | null
  created_at: string
}

/** The one email due for a Space of this age, or null. Pure. */
export function operatorDayDue(ageDays: number): OperatorDay | null {
  for (const day of [...OPERATOR_DAYS].reverse()) {
    if (ageDays >= day && ageDays < day + GRACE_DAYS) return day
  }
  return null
}

type OperatorLifecycleResult = { sent: number; skipped: number; failed: number }

export async function sendOperatorLifecycle(
  admin: SupabaseClient,
  opts: { limit: number; now?: Date },
): Promise<OperatorLifecycleResult> {
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - (Math.max(...OPERATOR_DAYS) + GRACE_DAYS) * DAY_MS).toISOString()
  const result: OperatorLifecycleResult = { sent: 0, skipped: 0, failed: 0 }
  const { data, error } = await admin
    .from('spaces')
    .select('id, name, slug, type, mode_variant, owner_profile_id, created_at')
    .eq('status', 'active')
    .neq('type', 'root')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(opts.limit)
  if (error) {
    log.error('cron.operator_lifecycle.fetch_failed', { error: error.message })
    result.failed++
    return result
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  for (const space of (data ?? []) as SpaceRow[]) {
    const day = operatorDayDue((now.getTime() - new Date(space.created_at).getTime()) / DAY_MS)
    if (!day || !space.owner_profile_id || !space.slug) {
      result.skipped++
      continue
    }
    try {
      const { data: profileData } = await admin
        .from('profiles')
        .select('display_name, auth_user_id')
        .eq('id', space.owner_profile_id)
        .maybeSingle()
      const profile = profileData as { display_name: string | null; auth_user_id: string | null } | null
      if (!profile?.auth_user_id) {
        result.skipped++
        continue
      }
      const { data: userData } = await admin.auth.admin.getUserById(profile.auth_user_id)
      const email = userData?.user?.email
      if (!email) {
        result.skipped++
        continue
      }
      if (!(await resolveSendGate(space.owner_profile_id, 'email', 'lifecycle', { email })).allowed) {
        result.skipped++
        continue
      }
      await enqueueEmail(
        buildOperatorEmail({
          day,
          focus: operatorFocus(space.type, space.mode_variant),
          to: email,
          greetingName: profile.display_name,
          spaceName: space.name ?? 'your Space',
          spaceSlug: space.slug,
          baseUrl: appUrl,
        }),
        { dedupeKey: `operator_lifecycle:${space.id}:${day}` },
      )
      result.sent++
    } catch (e) {
      result.failed++
      log.error('cron.operator_lifecycle.send_failed', { space_id: space.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}
