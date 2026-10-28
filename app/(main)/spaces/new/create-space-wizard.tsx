'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { SparkShell } from '@/components/studio/spark'
import { Select } from '@/components/ui/select'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { isError } from '@/lib/action-result'
import { isSafeSlug } from '@/lib/theme/validate'
import { slugify as slugifyShared } from '@/lib/utils'
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
import { Field, TextField } from '@/components/spaces/space-form'
import type { MegaNicheId, MegaThemeId } from '@/lib/theme/mega-theme'
import { SpacePicker, type PickerDone } from './space-picker'

const STEP_LABEL: Record<string, string> = { intents: 'Goals', model: 'Setup', identity: 'Name', look: 'Look', start: 'Start' }

// The SPACE CREATION WIZARD (client). Step-by-step on the Spark kit, like every other seeder
// (docs/STUDIO.md): What you want to do, Tool setup, Name it, Ready. The steps are read off the Space manifest by
// lib/spaces/create-wizard.ts, and the last step hands off to the setup walk (/spaces/<slug>/setup),
// which seeds the story, look, contact details and offerings. The server re-validates everything;
// this mirrors the checks for fast, inline feedback only.
//
// The first step is a MULTI-SELECT of what the owner wants to do, never a niche: it suggests the tool
// setup and is recorded first-party only (createSpace). The plan is a HINT from /pricing (`?plan=`): a
// Space is always born free, and a paid hint only decides that the setup walk ends on the Space's billing
// page (kept as preferences.planIntent).

/** One "what do you run?" choice (mirrors lib/spaces/modes.ts ModeChoice). */
export interface SpaceModeChoice {
  id: string
  type: string
  variant: string
  label: string
  hint: string
}

const STEPS = withLookStep(createWizardSteps(SPACE_MANIFEST))

function slugify(name: string): string {
  return slugifyShared(name).slice(0, 40).replace(/-+$/g, '')
}

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

