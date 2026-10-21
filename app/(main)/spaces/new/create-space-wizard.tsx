'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { SparkShell } from '@/components/studio/spark'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import { isSafeSlug } from '@/lib/theme/validate'
import { cn, slugify as slugifyShared } from '@/lib/utils'
import { createSpace } from '@/lib/spaces/provision'
import { SPACE_MANIFEST } from '@/lib/studio/entities/space'
import {
  WIZARD_PLANS,
  WIZARD_PLAN_COPY,
  choiceTypeForPlan,
  createWizardSteps,
  type WizardPlan,
} from '@/lib/spaces/create-wizard'
import { Field, TextField, VisibilityField } from '@/components/spaces/space-form'

// The SPACE CREATION WIZARD (client). Step-by-step on the Spark kit, like every other seeder
// (docs/STUDIO.md): Plan, What you run, Name it, Ready. The steps are read off the Space manifest by
// lib/spaces/create-wizard.ts, and the last step hands off to the setup walk (/spaces/<slug>/setup),
// which seeds the story, look, contact details and offerings. The server re-validates everything;
// this mirrors the checks for fast, inline feedback only.
//
// The plan is a HINT from /pricing (`?plan=`): a Space is always born free, and a paid hint only
// decides that the setup walk ends on the Space's billing page (kept as preferences.planIntent).

/** One "what do you run?" choice (mirrors lib/spaces/modes.ts ModeChoice). */
export interface SpaceModeChoice {
  id: string
  type: string
  variant: string
  label: string
  hint: string
}

const STEPS = createWizardSteps(SPACE_MANIFEST)

function slugify(name: string): string {
  return slugifyShared(name).slice(0, 40).replace(/-+$/g, '')
}

function Option({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-start justify-between gap-3 rounded-control border px-3 py-3 text-left transition-colors',
        active ? 'border-primary bg-primary-bg text-text' : 'border-border bg-surface text-muted hover:border-border-strong',
      )}
    >
      <span>
        <span className="block text-body-sm font-semibold text-text">{title}</span>
        <span className="mt-0.5 block text-meta text-muted">{hint}</span>
      </span>
      {active && <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
    </button>
  )
}

export function CreateSpaceWizard({
  choices,
  initialChoiceId,
  initialPlan = 'free',
  presetLabels = {},
  heardAboutOptions = [],
}: {
  choices: SpaceModeChoice[]
  heardAboutOptions?: readonly string[]
  /** The Mode a niche funnel pre-selected (`${type}:${variant}`), already validated by the page. */
  initialChoiceId?: string
  /** The plan hint from /pricing, already parsed by the page. */
  initialPlan?: WizardPlan
  /** choice id -> the starting setup it opens with, for the last step's summary. */
  presetLabels?: Record<string, string | null>
}) {
  // A nonprofit plan points at the nonprofit Mode unless a funnel already chose one.
  const planType = choiceTypeForPlan(initialPlan)
  const planChoice = planType ? choices.find((c) => c.type === planType)?.id : undefined
  const [plan, setPlan] = useState<WizardPlan>(initialPlan)
  const [choiceId, setChoiceId] = useState(initialChoiceId ?? planChoice ?? choices[0]?.id ?? '')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [visibility, setVisibility] = useState<'network' | 'private'>('network')
  const [heardAbout, setHeardAbout] = useState('')
  // A plan hint that arrived already chosen starts past the plan step's question, not past the step.
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const choice = choices.find((c) => c.id === choiceId) ?? choices[0]
  const step = STEPS[index]
  const slugValid = slug === '' || isSafeSlug(slug)
  const identityOk = name.trim().length > 0 && isSafeSlug(slug)

  function onNameChange(v: string) {
    setName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  function submit() {
    if (!choice) return
    setError(null)
    start(async () => {
      const result = await createSpace({
        type: choice.type,
        modeVariant: choice.variant,
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        visibility,
        heardAbout: heardAbout || null,
        plan,
      })
      // createSpace redirects on success, so we only reach here on a returned error.
      if (result && isError(result)) setError(result.error)
    })
  }

  const last = index === STEPS.length - 1
  const nextDisabled = (step.key === 'model' && !choice) || (step.key === 'identity' && !identityOk)

  return (
    <SparkShell
      eyebrow="New Space"
      headingLevel={2}
      title={step.title}
      description={step.desc}
      step={index + 1}
      totalSteps={STEPS.length}
      stepLabel={step.key === 'plan' ? 'Plan' : step.key === 'model' ? 'Model' : step.key === 'identity' ? 'Name' : 'Start'}
      onBack={index > 0 ? () => setIndex(index - 1) : undefined}
      onNext={last ? submit : () => setIndex(index + 1)}
      nextLabel={last ? 'Create my Space' : 'Continue'}
      nextDisabled={nextDisabled}
      busy={pending}
      error={error}
      draftScopeKey={null}
    >
      {step.key === 'plan' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {WIZARD_PLANS.map((p) => (
            <Option key={p} active={plan === p} onClick={() => setPlan(p)} title={WIZARD_PLAN_COPY[p].label} hint={WIZARD_PLAN_COPY[p].hint} />
          ))}
        </div>
      )}

      {step.key === 'model' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map((c) => (
            <Option key={c.id} active={choiceId === c.id} onClick={() => setChoiceId(c.id)} title={c.label} hint={c.hint} />
          ))}
        </div>
      )}

      {step.key === 'identity' && (
        <div className="space-y-5">
          <TextField
            id="name"
            label="Name"
            hint="The name people will see across the network."
            value={name}
            onChange={onNameChange}
            placeholder="River Yoga"
            maxLength={200}
            required
          />
          <div>
            <TextField
              id="slug"
              label="Handle"
              hint="Your space lives at /spaces/your-handle. Lowercase letters, numbers, and hyphens."
              value={slug}
              onChange={(v) => {
                setSlugTouched(true)
                setSlug(v.toLowerCase())
              }}
              placeholder="river-yoga"
              maxLength={40}
            />
            {!slugValid && <p className="mt-1 text-meta font-medium text-danger">Use lowercase letters, numbers, and hyphens only.</p>}
          </div>
          <VisibilityField value={visibility} onChange={setVisibility} />
        </div>
      )}

      {step.key === 'start' && (
        <div className="space-y-5">
          <dl className="divide-y divide-border rounded-card border border-border bg-surface text-body-sm">
            {[
              ['Space', name.trim() || 'Not named yet'],
              ['Handle', `/spaces/${slug}`],
              ['What you run', choice ? `${choice.label}: ${choice.hint}` : ''],
              ['Starting tools', (choice && presetLabels[choice.id]) || 'Every tool on'],
              ['Plan', plan === 'free' ? 'Free' : `${WIZARD_PLAN_COPY[plan].label}, checkout after setup`],
              ['Who can find it', visibility === 'network' ? 'Listed in the Spaces directory' : 'Private'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-medium text-text">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-meta text-muted">Next we walk you through your story, your look, how people reach you, and what you offer.</p>
          {heardAboutOptions.length > 0 && (
            <Field id="space-heard-about" label="How did you hear about us?" hint="Optional. It helps us find more people like you.">
              <Select
                id="space-heard-about"
                value={heardAbout}
                onChange={(e) => setHeardAbout(e.target.value)}
                emptyLabel="Skip"
                options={heardAboutOptions}
              />
            </Field>
          )}
        </div>
      )}
    </SparkShell>
  )
}
