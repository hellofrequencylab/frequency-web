import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import { buildTimeConfirmedEmail, enqueueEmail } from '@/lib/email'
import { formatEventWhen } from '@/lib/time/zone'
import { keepPencilDateRow } from './entries-store'
import { listPlanTimeOptionRows, listTimeVoteRows } from './time-votes-store'
import { buildTimeInviteIcs } from './time-confirm-ics'

// CONFIRM A FIND A TIME DATE (EMAIL-093). The team picks the winner and two things happen at once:
// the winning candidate becomes the Plan's date and the other options are released (the one
// statement keep_pencil_date already runs, SECURITY INVOKER, so the caller's RLS decides and a
// released date stays recoverable), and every person who answered, the Plan's lead too, is emailed
// the date with an .ics invite attached, members and outside collaborators (EMAIL-092) alike.
//
// The write runs on the caller's own session. The admin client only looks up members' email
// addresses (they live on auth.users), the plan-notify seam; nothing it reads comes from the browser.
// Email is best effort after the date is set: a failed send is logged and counted, never undone.

interface ConfirmTimeResult {
  /** How many other candidate dates were released. */
  released: number
  /** How many invites were queued. */
  invited: number
  whenLabel: string
}

async function memberRecipient(profileId: string): Promise<{ email: string; name: string | null } | null> {
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('display_name, auth_user_id').eq('id', profileId).maybeSingle()
  if (!profile?.auth_user_id) return null
  const {
    data: { user },
  } = await admin.auth.admin.getUserById(profile.auth_user_id)
  return user?.email ? { email: user.email.toLowerCase(), name: profile.display_name?.trim() || null } : null
}

export async function confirmTimeOption(input: {
  spaceId: string
  spaceSlug: string
  spaceName: string
  planId: string
  planTitle: string
  leadProfileId: string | null
  entryId: string
}): Promise<{ data: ConfirmTimeResult } | { error: string }> {
  const rows = await listPlanTimeOptionRows(input.spaceId, input.planId)
  const winner = rows.find((r) => r.id === input.entryId)
  if (!winner) return { error: 'That date is no longer an option.' }
  // Read the answers BEFORE the release: they are the invite list.
  const votes = await listTimeVoteRows(rows.map((r) => r.id))
  const kept = await keepPencilDateRow(input.spaceId, winner.id)
  if ('error' in kept) return kept

  const whenLabel = formatEventWhen(winner.starts_at, winner.time_zone, { style: winner.all_day ? 'date' : 'full' })
  const calendarPath = `/spaces/${input.spaceSlug}/settings/calendar`
  // The .ics travels as a base64 attachment, the same way booking confirmations carry theirs.
  const ics = buildTimeInviteIcs({
    entryId: winner.id,
    title: input.planTitle,
    startsAt: winner.starts_at,
    endsAt: winner.ends_at,
    timeZone: winner.time_zone,
    allDay: winner.all_day,
    spaceName: input.spaceName,
    location: winner.location,
  })
  const invite = { filename: 'invite.ics', content: Buffer.from(ics, 'utf8').toString('base64') }

  const members = new Set<string>()
  if (input.leadProfileId) members.add(input.leadProfileId)
  const outside = new Map<string, string | null>()
  for (const v of votes) {
    if (v.voter_profile_id) members.add(v.voter_profile_id)
    else if (v.voter_email) outside.set(v.voter_email.toLowerCase(), v.voter_name)
  }

  const sent = new Set<string>()
  let invited = 0
  const send = async (to: string, name: string | null, member: boolean) => {
    if (sent.has(to)) return
    sent.add(to)
    try {
      await enqueueEmail(
        buildTimeConfirmedEmail({
          to,
          recipientName: name,
          spaceName: input.spaceName,
          planTitle: input.planTitle,
          whenLabel,
          invite,
          calendarPath: member ? calendarPath : null,
        }),
        { dedupeKey: `time-confirmed:${winner.id}:${to}` },
      )
      invited += 1
    } catch (err) {
      log.warn('calendar.time_confirm.invite_failed', { plan_id: input.planId, error: err instanceof Error ? err.message : String(err) })
    }
  }
  for (const id of members) {
    const who = await memberRecipient(id).catch(() => null)
    if (who) await send(who.email, who.name, true)
  }
  for (const [email, name] of outside) await send(email, name, false)

  return { data: { released: kept.data, invited, whenLabel } }
}
