import Link from 'next/link'
import { requireAdmin } from '@/lib/admin/guard'
import { createClient } from '@/lib/supabase/server'
import { SequenceRunner } from '@/components/onboarding/sequence-runner'
import { previewSequenceFor } from '@/lib/onboarding/example-sequences'
import { resolveOnboardingSequence } from '@/lib/onboarding/resolve-onboarding-sequence'
import { PERSONA_ORDER, PERSONAS, isPersonaId } from '@/lib/onboarding/personas'
import type { SequenceStepContext } from '@/lib/onboarding/step-registry'

// STAFF-ONLY preview of the onboarding SEQUENCE ENGINE (docs/LOOM-PLATFORM.md §3, ADR-502). It walks
// any resolved SequenceDef through the real SequenceRunner in `preview` mode, so nothing is written
// and the live acquisition funnel (/onboarding/beta) is untouched. Switch persona to see the engine
// pick a DIFFERENT flow: a coach (practitioner) gets the guide flow, everyone else the default the
// owner likes. This proves "different funnel -> different flow" before any production cutover.
//
// Two resolvers are shown side by side:
//   • what RENDERS: previewSequenceFor(persona) over the code example catalog (deterministic, no DB).
//   • what PRODUCTION would serve: resolveOnboardingSequence({persona}) (the real DB-backed resolver,
//     which layers PUBLISHED Loom kind='sequence' assets on top of the code default). Giving it a
//     real caller here also closes the "dormant resolver" gap.
//
// Gate: requireAdmin('janitor') (staff axis). /onboarding/* is noindex (app/onboarding/layout.tsx).
export const dynamic = 'force-dynamic'

export default async function SequencePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>
}) {
  await requireAdmin('janitor')

  const { persona: personaParam } = await searchParams
  const persona = isPersonaId(personaParam) ? personaParam : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: regions } = await supabase
    .from('nexus_regions')
    .select('id, name')
    .eq('depth', 0)
    .order('name')

  const ctx: SequenceStepContext = {
    userId: user?.id ?? 'preview',
    userEmail: user?.email ?? '',
    initialHandle: '',
    regions: regions ?? [],
  }

  // What renders (deterministic code catalog) + what production would serve (real DB resolver).
  const def = previewSequenceFor(persona)
  const prodDef = await resolveOnboardingSequence({ persona }).catch(() => null)

  const options: { id: string | null; label: string }[] = [
    { id: null, label: 'Default (no persona)' },
    ...PERSONA_ORDER.map((id) => ({ id: id as string, label: PERSONAS[id].label })),
  ]

  return (
    <div className="relative">
      <div className="sticky top-0 z-50 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="font-medium text-ink">Sequence preview</span>
            <span>Staff only. Nothing is saved.</span>
          </div>
          <nav className="flex flex-wrap gap-1.5" aria-label="Preview a persona flow">
            {options.map((o) => {
              const active = o.id === persona
              const href = o.id ? `?persona=${o.id}` : '?'
              return (
                <Link
                  key={o.id ?? 'default'}
                  href={href}
                  className={
                    active
                      ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-on-primary'
                      : 'rounded-full border border-border px-3 py-1 text-xs text-ink hover:bg-surface-elevated'
                  }
                  aria-current={active ? 'true' : undefined}
                >
                  {o.label}
                </Link>
              )
            })}
          </nav>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              Rendering: <span className="font-medium text-ink">{def.label}</span>
            </span>
            <span>
              Production resolver:{' '}
              <span className="font-medium text-ink">{prodDef?.label ?? 'default'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* `key` remounts the runner when the resolved flow changes, so switching persona restarts it. */}
      <SequenceRunner key={def.key} def={def} ctx={ctx} preview />
    </div>
  )
}
