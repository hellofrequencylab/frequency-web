import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import { timeVoteNoticeLine, type TimeVoteChoice } from './time-votes'

// WHO HEARS ABOUT A FIND A TIME ANSWER (LIVE-2531). The Plan's lead (its owner, else whoever made
// it) gets one row in the plain `notifications` table, which the bell and the Inbox read. Nothing
// else: no push, no email, no new notification type in the registry, so this rides the table the
// hub's Inbox work (LIVE-2526) is extending without touching it. The person who answered never
// hears about their own answer.
//
// The admin client writes the row because the recipient is someone other than the caller, the same
// seam lib/notifications/inapp.ts uses. Nothing it writes comes from the browser: the Plan, the
// lead and the answer were all proven on the caller's session first. Best effort: a failed notice
// logs and never undoes the vote.

export async function notifyTimeVote(input: {
  spaceSlug: string
  planId: string
  planTitle: string
  leadProfileId: string | null
  /** The member who answered, or null for an outside collaborator answering by email. */
  voterProfileId: string | null
  /** The name to print when the voter has no profile (an email voter). */
  voterName: string | null
  choice: TimeVoteChoice
  whenLabel: string
}): Promise<boolean> {
  if (!input.leadProfileId || input.leadProfileId === input.voterProfileId) return false
  try {
    const admin = createAdminClient()
    let name = input.voterName
    if (!name && input.voterProfileId) {
      const { data } = await admin.from('profiles').select('display_name').eq('id', input.voterProfileId).maybeSingle()
      name = (data as { display_name: string | null } | null)?.display_name ?? null
    }
    const { error } = await admin.from('notifications').insert({
      recipient_id: input.leadProfileId,
      actor_id: input.voterProfileId,
      type: 'plan.time_vote',
      // The Space slug is an addressable key (lib/notifications/href.ts): the notice lands on the
      // Space, one click from its calendar.
      reference_type: 'space',
      reference_id: input.spaceSlug,
      body: timeVoteNoticeLine(name ?? 'Someone on the team', input.planTitle, input.choice, input.whenLabel),
    })
    if (error) {
      log.warn('calendar.time_vote.notify_failed', { plan_id: input.planId, error: error.message })
      return false
    }
    return true
  } catch (err) {
    log.warn('calendar.time_vote.notify_failed', { plan_id: input.planId, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}
