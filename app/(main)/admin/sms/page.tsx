import { MessageSquare } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { FormSection } from '@/components/admin/form-section'
import { Banner, StatusChip } from '@/components/admin/status'
import { createAdminClient } from '@/lib/supabase/admin'
import { smsEnabledFlag } from '@/lib/platform-flags'
import { isSmsProvisioned } from '@/lib/comms/sms'
import { SmsToggle } from './sms-toggle'

// The operator console for the SMS channel ("text the group", ADR-256) — the single
// hardest-gated channel we run. SMS only ever sends when BOTH are true: the A2P 10DLC
// legal registration is set (env secrets, off this page by design) AND the platform
// switch below is on. This page shows the legal registration STATUS as plain booleans
// (never the secret values), owns the platform switch, and reports live consent counts.
// SETTINGS template (ADR-233 §3.8): annotated FormSection (left copy, right control).
// Janitor or platform-domain staff, same gate as the AI master switch.
export const dynamic = 'force-dynamic'

// sms_consent is a genuinely-new table (not in database.types yet) — read it through the
// untyped admin client, the same repo cast convention as lib/comms/sms.ts (ADR-246).
function untypedDb(): SupabaseClient {
  return createAdminClient()
}

interface ConsentCounts {
  consented: number
  optedOut: number
  pending: number
  people: number
}

// Live SMS consent picture: the CURRENT state per member is their latest ledger row
// (append-only, latest wins). We reduce to one status per profile so a member who opted
// in then texted STOP counts once, as opted-out. Fail-soft: any read error yields zeros
// rather than breaking the console.
async function smsConsentCounts(): Promise<ConsentCounts> {
  try {
    const { data } = await untypedDb()
      .from('sms_consent')
      .select('profile_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10000)
    const rows = (data ?? []) as { profile_id: string; status: string }[]
    const latest = new Map<string, string>()
    for (const r of rows) if (!latest.has(r.profile_id)) latest.set(r.profile_id, r.status)
    let consented = 0
    let optedOut = 0
    let pending = 0
    for (const status of latest.values()) {
      if (status === 'opted_in') consented += 1
      else if (status === 'opted_out') optedOut += 1
      else pending += 1 // pending_verification / verification_failed
    }
    return { consented, optedOut, pending, people: latest.size }
  } catch {
    return { consented: 0, optedOut: 0, pending: 0, people: 0 }
  }
}

// One env registration flag, shown as a plain boolean — NEVER the secret value.
function EnvFlagRow({ label, set }: { label: string; set: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/70 py-2.5 first:border-t-0 first:pt-0">
      <span className="text-sm text-text">{label}</span>
      <StatusChip tone={set ? 'success' : 'neutral'} size="sm">
        {set ? 'Set' : 'Not set'}
      </StatusChip>
    </div>
  )
}

export default async function AdminSmsPage() {
  await requireAdmin('janitor', { staff: 'platform' })

  const [enabled, consent] = await Promise.all([smsEnabledFlag(), smsConsentCounts()])

  // Legal registration status. Booleans only — the console reads whether each secret is
  // present, never its value.
  const provisioningEnabled = process.env.SMS_PROVISIONING_ENABLED === 'true'
  const brandSet = !!process.env.SMS_A2P_BRAND_ID
  const campaignSet = !!process.env.SMS_A2P_CAMPAIGN_ID
  const serviceSet = !!process.env.TWILIO_MESSAGING_SERVICE_SID
  const provisioned = isSmsProvisioned()

  return (
    <AdminTemplate
      title="SMS"
      eyebrow="Operations"
      icon={MessageSquare}
      description="Turn the SMS channel on or off. Texting the group is the hardest-gated channel we run, so it only sends when the legal A2P 10DLC registration is set AND this switch is on."
    >
      <AdminSection>
        {!provisioned && (
          <Banner tone="info" title="SMS is not registered yet">
            The A2P 10DLC brand and campaign are not set in this environment, so no text can send
            regardless of the switch below. Those IDs are legal registration secrets and stay in the
            environment, not on this page. This switch is the second lock: once registration is live,
            it decides whether the channel is open.
          </Banner>
        )}

        <FormSection
          title="Platform SMS"
          description="When on, the platform may send texts to members who have given express written consent (and only inside quiet hours). When off, nothing texts, anywhere. This switch is required in addition to the legal A2P 10DLC registration below."
        >
          <SmsToggle enabled={enabled} provisioned={provisioned} />
        </FormSection>

        <FormSection
          title="Legal registration"
          description="The A2P 10DLC brand and campaign (and the Twilio Messaging Service they map to) are registration secrets, so they live in the environment, never here. This is a read-only status of whether each one is set."
        >
          <div>
            <EnvFlagRow label="Provisioning enabled" set={provisioningEnabled} />
            <EnvFlagRow label="A2P 10DLC brand" set={brandSet} />
            <EnvFlagRow label="A2P 10DLC campaign" set={campaignSet} />
            <EnvFlagRow label="Twilio Messaging Service" set={serviceSet} />
            <div className="mt-3 flex items-center justify-between gap-4 border-t border-border pt-3">
              <span className="text-sm font-semibold text-text">Registration complete</span>
              <StatusChip tone={provisioned ? 'success' : 'warning'}>
                {provisioned ? 'Ready' : 'Not ready'}
              </StatusChip>
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Consent"
          description="SMS is opt-in only. These counts are the current state per member (their latest consent record wins), so a member who texted STOP shows as opted out."
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="text-2xl font-bold tabular-nums text-text">{consent.consented.toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-muted">Opted in</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="text-2xl font-bold tabular-nums text-text">{consent.optedOut.toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-muted">Opted out</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="text-2xl font-bold tabular-nums text-text">{consent.pending.toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-muted">Pending or failed</p>
            </div>
          </div>
        </FormSection>
      </AdminSection>
    </AdminTemplate>
  )
}
