// The trust EMITTERS for marketplace, moderation and verification (LIVE-679, ADR-247). Each one is a
// thin, BEST-EFFORT call into the source adapter: trust never blocks a sale, a moderation decision or
// a verification, so every emit swallows its own failure and logs it. Each carries an idempotency key
// built from the record it is about, so a retried webhook or a double click counts once.

import type { SupabaseClient } from '@supabase/supabase-js'
import { trustSource } from './index'

async function emit(source: string, input: Parameters<ReturnType<typeof trustSource>['signal']>[0]): Promise<void> {
  try {
    await trustSource(source).signal(input)
  } catch (error) {
    console.error('[trust] emit failed', { source, signalType: input.signalType, error })
  }
}

/** A commerce order closed as delivered or completed: credit to each member who sold on it (one on a
 *  plain order, one per member-owned share on a split cart), once per order and seller. */
export async function emitDealCompleted(orderId: string, sellerIds: readonly (string | null | undefined)[]): Promise<void> {
  for (const sellerId of new Set(sellerIds.filter((id): id is string => !!id))) {
    await emit('marketplace', {
      profileId: sellerId,
      signalType: 'deal_completed',
      idempotencyKey: `deal-completed:${orderId}:${sellerId}`,
      meta: { orderId },
    })
  }
}

/** A chargeback on a commerce order was lost: a penalty to the member who sold it. */
export async function emitDisputeLost(order: { id: string; owner_profile_id: string | null }, disputeId: string): Promise<void> {
  if (!order.owner_profile_id) return
  await emit('marketplace', {
    profileId: order.owner_profile_id,
    signalType: 'dispute_lost',
    idempotencyKey: `dispute-lost:${disputeId}`,
    meta: { orderId: order.id, disputeId },
  })
}

/** The member a report is ABOUT: the author of a post, comment or Dispatch, the signer of a guestbook
 *  note, the host of an event, or the member reported directly. Null when it cannot be read. */
export async function reportedProfileId(
  admin: SupabaseClient,
  report: { target_type: string; target_id: string },
): Promise<string | null> {
  const one = async (table: string, column: string): Promise<string | null> => {
    const { data } = await admin.from(table).select(column).eq('id', report.target_id).maybeSingle()
    const value = (data as Record<string, unknown> | null)?.[column]
    return typeof value === 'string' ? value : null
  }
  switch (report.target_type) {
    case 'post':
    case 'comment':
      return one('posts', 'author_id')
    case 'dispatch':
      return one('dispatches', 'author_id')
    case 'guestbook':
      return one('spotlight_guestbook', 'signer_profile_id')
    case 'event':
      return one('events', 'host_id')
    case 'member':
      return report.target_id
    default:
      return null
  }
}

/** A moderator upheld a report: a penalty to the member it was about, once per report. */
export async function emitReportUpheld(
  admin: SupabaseClient,
  report: { id: string; target_type: string; target_id: string },
): Promise<void> {
  let profileId: string | null = null
  try {
    profileId = await reportedProfileId(admin, report)
  } catch (error) {
    console.error('[trust] reported member unreadable', { reportId: report.id, error })
  }
  if (!profileId) return
  await emit('moderation', {
    profileId,
    signalType: 'report_upheld',
    idempotencyKey: `report-upheld:${report.id}`,
    meta: { reportId: report.id, targetType: report.target_type },
  })
}

/** A moderator suspended a member from a report: a penalty, once per report. */
export async function emitMemberSuspended(profileId: string, reportId: string): Promise<void> {
  await emit('moderation', {
    profileId,
    signalType: 'suspended',
    idempotencyKey: `suspended:${reportId}`,
    meta: { reportId },
  })
}

/** A Space's Non Profit verification was approved: credit to the member who submitted it. */
export async function emitOrgVerified(verification: { id: string; submittedBy: string | null; spaceId: string }): Promise<void> {
  if (!verification.submittedBy) return
  await emit('verification', {
    profileId: verification.submittedBy,
    signalType: 'org_verified',
    idempotencyKey: `org-verified:${verification.id}`,
    meta: { spaceId: verification.spaceId },
  })
}
