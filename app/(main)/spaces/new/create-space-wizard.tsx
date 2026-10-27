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
  createWizardSteps,
  suggestModeForIntents,
  type WizardPlan,
} from '@/lib/spaces/create-wizard'
import { Field, TextField } from '@/components/spaces/space-form'
import type { MegaNicheId, MegaThemeId } from '@/lib/theme/mega-theme'
import { SpacePicker, type PickerDone } from './space-picker'

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

const STEPS = createWizardSteps(SPACE_MANIFEST)

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
        theme: arrivedTheme,
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

  return (
    <div className="relative">
      {/* Kit design elements: a soft pastel wash behind the card and the glowing orb. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-72 opacity-80 blur-2xl"
        // token-ok: a mask only reads the alpha channel, so any opaque colour works; it paints nothing.
        style={{ background: 'var(--fq-pa-soft)', maskImage: 'radial-gradient(ellipse at 50% 0%, #000 0%, transparent 70%)' }}
      />
      <span aria-hidden className="orb pointer-events-none absolute right-6 top-14 sm:right-2" />
      <SparkShell
      eyebrow="New Space"
      headingLevel={2}
      title={lockup(step.title)}
      description={step.desc}
      step={index + 1}
      totalSteps={STEPS.length}
      stepLabel={step.key === 'intents' ? 'Goals' : step.key === 'model' ? 'Setup' : step.key === 'identity' ? 'Name' : 'Start'}
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
        <div className="chips flex flex-wrap gap-2" role="group" aria-label="What you want to do here">
          {WIZARD_INTENTS.map((i) => {
            const on = intents.includes(i.id)
            return (
              <button
                key={i.id}
                type="button"
                className={on ? 'chip on' : 'chip'}
                aria-pressed={on}
                title={i.hint}
                onClick={() => {
                  setDecideLater(false)
                  setIntents(on ? intents.filter((x) => x !== i.id) : [...intents, i.id])
                }}
              >
                <FqIcon name={INTENT_ICON[i.id] ?? 'plus'} size={16} />
                {i.label}
              </button>
            )
          })}
          <button
            type="button"
            className={decideLater ? 'chip on' : 'chip'}
            aria-pressed={decideLater}
            title="Skip this. We start you on the general setup, and you can change it any time."
            onClick={() => {
              setDecideLater(true)
              setIntents([])
            }}
          >
            Decide later
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

      {step.key === 'start' && (
        <div className="space-y-5">
          <dl className="card divide-y divide-border">
            {[
              ['Space', name.trim() || 'Not named yet'],
              ['Handle', `/spaces/${slug}`],
              ['Goals', intents.length ? WIZARD_INTENTS.filter((i) => intents.includes(i.id)).map((i) => i.label.toLowerCase()).join(', ') : 'Not sure yet, and that is fine'],
              ['Tool setup', choice ? `${choice.label}: ${choice.hint}` : ''],
              ['Starting tools', (choice && presetLabels[choice.id]) || 'Every tool on'],
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
      {index === 0 && (
        <p className="why mx-auto max-w-lg px-4 pb-8 text-center">
          Rather not fill it in by hand?{' '}
          <Link href="/spaces/launch" className="underline">
            Let Vera draft your page
          </Link>
        </p>
      )}
    </div>
  )
}
