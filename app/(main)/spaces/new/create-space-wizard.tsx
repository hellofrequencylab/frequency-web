'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Select } from '@/components/ui/select'
import { type FqIconName } from '@/components/frequency/icon'
import { isError } from '@/lib/action-result'
import { isSafeSlug } from '@/lib/theme/validate'
import { createSpace } from '@/lib/spaces/provision'
import { SPACE_MANIFEST } from '@/lib/studio/entities/space'
import {
  WIZARD_INTENTS,
  WIZARD_PLAN_COPY,
  choiceTypeForPlan,
  chosenWizardTheme,
  createWizardSteps,
  WIZARD_THEMES,
  withLookStep,
  suggestModeForIntents,
  type WizardPlan,
} from '@/lib/spaces/create-wizard'
import { Field } from '@/components/spaces/space-form'
import { CreateFlow, type FlowStep } from '@/components/spaces/create-flow/create-flow'
import { ChoiceTile } from '@/components/spaces/create-flow/choice-tile'
import { NameStep, handleFromName, type SpaceVisibility } from '@/components/spaces/create-flow/name-step'
import { LookStep } from '@/components/spaces/create-flow/look-step'
import type { MegaNicheId, MegaThemeId } from '@/lib/theme/mega-theme'
import { SpacePicker, type PickerDone } from './space-picker'

export interface SpaceModeChoice {
  id: string
  type: string
  variant: string
  label: string
  hint: string
}

const STEP_LABEL: Record<string, string> = { intents: 'Goals', model: 'Setup', identity: 'Name', look: 'Look', start: 'Start' }

const STEPS = withLookStep(createWizardSteps(SPACE_MANIFEST))

/** The icon each pick wears, from the design system's sprite. */
const INTENT_ICON: Record<string, FqIconName> = {
  bookings: 'clock',
  classes: 'membership',
  programs: 'program',
  events: 'event',
  products: 'tag',
  community: 'circle',
  email: 'message',
  donations: 'giveback',
}

