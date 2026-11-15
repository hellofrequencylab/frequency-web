import 'server-only'
// authz-delegated: captureUnlock verifies the signed lead_magnet token and successful Space-scoped
// capture before calling this helper. No public action here and no campaign/nurture enrollment.
import { createHash } from 'node:crypto'
import { enqueueEmail } from '@/lib/email'
import { isSuppressed } from '@/lib/suppression'
import { claimOnce } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { buildLeadMagnetResourceEmail, resourceEmailUrl } from './lead-magnet-resource-email'

/** One requested copy per address/Space/hour across ALL resources. The durable hourly key still
 * bounds the relay when Redis is absent. Inline access never depends on the email being queued. */
export async function sendLeadMagnetResource(input: {
  spaceId: string; email: string; resourceUrl: string; label?: string | null; now?: Date
}): Promise<'queued' | 'skipped' | 'limited' | 'failed'> {
  try {
    const email = input.email.trim().toLowerCase()
    const resourceUrl = resourceEmailUrl(input.resourceUrl)
    if (!input.spaceId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !resourceUrl) return 'skipped'
    if (await isSuppressed(email, input.spaceId)) return 'skipped'
    const addressKey = createHash('sha256').update(JSON.stringify([input.spaceId, email])).digest('hex')
    if (!(await claimOnce(`lead_magnet_resource:${addressKey}`, 3600))) return 'limited'
    const hour = Math.floor((input.now ?? new Date()).getTime() / 3_600_000)
    if (!Number.isFinite(hour)) return 'skipped'
    await enqueueEmail(buildLeadMagnetResourceEmail({ to: email, resourceUrl, label: input.label }), {
      lane: 'transactional', dedupeKey: `lead_magnet_resource:${addressKey}:${hour}`,
    })
    return 'queued'
  } catch {
    // No recipient, bearer resource URL, raw provider error or token enters logs.
    log.error('crm.lead_magnet_resource.failed', { space_id: input.spaceId, error: 'resource_receipt_unavailable' })
    return 'failed'
  }
}
