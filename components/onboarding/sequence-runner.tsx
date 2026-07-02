'use client'

import { useCallback, useMemo, useState } from 'react'
import { WizardShell } from '@/components/templates'
import { completeOnboarding } from '@/app/onboarding/actions'
import {
  getStepDef,
  type OnboardingDraft,
  type SequenceStepContext,
  type StepControls,
} from '@/lib/onboarding/step-registry'
import type { SequenceDef } from '@/lib/onboarding/sequence-schema'
import type { AppGate } from '@/lib/apps/types'

// The sequence runner — walks any SequenceDef's steps inside WizardShell. It is the generalisation
// of app/onboarding/form.tsx: the shell renders the chrome, each registered step supplies its
// fields + footer state, and the terminal step's `action` key is resolved to the real server
// action HERE (the completeOnboarding side-effect is never reimplemented). Config → code bindings:
// step `type` → getStepDef, step `action` → SEQUENCE_ACTIONS.
//
// ADDITIVE: the live /onboarding route still uses OnboardingForm; the production cutover is a
// separate, verified step. The staff-only /onboarding/sequence-preview route renders this in
// `preview` mode (no completeOnboarding side-effect) so a flow can be walked and verified first.

/** The terminal actions a sequence may name by key (Layer-1 binding; do not reimplement). */
const SEQUENCE_ACTIONS: Record<string, (draft: OnboardingDraft) => Promise<unknown>> = {
  completeOnboarding: (d) =>
    completeOnboarding({
      displayName: d.displayName.trim(),
      handle: d.handle,
      bio: d.bio,
      avatarUrl: d.avatarUrl,
      regionId: d.regionId,
    }),
}

export function SequenceRunner({
  def,
  ctx,
  gatePasses,
  preview = false,
}: {
  def: SequenceDef
  ctx: SequenceStepContext
  /** Evaluate a per-step AppGate. Omitted ⇒ every gated step is shown (gates enforced upstream). */
  gatePasses?: (gate: AppGate) => boolean
  /** Preview mode (staff sequence preview): the terminal step does NOT fire completeOnboarding, so
   *  walking a flow never mutates the previewer's profile. It shows a "would complete here" panel. */
  preview?: boolean
}) {
  // Layer-3 gating: hide steps the viewer can't pass. Default sequence carries no gates.
  const steps = useMemo(
    () => def.steps.filter((s) => !s.gate || (gatePasses ? gatePasses(s.gate) : true)),
    [def.steps, gatePasses],
  )

  const [index, setIndex] = useState(0)
  const [previewDone, setPreviewDone] = useState(false)
  const [draft, setDraft] = useState<OnboardingDraft>({
    displayName: '',
    handle: ctx.initialHandle ?? '',
    bio: '',
    avatarUrl: '',
    regionId: '',
  })
  const [controls, setControls] = useState<StepControls>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const patch = useCallback((p: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...p })), [])
  const report = useCallback((next: StepControls) => setControls(next), [])

  const step = steps[index]
  const def0 = getStepDef(step.type)
  const isLast = index === steps.length - 1

  const parsed = def0?.contentSchema.safeParse(step.content ?? {})
  const c = (parsed?.success ? parsed.data : {}) as Record<string, unknown>
  const Body = def0?.Component

  const validated = def0?.validate ? def0.validate(draft, ctx) : true
  const nextDisabled = !validated || !!controls.nextDisabled || submitting

  function goTo(next: number) {
    setControls({})
    setIndex(next)
  }

  async function onNext() {
    if (controls.onBeforeNext) {
      const ok = await controls.onBeforeNext()
      if (!ok) return
    }
    if (isLast) {
      // Preview never commits: show the terminal panel instead of firing the real action.
      if (preview) {
        setPreviewDone(true)
        return
      }
      const action = step.action ? SEQUENCE_ACTIONS[step.action] : undefined
      if (!action) return
      setSubmitting(true)
      setSubmitError('')
      try {
        await action(draft)
        // The action redirects on success; execution stops here.
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Something went wrong.')
        setSubmitting(false)
      }
      return
    }
    goTo(index + 1)
  }

  const nextLabel = isLast ? String(c.submitLabel ?? 'Continue') : 'Continue'

  // Preview terminal panel: staff reached the end of the flow; in production this is where the
  // sequence's `action` (completeOnboarding) fires. Nothing is written.
  if (previewDone) {
    return (
      <WizardShell
        step={steps.length}
        totalSteps={steps.length}
        stepLabel="Preview complete"
        eyebrow={def.eyebrow}
        title="End of the flow"
        description={`This is where "${def.label}" finishes. In production the sequence's action runs here (join the community). Nothing was saved in preview.`}
        onBack={() => {
          setPreviewDone(false)
          goTo(steps.length - 1)
        }}
        onNext={() => {
          setPreviewDone(false)
          goTo(0)
        }}
        nextLabel="Restart preview"
        exit={[{ href: '/', label: 'Home' }]}
      >
        <div />
      </WizardShell>
    )
  }

  return (
    <WizardShell
      step={index + 1}
      totalSteps={steps.length}
      stepLabel={step.label ?? def0?.label}
      eyebrow={def.eyebrow}
      title={String(c.title ?? '')}
      description={c.description ? String(c.description) : undefined}
      onBack={index > 0 ? () => goTo(index - 1) : undefined}
      onNext={onNext}
      nextLabel={nextLabel}
      nextDisabled={nextDisabled}
      nextBusy={submitting || !!controls.busy}
      nextBusyLabel={isLast ? String(c.submitBusyLabel ?? '') || undefined : controls.busyLabel}
      error={controls.error || submitError || undefined}
      exit={[
        { href: '/', label: 'Home' },
        { href: '/sign-in', label: 'Log in to account' },
      ]}
    >
      {Body && <Body content={c} draft={draft} patch={patch} report={report} ctx={ctx} />}
    </WizardShell>
  )
}
