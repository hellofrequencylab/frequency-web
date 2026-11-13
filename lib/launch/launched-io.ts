import 'server-only'
// authz-delegated: the gate is the call site (app/(main)/launch/page.tsx, the signed-in owner's own launch read under their session); the write is a platform ledger row (launch_email_log, service-only by design) and the outbox, the same shape as lib/launch/comeback-io.ts.
// THE LAUNCHED WELCOME, the IO half (LIVE-2064). Sent once, the moment a launch is marked complete (app/(main)/launch/page.tsx
// completeLaunch). Same shape as the come-back runner (lib/launch/comeback-io.ts, ADR-1212): the lifecycle send gate first,
// then the claim (one launch_email_log row per launch and kind, so a second tab cannot send twice), then the send. A skip
// is claimed too, so an opt-out is never re-asked. Best-effort: a failure is logged and never blocks the page.

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { log } from '@/lib/log'
import { readOwner } from './comeback-io'
import { loadInventory } from './inventory-io'
import { buildLaunchedEmail, LAUNCHED_KIND } from './launched-email'
import { nextBestStep } from './next-best-step'
import type { LaunchSnapshot } from './state'

/** Postgres unique_violation: the claim row already exists. */
const UNIQUE_VIOLATION = '23505'

type LaunchedWelcomeResult = 'sent' | 'skipped' | 'already' | 'failed'

export async function sendLaunchedWelcome(launch: LaunchSnapshot, space: { slug: string; name: string }, baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'): Promise<LaunchedWelcomeResult> {
  try {
    const admin = createAdminClient()
    const owner = await readOwner(admin, launch.ownerId, launch.spaceId)
    const gate = owner.email ? await resolveSendGate(launch.ownerId, 'email', 'lifecycle', { email: owner.email }) : null
    if (gate && !gate.allowed && gate.reason === 'error') return 'failed'
    const skipReason = !owner.email ? 'skipped:no_email' : gate && !gate.allowed ? `skipped:${gate.reason}` : null

    const { error: claimError } = await admin.from('launch_email_log').insert({ launch_id: launch.id, trigger_kind: LAUNCHED_KIND, message_ref: skipReason })
    if (claimError) {
      if (claimError.code === UNIQUE_VIOLATION) return 'already'
      log.error('launch.launched_welcome.claim_failed', { launch_id: launch.id, error: claimError.message })
      return 'failed'
    }
    if (skipReason || !owner.email) return 'skipped'

    const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl, profileId: launch.ownerId, category: 'lifecycle' })
    // "Next up" is a bonus: a failed read sends the welcome without it (loadInventory never throws).
    const inventory = await loadInventory(launch.spaceId, launch.ownerId, launch.skippedPhotos, true, { client: admin, personal: false })
    const next = inventory ? nextBestStep(inventory.sections, { niche: launch.niche, intents: launch.intents }) : null
    const payload = buildLaunchedEmail({ to: owner.email, firstName: owner.firstName, spaceName: space.name, slug: space.slug, baseUrl, unsubscribeUrl, next })
    await enqueueEmail({ ...payload, headers: listUnsubscribeHeaders(unsubscribeUrl) }, { dedupeKey: `launch_welcome:${launch.id}` })
    return 'sent'
  } catch (e) {
    log.error('launch.launched_welcome.failed', { launch_id: launch.id, error: e instanceof Error ? e.message : String(e) })
    return 'failed'
  }
}
