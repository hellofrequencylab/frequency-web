'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE CIRCLE SPARK (/circles/new), composed from the Studio Spark kit (docs/STUDIO.md §0).
//
// Nothing here declares a shell, a progress cue, a door, an upload box, or a field style. The
// screens are `SparkShell`, the first screen is `SparkDoors` + `SparkDropzone`, and every field
// on the review step is a row from the CIRCLE manifest rendered by `FieldControl`. Change the
// manifest and this screen changes; change the kit and every wizard changes.
//
// The four ways in are unchanged, they are just no longer four hand-built cards:
//   1. Start from a Starter Circle  → an extra door, linking to the gallery (/circles/templates)
//   2. Upload or paste an outline   → the shared drop zone, which serves BOTH standard doors
//   3. Answer a few questions       → the standard Vera door → the brief → review → create
//   4. Start from scratch           → the standard manual door → a blank draft → the builder
//
// The server actions are untouched. Paths 2 + 3 still meet at one review step holding an
// editable `CircleSparkDraft`; committing still runs createDraftFromSparkAction and pushes into
// the builder, and nothing persists until that commit. With Vera off, the manual door and the
// "start from scratch" exit still make a blank Circle by hand.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, LayoutTemplate } from 'lucide-react'
import { wizardSecondaryClass } from '@/components/templates'
import { Input } from '@/components/ui/field'
import { StudioField } from '@/components/studio/kit/studio-field'
import { FieldControl, SparkDoors, SparkDropzone, SparkShell, SparkSteer } from '@/components/studio/spark'
import { CIRCLE_MANIFEST } from '@/lib/studio/entities/circle'
import { sparkFields } from '@/lib/studio/kernel/review-kernel'
import { DEFAULT_SEED_MOOD, type SeedMood } from '@/lib/studio/kernel/moods'
import type { FieldDef } from '@/lib/studio/kernel/manifest'
import type { PillarSlug } from '@/lib/pillars'
import type { CircleSparkDraft } from '@/lib/ai/circle-spark'
import {
  sparkPreviewAction,
  createDraftFromSparkAction,
  createBlankDraftAction,
} from '@/app/(main)/circles/builder-actions'

// ── What the manifest says a Circle's Spark asks for ──────────────────────────────────────
// name · about · primaryPillar. Declared once (lib/studio/entities/circle.ts), filtered by the
// kernel, rendered by the kit. Adding a fourth is a manifest edit, not an edit here.
const SPARK_FIELDS = sparkFields(CIRCLE_MANIFEST)

const FIELD_BY_PATH = new Map(CIRCLE_MANIFEST.fields.map((f) => [f.path, f]))

/** The lean, asked BEFORE the draft (it steers what Vera writes) and confirmable after. */
const PILLAR_FIELD = FIELD_BY_PATH.get('primaryPillar')

/** Only a value the manifest itself declares counts as a Pillar. Keeps the Pillar list in one
 *  place (the manifest) rather than re-importing lib/pillars.ts into a client bundle. */
function asPillar(value: string): PillarSlug | null {
  const known = PILLAR_FIELD?.options?.some((o) => o.value === value)
  return known ? (value as PillarSlug) : null
}

/**
 * The manifest's dials, minus `lock`. Lock pins only mean something next to a redraw ("anything
 * pinned here survives a redraw untouched"), and the create path has none: `SparkSteer` renders
 * them whenever they are declared, so the create path narrows the capability instead.
 */
const CREATE_STEER = { mood: CIRCLE_MANIFEST.steer?.mood, directions: CIRCLE_MANIFEST.steer?.directions }
const NO_LOCKS: readonly string[] = []

/** The Vera path: the doors, the brief, the review. */
type Mode = 'choose' | 'questions' | 'review'
const TOTAL_STEPS = 3

/** A control's value comes back as a string or a list; every field here is scalar. */
const scalar = (v: string | string[]): string => (Array.isArray(v) ? v[0] ?? '' : v)

// ── The manifest ⇄ spark-draft seam ───────────────────────────────────────────────────────
//
// The manifest's paths mirror `CircleDraft` (what the builder autosaves), but this screen holds
// a `CircleSparkDraft` (what Vera returns and what createDraftFromSparkAction takes), and the two
// shapes name one field differently: the Circle's About is the spark's `oneLiner`. Two small pure
// functions bridge them so the field list can still come straight from the manifest.

function readSpark(spark: CircleSparkDraft, path: string): string {
  switch (path) {
    case 'name':
      return spark.name
    case 'about':
      return spark.oneLiner
    case 'primaryPillar':
      return spark.primaryPillar ?? ''
    default:
      return ''
  }
}

function writeSpark(spark: CircleSparkDraft, path: string, next: string): CircleSparkDraft {
  switch (path) {
    case 'name':
      return { ...spark, name: next }
    case 'about':
      return { ...spark, oneLiner: next }
    case 'primaryPillar':
      return { ...spark, primaryPillar: asPillar(next) }
    default:
      return spark
  }
}

/** One declared field, labeled. `toggle` prints its own label inside a `<label>`, so it is never
 *  wrapped in a second one. */
function Row({ def, value, onChange }: { def: FieldDef; value: string; onChange: (next: string) => void }) {
  const control = <FieldControl def={def} value={value} onChange={(v) => onChange(scalar(v))} />
  if (def.kind === 'toggle') return control
  return <StudioField label={def.label}>{control}</StudioField>
}