/** The kit's heading lockup: Unbounded, with the last word in Instrument Serif italic. */
function lockup(title: string) {
  const i = title.lastIndexOf(' ')
  if (i < 0) return title
  const last = title.slice(i + 1).replace(/[?.!]+$/, '')
  const tail = title.slice(i + 1 + last.length)
  return (
    <>
      {title.slice(0, i)} <span className="serif">{last}</span>
      {tail}
    </>
  )
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
  const [slug, setSlug] = useState(initialName ? slugify(initialName) : '')
  const [slugTouched, setSlugTouched] = useState(false)
  const [visibility, setVisibility] = useState<'network' | 'private'>('network')
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

  const last = index === STEPS.length - 1
  const nextDisabled = (step.key === 'model' && !choice) || (step.key === 'identity' && !identityOk)

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

  const kitLabel = arrivedTheme ? (WIZARD_THEMES.find((t) => t.id === arrivedTheme)?.label ?? null) : null
  const goalsLine = intents.length ? `${intents.length} ${intents.length === 1 ? 'goal' : 'goals'}` : 'Goals open'
  const lookLabel = WIZARD_THEMES.find((t) => t.id === theme)?.label ?? 'Pick later'

  return (
    <div className="@container space-y-6">
      {kitLabel && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-[image:var(--fq-pa-soft)] p-3">
          <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-ink font-display text-body-sm font-bold text-on-ink">
            {kitLabel.charAt(0)}
          </span>
          <p className="min-w-0 flex-1 text-meta text-muted">
            <strong className="block text-body-sm text-text">{kitLabel} kit is picked</strong>
            Your website, email and Spotlight start in this look. You can change it on the Look step.
          </p>
          <button type="button" className="text-meta font-semibold text-text underline underline-offset-4" onClick={() => setIndex(STEPS.findIndex((x) => x.key === 'look'))}>
            Change
          </button>
        </div>
      )}

      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((st, i) => {
          const state = i === index ? 'on' : i < index ? 'done' : 'todo'
          return (
            <li
              key={st.key}
              aria-current={state === 'on' ? 'step' : undefined}
              className={`flex h-9 items-center gap-2 rounded-full border px-2.5 text-meta font-semibold sm:px-3.5 ${
                state === 'on' ? 'border-ink bg-ink text-on-ink' : 'border-border text-muted'
              }`}
            >
              <span
                aria-hidden
                className={`grid h-5 w-5 place-items-center rounded-full text-eyebrow ${state === 'todo' ? 'bg-surface-elevated' : 'bg-[image:var(--fq-pa)] text-text'}`}
              >
                {i + 1}
              </span>
              <span className={state === 'on' ? undefined : 'hidden sm:inline'}>{STEP_LABEL[st.key]}</span>
            </li>
          )
        })}
      </ol>

      <p className="text-meta text-muted @3xl:hidden">
        {[goalsLine, choice?.label, lookLabel, plan === 'free' ? 'Free to start' : WIZARD_PLAN_COPY[plan].label].filter(Boolean).join(' · ')}
      </p>

      <div className="grid items-start gap-6 @3xl:grid-cols-[minmax(0,1fr)_16.5rem]">
        <div className="card @container p-5 sm:p-7">
      <SparkShell
      bare
      eyebrow="New Space"
      headingLevel={2}
      title={lockup(step.title)}
      description={step.desc}
      step={index + 1}
      totalSteps={STEPS.length}
      stepLabel={STEP_LABEL[step.key]}
      onBack={index > 0 ? () => setIndex(index - 1) : undefined}
      onNext={last ? submit : () => setIndex(index + 1)}
      nextLabel={last ? 'Create my Space' : 'Continue'}
      nextDisabled={nextDisabled}
      busy={pending}
      error={error}
      draftScopeKey={null}
    >
      {/* The kit's `.chip` / `.chip.on` pills (members kit): small, a selected one is solid ink. */}
      {step.key === 'intents' && (
        <div>
          <div className="grid gap-3 @xl:grid-cols-2" role="group" aria-label="What you want to do here">
            {WIZARD_INTENTS.map((i) => {
              const on = intents.includes(i.id)
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={on}
                  className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                    on ? 'border-ink bg-[image:var(--fq-pa-soft)] ring-1 ring-ink' : 'border-border bg-surface-elevated/50 hover:bg-surface-elevated'
                  }`}
                  onClick={() => {
                    setDecideLater(false)
                    setIntents(on ? intents.filter((x) => x !== i.id) : [...intents, i.id])
                  }}
                >
                  <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[image:var(--fq-pa-soft)]">
                    <FqIcon name={INTENT_ICON[i.id] ?? 'plus'} size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body-sm font-semibold text-text">{i.label}</span>
                    <span className="block text-meta text-muted">{i.hint}</span>
                  </span>
                </button>
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
      )}

      {step.key === 'model' && (
        <div className="space-y-3">
          <div className="chips flex flex-wrap gap-2" role="group" aria-label="Tool setup">
            {choices.map((c) => {
              const on = activeChoiceId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  className={on ? 'chip on' : 'chip'}
                  aria-pressed={on}
                  onClick={() => {
                    setChoiceTouched(true)
                    setChoiceId(c.id)
                  }}
                >
                  {labelCounts[c.label] > 1 ? `${c.label}: ${c.hint}` : c.label}
                </button>
              )
            })}
          </div>
          {choice && <p className="why">{choice.hint}</p>}
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
          <Field id="visibility" label="Who can find it">
            <div className="chips flex flex-wrap gap-2" role="group" aria-label="Who can find it">
              {(
                [
                  ['network', 'Listed in the directory', 'globe'],
                  ['private', 'Private', 'shield'],
                ] as const
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  className={visibility === id ? 'chip on' : 'chip'}
                  aria-pressed={visibility === id}
                  onClick={() => setVisibility(id)}
                >
                  <FqIcon name={icon} size={16} />
                  {label}
                </button>
              ))}
            </div>
            <p className="why mt-2">
              {visibility === 'network'
                ? 'Anyone can find it in the Spaces directory.'
                : 'Hidden from the directory. Only you and your members can open it.'}
            </p>
          </Field>
        </div>
      )}

      {step.key === 'look' && (
        <div className="space-y-3">
          <div className="chips flex flex-wrap gap-2" role="group" aria-label="Your look">
            {WIZARD_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={theme === t.id ? 'chip on' : 'chip'}
                aria-pressed={theme === t.id}
                title={t.hint}
                onClick={() => setTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
            <button type="button" className={theme === null ? 'chip on' : 'chip'} aria-pressed={theme === null} onClick={() => setTheme(null)}>
              Pick later
            </button>
          </div>
          <p className="why">{WIZARD_THEMES.find((t) => t.id === theme)?.hint ?? 'We start you on the default look. You can switch any time.'}</p>
        </div>
      )}

      {step.key === 'start' && (
        <div className="space-y-5">
          <dl className="card divide-y divide-border">
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
        </div>
        <aside className="card hidden p-5 @3xl:sticky @3xl:top-6 @3xl:block" aria-label="Your space so far">
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
        </aside>
      </div>

      {index === 0 && (
        <p className="text-center text-meta text-muted">
          Rather not fill it in by hand?{' '}
          <Link href="/spaces/launch" className="underline">
            Let Vera draft your page
          </Link>
        </p>
      )}
    </div>
  )
}
