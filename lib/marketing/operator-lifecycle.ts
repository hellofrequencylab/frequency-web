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

type OperatorSpaceRow = {
  id: string
  name: string | null
  slug: string | null
  type: string | null
  mode_variant: string | null
  preferences?: { profileData?: { kind?: string | null; category?: string | null } | null } | null
  owner_profile_id: string | null
  created_at: string
}

/** The one email due for a Space of this age, or null. Pure. */
export function operatorDayDue(ageDays: number): OperatorDay | null {
  for (const day of [...OPERATOR_DAYS].reverse()) {
    if (day === 0) continue // day 0 is sent when the Space is created, not by the daily run
    if (ageDays >= day && ageDays < day + GRACE_DAYS) return day
  }
  return null
}

type OperatorLifecycleResult = { sent: number; skipped: number; failed: number }

/** One email for one Space, through the send gate. 'skipped' when there is nowhere to send or the owner opted out;
 *  throws only on a real failure, so the caller can count it and move on. */
export async function sendOperatorEmailForSpace(
  admin: SupabaseClient,
  space: OperatorSpaceRow,
  day: OperatorDay,
): Promise<'sent' | 'skipped'> {
  if (!space.owner_profile_id || !space.slug) return 'skipped'
  const { data: profileData } = await admin
    .from('profiles')
    .select('display_name, auth_user_id')
    .eq('id', space.owner_profile_id)
    .maybeSingle()
  const profile = profileData as { display_name: string | null; auth_user_id: string | null } | null
  if (!profile?.auth_user_id) return 'skipped'
  const { data: userData } = await admin.auth.admin.getUserById(profile.auth_user_id)
  const email = userData?.user?.email
  if (!email) return 'skipped'
  if (!(await resolveSendGate(space.owner_profile_id, 'email', 'lifecycle', { email })).allowed) return 'skipped'
  const pd = space.preferences?.profileData
  const kind = pd?.kind ?? pd?.category
  // A Network is a Space with member Spaces; only the later emails care, so the count is read just for them.
  const hasChapters = day === 0 ? false : ((await admin.from('spaces').select('id', { count: 'exact', head: true }).eq('parent_id', space.id)).count ?? 0) > 0
  await enqueueEmail(
    buildOperatorEmail({
      day,
      focus: operatorFocus(space.type, space.mode_variant, { kind: kind ?? null, hasChapters }),
      to: email,
      greetingName: profile.display_name,
      spaceName: space.name ?? 'your Space',
      spaceSlug: space.slug,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com',
    }),
    { dedupeKey: `operator_lifecycle:${space.id}:${day}` },
  )
  return 'sent'
}

export async function sendOperatorLifecycle(
  admin: SupabaseClient,
  opts: { limit: number; now?: Date },
): Promise<OperatorLifecycleResult> {
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - (Math.max(...OPERATOR_DAYS) + GRACE_DAYS) * DAY_MS).toISOString()
  const result: OperatorLifecycleResult = { sent: 0, skipped: 0, failed: 0 }
  const { data, error } = await admin
    .from('spaces')
    .select('id, name, slug, type, mode_variant, preferences, owner_profile_id, created_at')
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
  for (const space of (data ?? []) as OperatorSpaceRow[]) {
    const day = operatorDayDue((now.getTime() - new Date(space.created_at).getTime()) / DAY_MS)
    if (!day) {
      result.skipped++
      continue
    }
    try {
      result[await sendOperatorEmailForSpace(admin, space, day)]++
    } catch (e) {
      result.failed++
      log.error('cron.operator_lifecycle.send_failed', { space_id: space.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}
