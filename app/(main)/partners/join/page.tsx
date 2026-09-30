import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import {
  getPersonaStates,
  PARTNER_PERSONAS,
  PERSONA_META,
  LIVE_PERSONA_STATES,
  isMoneyPersona,
  awaitingPayout,
  PERSONA_PAYOUT_HREF,
} from '@/lib/personas'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { payoutPrompt } from '@/lib/billing/payout-prompt'
import { PayoutPromptCard } from '@/components/billing/payout-prompt-card'
import { IndexTemplate } from '@/components/templates'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { PersonaToggle } from './persona-toggle'

export const dynamic = 'force-dynamic'

// Self-serve partner programs (ADR-163 System 2). A member opts into any combination of
// the partner personas; each activates its own tools (the matrix's partner surfaces).
// A verified money program (Practitioner, Organization) goes Active only once the member's
// payout account can take money (LIVE-696), so that card carries the shared payout prompt.
export default async function PartnerProgramsPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/partners/join')
  const states = await getPersonaStates(profileId)

  // The payout account is read only when a verified money program could be waiting on it.
  const moneyVerified = PARTNER_PERSONAS.some((p) => isMoneyPersona(p) && states[p] === 'verified')
  const [connect, live] = moneyVerified
    ? await Promise.all([getConnectStatus(profileId), payoutsLive()])
    : [null, false]
  const payout = connect ? { accountId: connect.accountId, chargesEnabled: connect.chargesEnabled } : null
  const prompt = connect
    ? payoutPrompt({ channels: [], status: connect, payoutsLive: live, relation: 'self' })
    : null

  const hero = await resolveIndexHero('/partners/join')

  return (
    <IndexTemplate
      {...hero}
      title="Partner programs"
      description="Upgrade packages for what you do beyond membership. Claim any combination. The team verifies each before its tools go live. Practitioner and Organization go Active once you add a payout account."
    >
      <div className="grid max-w-2xl grid-cols-1 gap-3">
        {PARTNER_PERSONAS.map((p) => {
          const meta = PERSONA_META[p]
          const state = states[p]
          // Tools light up only once the persona is LIVE (verified/active) — a bare
          // claim is pending review (P2.7).
          const lit = state != null && (LIVE_PERSONA_STATES as readonly string[]).includes(state)
          const needsPayout = state != null && awaitingPayout(p, state, payout)
          return (
            <div key={p} className="rounded-card border border-border bg-surface p-5 lift-1">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-bg text-lead">
                  {meta.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-body-sm font-bold text-text">{meta.label}</h3>
                  <p className="text-meta text-subtle">{meta.tagline}</p>
                  <p className="mt-1.5 text-body-sm leading-relaxed text-muted">{meta.unlocks}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {lit && meta.tools.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {meta.tools.map((t) => (
                      <Link
                        key={t.href}
                        href={t.href}
                        className="inline-flex items-center gap-1 rounded-lg bg-surface-elevated px-2.5 py-1 text-meta font-semibold text-text transition-colors hover:bg-primary-bg hover:text-primary-strong"
                      >
                        {t.label}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <span />
                )}
                <PersonaToggle persona={p} state={state} />
              </div>
              {needsPayout && (
                <div className="mt-4 space-y-3">
                  <p className="text-body-sm leading-relaxed text-muted">
                    {meta.label} goes Active once you have a payout account that can take money. It
                    lives in{' '}
                    <Link href={PERSONA_PAYOUT_HREF} className="font-semibold text-primary-strong hover:underline">
                      Billing settings
                    </Link>
                    , and it is the same account every sale you make pays into.
                  </p>
                  <PayoutPromptCard prompt={prompt} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </IndexTemplate>
  )
}
