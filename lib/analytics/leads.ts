import 'server-only'
import { readGaIdentity } from './ga-client-id'
import { track } from './track'

type VerifiedLeadSource = 'create_space' | 'beta_induction' | 'feature_funnel' | 'event_rsvp' | 'event_ticket'
interface LeadCaptureOptions {
  /** Explicit null is for background/webhook captures with no consenting browser context. */
  gaIdentity?: { clientId: string; sessionId: string | null } | null
}

/** Call only after the lead-capture RPC confirms a durable row. Never count a form click. */
export async function recordVerifiedLeadCapture(leadId: string, source: VerifiedLeadSource, options: LeadCaptureOptions = {}): Promise<void> {
  if (!leadId || typeof leadId !== 'string') return
  try {
    const gaIdentity = Object.prototype.hasOwnProperty.call(options, 'gaIdentity') ? options.gaIdentity ?? null : await readGaIdentity()
    await track('lead.captured', { source }, null, {
      idempotencyKey: `lead.captured:${leadId}`,
      gaIdentity,
    })
  } catch {
    // Analytics must never turn a successful save into a failed save.
  }
}
