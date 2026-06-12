'use client'

import Link from 'next/link'
import { History, Zap } from 'lucide-react'
import { FormSection } from '@/components/admin/form-section'
import { StatusChip } from '@/components/admin/status'
import { FlagToggle } from './flag-toggle'
import { setNextStepsEnabled, setAutoPopupsEnabled, setReferralsEnabled, setReferralLanding } from './actions'
import { SITE_URL } from '@/lib/site'
import type { getOnboardingControlsData, OnboardingSwitchEvent } from './load'

const siteHost = SITE_URL.replace(/^https?:\/\//, '')

// Presentational "Onboarding & referral controls" suite for /admin/onboarding-controls:
// three master switches (Next Steps prompts, auto-launching popups, the referral program),
// each with a plain description, its autosaving toggle, and a recent-change audit log.
// The referral reward amount is read-only here (it lives in /admin/gamification). Composed
// from the admin kit (FormSection / StatusChip), semantic tokens only.

type Data = Awaited<ReturnType<typeof getOnboardingControlsData>>

const fmtWhen = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

function AuditLog({ events }: { events: OnboardingSwitchEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
        <History className="h-3.5 w-3.5" aria-hidden /> No changes recorded yet.
      </p>
    )
  }
  return (
    <ul className="mt-3 space-y-2">
      {events.map((e) => (
        <li key={e.id} className="flex items-center gap-3 text-sm">
          <StatusChip tone={e.value ? 'success' : 'danger'} size="sm">
            {e.value ? 'On' : 'Off'}
          </StatusChip>
          <span className="flex-1 truncate text-muted">
            {e.who}
            {e.source !== 'admin' && <span className="text-subtle"> · {e.source}</span>}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-subtle">{fmtWhen(e.createdAt)}</span>
        </li>
      ))}
    </ul>
  )
}

export function OnboardingControlsView({ data }: { data: Data }) {
  const { nextSteps, autoPopups, referrals, nextStepsAudit, autoPopupsAudit, referralsAudit, referralReward, landing } = data

  return (
    <div>
      {/* Next Steps prompts */}
      <FormSection
        title="Next Steps prompts"
        description="The hardcoded activation nudges: the feed onboarding card, the left Next Steps pill and its popup, and the Your Quest next-step block in the rail. Off while the Walkthroughs suite takes over this surface."
      >
        <div className="space-y-1">
          <FlagToggle enabled={nextSteps} ariaLabel="Next Steps prompts" action={setNextStepsEnabled} />
          <AuditLog events={nextStepsAudit} />
        </div>
      </FormSection>

      {/* Auto-launching popups */}
      <FormSection
        title="Auto-launching popups"
        description="The popups that open themselves at a member: the daily check-in, the spotlight tour coachmarks, and the Vera welcome lightbox. Off while we rebuild this around Walkthroughs. On-demand Vera and the app-wide launchers are not affected."
      >
        <div className="space-y-1">
          <FlagToggle enabled={autoPopups} ariaLabel="Auto-launching popups" action={setAutoPopupsEnabled} />
          <AuditLog events={autoPopupsAudit} />
        </div>
      </FormSection>

      {/* Referral program */}
      <FormSection
        title="Referral program"
        description="Whether a friend's QR or link scan credits the referrer. Turn it off to stop new referral credit cleanly; existing rewards stay. On by default."
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <FlagToggle enabled={referrals} ariaLabel="Referral program" action={setReferralsEnabled} />
            <AuditLog events={referralsAudit} />
          </div>
          <div className="rounded-xl border border-border bg-surface-elevated/50 px-3 py-2.5">
            <p className="flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-text">
                <Zap className="h-3.5 w-3.5 text-primary" aria-hidden /> Reward when a referral is accepted
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums font-bold text-text">
                  {referralReward.amount != null ? `${referralReward.amount.toLocaleString()} zaps` : 'Not set'}
                </span>
                {!referralReward.active && (
                  <StatusChip tone="warning" size="sm">
                    Paused
                  </StatusChip>
                )}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted">
              The amount is read-only here. Edit it in{' '}
              <Link href="/admin/gamification" className="font-semibold text-primary-strong hover:text-primary-hover">
                Gamification
              </Link>
              .
            </p>
          </div>
        </div>
      </FormSection>

      {/* Referral landing destination */}
      <FormSection
        title="Referral landing"
        description="Where every personal QR code lands a scanner. A same-site path (default /, the splash). Saving retargets all existing codes too — the printed image never changes."
      >
        <form action={setReferralLanding} className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-subtle">{siteHost}</span>
          <input
            name="path"
            defaultValue={landing}
            spellCheck={false}
            placeholder="/"
            className="w-40 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Save
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Must start with <code className="rounded bg-surface-elevated px-1">/</code> (same-site only). For example,{' '}
          <code className="rounded bg-surface-elevated px-1">/</code> for the splash or{' '}
          <code className="rounded bg-surface-elevated px-1">/welcome</code> for a campaign page.
        </p>
      </FormSection>
    </div>
  )
}
