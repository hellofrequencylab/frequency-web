// A rollout control, not recipient consent or sender authorization. Read at each boundary.
import { envFlag } from '@/lib/env/string'

export function resourceReceiptEmailEnabled(): boolean {
  return envFlag('LEAD_MAGNET_RESOURCE_EMAIL_ENABLED')
}

/** Legacy EMAIL-049 jobs carry this canonical database dedupe key, not a payload marker. */
export function shouldHoldResourceReceipt(job: { kind: string; dedupe_key?: string | null }): boolean {
  return job.kind === 'email' && typeof job.dedupe_key === 'string'
    && /^lead_magnet_resource:[0-9a-f]{64}:[0-9]+$/.test(job.dedupe_key)
    && !resourceReceiptEmailEnabled()
}
