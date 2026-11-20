import 'server-only'
// authz-delegated: called only from the approver-gated Email Studio senders (lib/email-studio/send.ts) with the service
// client; lifecycle_send_log is a platform ledger with no per-user resource to bind to.
// EMAIL-084 (Daniel, 2026-11-19, "One per 7 days"): at most one Email Studio campaign or newsletter reaches a person per
// rolling 7 days, and it also counts toward the 1 a day, 3 a week lifecycle cap (lib/lifecycle/cap.ts). A sender calls
// reserveCampaignSend AFTER the send gate allows the person and right before it queues them. Anything but a fresh
// reservation skips the person: 'capped' (they had one this week), 'error' (fail closed), 'duplicate' (this campaign
// already reserved them, so a second send would repeat it). Dark with LIFECYCLE_CAP_ENABLED off, like every cap sender.

import type { SupabaseClient } from '@supabase/supabase-js'
import { releaseLifecycleSend, reserveLifecycleSend } from '@/lib/lifecycle/cap-io'

export const CAMPAIGN_CAP_KIND = 'campaign'

/** One claim per campaign per address. */
export function campaignCapKey(campaignId: string, email: string): string {
  return `campaign:${campaignId}:${email.trim().toLowerCase()}`
}

/** True when this person may get this campaign now (the slot is reserved). */
export async function reserveCampaignSend(
  admin: SupabaseClient,
  input: { campaignId: string; email: string; profileId?: string | null },
): Promise<boolean> {
  const r = await reserveLifecycleSend(admin, {
    recipient: input.email,
    profileId: input.profileId ?? null,
    kind: CAMPAIGN_CAP_KIND,
    dedupeKey: campaignCapKey(input.campaignId, input.email),
  })
  return r === 'reserved'
}

/** Give back reservations whose email never got queued (a failed enqueue or broadcast). */
export async function releaseCampaignSends(admin: SupabaseClient, campaignId: string, emails: readonly string[]): Promise<void> {
  for (const email of emails) await releaseLifecycleSend(admin, campaignCapKey(campaignId, email))
}
