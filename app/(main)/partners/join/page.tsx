import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getPersonaStates, PARTNER_PERSONAS, PERSONA_META, LIVE_PERSONA_STATES } from '@/lib/personas'
import { IndexTemplate } from '@/components/templates'
import { PersonaToggle } from './persona-toggle'

export const dynamic = 'force-dynamic'

// Self-serve partner programs (ADR-163 System 2). A member opts into any combination of
// the partner personas; each activates its own tools (the matrix's partner surfaces).
// Verification + billing for the money-moving programs arrive at launch.
export default async function PartnerProgramsPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/partners/join')
  const states = await getPersonaStates(profileId)

  return (
    <IndexTemplate
      title="Partner programs"
      description="Upgrade packages for what you do beyond membership. Claim any combination. The team verifies each before its tools go live. Billing for the money-moving programs comes at launch."
    >
      <div className="grid max-w-2xl grid-cols-1 gap-3">
        {PARTNER_PERSONAS.map((p) => {
          const meta = PERSONA_META[p]
          const state = states[p]
          // Tools light up only once the persona is LIVE (verified/active) — a bare
          // claim is pending review (P2.7).
          const live = state != null && (LIVE_PERSONA_STATES as readonly string[]).includes(state)
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
                {live && meta.tools.length > 0 ? (
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
            </div>
          )
        })}
      </div>
    </IndexTemplate>
  )
}