export function CreateSpaceWizard({
  choices,
  initialChoiceId,
  initialPlan = 'free',
  initialName = '',
  initialIntents = [],
  presetLabels = {},
  heardAboutOptions = [],
  pickerEnabled = false,
  arrivedNiche = null,
  arrivedTheme = null,
}: {
  /** Show the four-question picker before the wizard (ADR-1883, behind SPACE_PICKER_ENABLED). */
  pickerEnabled?: boolean
  /** The niche a /for door named (query or funnel cookie), already validated by the page. Saved on the
   *  Space whether or not the picker is on. */
  arrivedNiche?: MegaNicheId | null
  /** The Mega Theme a /themes page named (`?theme=`), already validated by the page. The new Space is dressed in it
   *  (applyMegaTheme) right after it is created. */
  arrivedTheme?: MegaThemeId | null
  choices: SpaceModeChoice[]
  heardAboutOptions?: readonly string[]
  /** The Mode a niche funnel pre-selected (`${type}:${variant}`), already validated by the page. */
  initialChoiceId?: string
  /** The plan hint from /pricing, already parsed by the page. */
  initialPlan?: WizardPlan
  /** The Space name the pricing calculator collected, already trimmed by the page. */
  initialName?: string
  /** The goals the pricing calculator collected, already validated by the page. */
  initialIntents?: readonly string[]
  /** choice id -> the starting setup it opens with, for the last step's summary. */
  presetLabels?: Record<string, string | null>
}) {
  // A nonprofit plan points at the nonprofit Mode unless a funnel already chose one.
  const planType = choiceTypeForPlan(initialPlan)
  const planChoice = planType ? choices.find((c) => c.type === planType)?.id : undefined
  const plan = initialPlan
  const [intents, setIntents] = useState<string[]>([...initialIntents])
  // No niche is assumed: the default is the general service setup unless a funnel or the nonprofit plan chose.
  const [choiceId, setChoiceId] = useState(
    initialChoiceId ?? planChoice ?? choices.find((c) => c.id === 'business:service')?.id ?? choices[0]?.id ?? '',
  )
  const [choiceTouched, setChoiceTouched] = useState(false)
  // "Decide later" on the goals step: no picks, the general setup, switchable any time.
  const [decideLater, setDecideLater] = useState(false)
  const [name, setName] = useState(initialName)
  const [slug, setSlug] = useState(initialName ? handleFromName(initialName) : '')
  const [slugTouched, setSlugTouched] = useState(false)
  const [visibility, setVisibility] = useState<SpaceVisibility>('network')
  const [heardAbout, setHeardAbout] = useState('')
  // A plan hint that arrived already chosen starts past the plan step's question, not past the step.
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // The picker runs first when it is on; its answers (or the door's niche) ride into createSpace.
  const [picking, setPicking] = useState(pickerEnabled)
  const [picked, setPicked] = useState<PickerDone>({ niche: arrivedNiche, action: null, feel: null, site: null })
  // The look step: the theme a /themes page named is the starting pick; null means "pick later".
  const [theme, setTheme] = useState<MegaThemeId | null>(arrivedTheme)
  const [pending, start] = useTransition()

  const suggested = suggestModeForIntents(intents, choices.map((c) => c.id))
  // Until the owner picks a setup by hand, the setup follows the picks.
  const activeChoiceId = !choiceTouched && !initialChoiceId && suggested ? suggested : choiceId
  // Two setups can share a name (Coach); only those wear their hint so every chip reads differently.
  const labelCounts: Record<string, number> = {}
  for (const c of choices) labelCounts[c.label] = (labelCounts[c.label] ?? 0) + 1
  const choice = choices.find((c) => c.id === activeChoiceId) ?? choices[0]

  function onNameChange(v: string) {
    setName(v)
    if (!slugTouched) setSlug(handleFromName(v))
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
        intents,
        niche: picked.niche,
        theme: chosenWizardTheme(theme, arrivedTheme),
        action: picked.action,
        feel: picked.feel,
        site: picked.site,
      })
      // createSpace redirects on success, so we only reach here on a returned error.
      if (result && isError(result)) setError(result.error)
    })
  }

  const identityOk = name.trim().length > 0 && isSafeSlug(slug)
  const lookLabel = WIZARD_THEMES.find((t) => t.id === theme)?.label ?? 'Pick later'

  if (picking) {
    return (
      <SpacePicker
        arrivedNiche={arrivedNiche}
        onDone={(answers) => {
          setPicked(answers)
          setPicking(false)
        }}
        onSkip={() => setPicking(false)}
      />
    )
  }

  const bodies: Record<string, React.ReactNode> = {
    intents: (
      <div>
        <div className="grid gap-3 @xl:grid-cols-2" role="group" aria-label="What you want to do here">
          {WIZARD_INTENTS.map((i) => {
            const on = intents.includes(i.id)
            return (
              <ChoiceTile
                key={i.id}
                on={on}
                icon={INTENT_ICON[i.id] ?? 'plus'}
                title={i.label}
                hint={i.hint}
                onSelect={() => {
                  setDecideLater(false)
                  setIntents(on ? intents.filter((x) => x !== i.id) : [...intents, i.id])
                }}
              />
            )
          })}
        </div>
        <button
          type="button"
          aria-pressed={decideLater}
          className={`mt-4 text-body-sm underline underline-offset-4 ${decideLater ? 'font-semibold text-text' : 'text-muted'}`}
          onClick={() => {
            setDecideLater(true)
            setIntents([])
          }}
        >
          Not sure yet? Decide later
        </button>
      </div>
    ),
    model: (
      <div className="grid gap-3 @xl:grid-cols-2" role="group" aria-label="Tool setup">
        {choices.map((c) => (
          <ChoiceTile
            key={c.id}
            on={activeChoiceId === c.id}
            title={c.label}
            hint={c.hint}
            onSelect={() => {
              setChoiceTouched(true)
              setChoiceId(c.id)
            }}
          />
        ))}
      </div>
    ),
    identity: (
      <NameStep
        name={name}
        handle={slug}
        visibility={visibility}
        onName={onNameChange}
        onHandle={(v) => {
          setSlugTouched(true)
          setSlug(v)
        }}
        onVisibility={setVisibility}
      />
    ),
    look: <LookStep value={theme} arrivedTheme={arrivedTheme} onChange={setTheme} />,
    start: (
      <div className="space-y-5">
        <dl className="divide-y divide-border rounded-2xl border border-border">
          {[
            ['Space', name.trim() || 'Not named yet'],
            ['Handle', `/spaces/${slug}`],
            ['Goals', intents.length ? WIZARD_INTENTS.filter((i) => intents.includes(i.id)).map((i) => i.label.toLowerCase()).join(', ') : 'Not sure yet, and that is fine'],
            ['Tool setup', choice ? `${choice.label}: ${choice.hint}` : ''],
            ['Starting tools', (choice && presetLabels[choice.id]) || 'Every tool on'],
            ['Look', WIZARD_THEMES.find((t) => t.id === theme)?.label ?? 'Decide later'],
            ['Plan', plan === 'free' ? 'Free, upgrade any time' : `${WIZARD_PLAN_COPY[plan].label}, checkout after setup`],
            ['Visibility', visibility === 'network' ? 'Listed in the Spaces directory' : 'Private'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="k self-center">{k}</dt>
              <dd className="meta text-right font-medium text-text">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-meta text-muted">Next we walk you through your story, your look, how people reach you, and what you offer.</p>
        {heardAboutOptions.length > 0 && (
          <Field id="space-heard-about" label="How did you hear about us?" hint="Optional. It helps us find more people like you.">
            <Select id="space-heard-about" value={heardAbout} onChange={(e) => setHeardAbout(e.target.value)} emptyLabel="Skip" options={heardAboutOptions} />
          </Field>
        )}
      </div>
    ),
  }

  const flowSteps: FlowStep[] = STEPS.map((st, i) => ({
    id: st.key,
    label: STEP_LABEL[st.key],
    title: st.title,
    description: st.desc,
    body: bodies[st.key],
    done: i < index,
    canContinue: !((st.key === 'model' && !choice) || (st.key === 'identity' && !identityOk)),
    ...(st.key === 'start' ? { nextLabel: 'Create my Space', onNext: submit } : {}),
  }))

  const kitLabel = arrivedTheme ? (WIZARD_THEMES.find((t) => t.id === arrivedTheme)?.label ?? null) : null
  const goalsLine = intents.length ? `${intents.length} ${intents.length === 1 ? 'goal' : 'goals'}` : 'Goals open'

  return (
    <CreateFlow
      steps={flowSteps}
      index={index}
      onIndexChange={setIndex}
      kit={kitLabel ? { label: kitLabel, changeStepId: 'look' } : null}
      busy={pending}
      error={error}
      recap={[goalsLine, choice?.label, lookLabel, plan === 'free' ? 'Free to start' : WIZARD_PLAN_COPY[plan].label].filter(Boolean).join(' · ')}
      summary={
        <>
          <p className="k">Your space</p>
          <p className="mt-2 break-words font-display text-card-title font-bold text-text">{name.trim() || 'Not named yet'}</p>
          <p className="mt-1 text-meta text-muted">{plan === 'free' ? 'Free to start' : `${WIZARD_PLAN_COPY[plan].label}, checkout after setup`}</p>
          <dl className="mt-4 divide-y divide-border text-meta">
            {[
              ['Goals', intents.length ? WIZARD_INTENTS.filter((i) => intents.includes(i.id)).map((i) => i.label).join(', ') : 'Open'],
              ['Tools', choice?.label ?? ''],
              ['Look', lookLabel],
              ['Listed', visibility === 'network' ? 'In the directory' : 'Private'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-semibold text-text">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      }
      footerNote={
        index === 0 ? (
          <>
            Rather not fill it in by hand?{' '}
            <Link href="/spaces/launch" className="underline">
              Let Vera draft your page
            </Link>
          </>
        ) : null
      }
    />
  )
}