export function CircleWizard() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('choose')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The brief. These are QUESTIONS, not Circle fields: they steer what Vera writes and are
  // thrown away once the draft exists, so they are not in the manifest and never will be.
  const [topic, setTopic] = useState('')
  const [who, setWho] = useState('')
  const [cadence, setCadence] = useState('')
  const [primaryPillar, setPrimaryPillar] = useState<PillarSlug | null>(null)

  // Source material from the shared drop zone (an uploaded outline, a paste, or both).
  const [sourceText, setSourceText] = useState('')

  // Vera's drafted frame (the review step, editable).
  const [spark, setSpark] = useState<CircleSparkDraft | null>(null)

  // The steer dials. Captured on review so they never add a question to the flow.
  const [mood, setMood] = useState<SeedMood>(DEFAULT_SEED_MOOD)
  const [directions, setDirections] = useState('')

  const generate = () => {
    setError(null)
    start(async () => {
      try {
        const res = await sparkPreviewAction({
          topic,
          who,
          primaryPillar,
          cadence: cadence.trim() || undefined,
          sourceText: sourceText.trim() || undefined,
        })
        if (!res) {
          setError('Vera is offline right now. Start from scratch and write it yourself.')
          return
        }
        setSpark(res)
        setMode('review')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
      }
    })
  }

  const create = () => {
    if (!spark) return
    setError(null)
    start(async () => {
      try {
        const res = await createDraftFromSparkAction(spark)
        router.push(`/circles/${res.slug}/edit`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create the draft. Try again.')
      }
    })
  }

  const scratch = () => {
    setError(null)
    start(async () => {
      try {
        const res = await createBlankDraftAction()
        router.push(`/circles/${res.slug}/edit`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create the draft. Try again.')
      }
    })
  }

  // ── 1. The doors ──────────────────────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <SparkShell
        eyebrow="New Circle"
        title="Start a Circle"
        description="Four ways in. Pick the one that fits how you like to build."
        step={1}
        totalSteps={TOTAL_STEPS}
        stepLabel="Start"
        error={error}
        footer={
          <Link href="/circles" className={`${wizardSecondaryClass} w-full gap-1.5`}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Circles
          </Link>
        }
      >
        <SparkDoors
          entityLabel="Circle"
          onVera={() => setMode('questions')}
          veraLabel="Answer a few questions"
          veraHint="Tell Vera the basics and she drafts the whole Circle for you to edit."
          onManual={scratch}
          manualLabel="Start from scratch"
          manualHint="A blank Circle. Write every field yourself."
          extraDoors={[
            {
              key: 'starter',
              label: 'Start from a Starter Circle',
              hint: 'Remix a staff-made blueprint, then make it yours.',
              Icon: LayoutTemplate,
              href: '/circles/templates',
            },
          ]}
          disabled={pending}
        >
          {/* The old "upload an outline" door. It serves both doors now, which is what the
              manifest's `accepts: ['document', 'paste']` declares. */}
          <SparkDropzone
            accepts={CIRCLE_MANIFEST.accepts ?? []}
            sourceText={sourceText}
            onSourceText={setSourceText}
            disabled={pending}
          />
        </SparkDoors>
      </SparkShell>
    )
  }

  // ── 2. The brief ──────────────────────────────────────────────────────────────────────
  if (mode === 'questions') {
    const fromOutline = sourceText.trim().length > 0
    return (
      <SparkShell
        eyebrow="New Circle"
        title="Tell Vera the basics"
        description={
          fromOutline
            ? 'Vera has your outline. Add anything it does not say, then draft it.'
            : 'A few answers and Vera drafts the whole frame for you to edit.'
        }
        step={2}
        totalSteps={TOTAL_STEPS}
        stepLabel="A few questions"
        onBack={() => setMode('choose')}
        onNext={generate}
        nextLabel="Draft with Vera"
        nextDisabled={!topic.trim() && !fromOutline}
        busy={pending}
        error={error}
        exits={[{ label: 'Start from scratch instead', onSelect: scratch }]}
      >
        <div className="space-y-3">
          <StudioField label="What is it about">
            <Input
              autoFocus
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Trail running and coffee after"
            />
          </StudioField>
          <StudioField label="Who is it for">
            <Input
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="e.g. Busy adults who want real friends"
            />
          </StudioField>
          {PILLAR_FIELD && (
            <Row
              def={PILLAR_FIELD}
              value={primaryPillar ?? ''}
              onChange={(next) => setPrimaryPillar(asPillar(next))}
            />
          )}
          <StudioField label="How it meets (optional)">
            <Input
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
              placeholder="e.g. Wednesdays evening, Saturday mornings"
            />
          </StudioField>
        </div>
      </SparkShell>
    )
  }

  // ── 3. Review ─────────────────────────────────────────────────────────────────────────
  return (
    <SparkShell
      eyebrow="New Circle"
      title="Here is your Circle"
      description="Vera's draft. Edit anything, then create it."
      step={3}
      totalSteps={TOTAL_STEPS}
      stepLabel="Review"
      onBack={() => setMode('choose')}
      backLabel="Start over"
      onNext={create}
      nextLabel="Create the draft"
      nextDisabled={!spark?.name.trim()}
      busy={pending}
      error={error}
    >
      {spark && (
        <div className="space-y-3">
          {SPARK_FIELDS.map((def) => (
            <Row
              key={def.path}
              def={def}
              value={readSpark(spark, def.path)}
              onChange={(next) => setSpark(writeSpark(spark, def.path, next))}
            />
          ))}

          <p className="text-2xs leading-relaxed text-muted">
            Vera also drafted the four Pillars inside, the rhythm, the agreements, and more. Create the draft to edit
            all of it in the builder.
          </p>

          <SparkSteer
            steer={CREATE_STEER}
            mood={mood}
            onMood={setMood}
            directions={directions}
            onDirections={setDirections}
            locked={NO_LOCKS}
            onLocked={() => undefined}
            disabled={pending}
          />
        </div>
      )}
    </SparkShell>
  )
}
