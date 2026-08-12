'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE BUSINESS SEEDER'S START FORM, composed on the Spark kit (ADR-986, docs/STUDIO.md).
//
// The Seeder is the pilot for the standard: if the kit can dress the most demanding entity we own
// (a research pipeline with a provenance ledger and an adversarial verifier behind it), it can
// dress the rest. So this surface hand-rolls nothing. It composes `SparkShell`, `SparkDoors`,
// `SparkDropzone`, `SparkSteer`, `StudioField` and `FieldControl`, and it declares nothing about
// how a field looks.
//
// WHAT CHANGED FOR THE OPERATOR
//   • TWO DOORS, equal weight. "Research it from the web" (give a website or a name and let the
//     pipeline harvest and verify) or "I already have the content" (paste it and work from that).
//     Both were always possible; only one was ever offered.
//   • A DROP ZONE ON SCREEN ONE. The Seeder, the surface that takes more source material than
//     anything else here, had no upload on its start form at all: documents could only be pasted
//     as text and photos could only be attached later, at review. What it accepts comes from
//     `BUSINESS_MANIFEST.accepts`.
//   • THE STEER PANEL. Directions moved out of the middle of the wall and onto its own screen,
//     beside the MOOD dial, which the Seeder had only ever offered at re-seed time. A seed now
//     drafts in the mood the operator wanted from the first pass, not the second.
//   • STAGED, NOT A WALL. Thirteen fields arrived at once before. Now they arrive in the order an
//     operator actually has them, and the two paths are honestly different lengths.
//
// WHAT DID NOT CHANGE: `startBusinessImport`'s signature, its `requireStaffCap('structure','write')`
// gate, and the shape it stores. This is a front-door rebuild, not a pipeline change, which is what
// makes it safe to ship.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Rocket } from 'lucide-react'
import { Banner } from '@/components/admin/status'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldControl, SparkDoors, SparkDropzone, SparkShell, SparkSteer, StudioField } from '@/components/studio/spark'
import { BUSINESS_MANIFEST } from '@/lib/studio/entities/business'
import { DEFAULT_SEED_MOOD, type SeedMood } from '@/lib/studio/kernel/moods'
import type { FieldDef, SteerCapabilities } from '@/lib/studio/kernel/manifest'
import { startBusinessImport, uploadSeederImages } from './actions'

// ── What the Spark asks ──────────────────────────────────────────────────────────────────

/**
 * The questions the MANIFEST declares for guided creation (`placement: 'spark'`) that the start
 * action can actually carry. Their labels and, for `type`, their OPTIONS are read from the manifest,
 * so the business type offered here can never drift from the one the review board and the
 * materializer use: there is only one declaration of it.
 *
 * Named by path rather than taken straight off the `placement` filter for one reason: a field the
 * manifest later marks `spark` has no home in `StartImportInput`, and rendering it would silently
 * drop whatever the operator typed. An omission is visible; a silent drop is not.
 */
const SPARK_PATHS = ['name', 'type', 'category'] as const

const SPARK_FIELDS: readonly FieldDef[] = SPARK_PATHS.map((path) =>
  BUSINESS_MANIFEST.fields.find((f) => f.path === path),
).filter((f): f is FieldDef => Boolean(f))

/**
 * The Seeder's own START-ONLY inputs. These are RESEARCH HINTS, not draft fields: they steer the
 * harvest and are consumed by it, so they do not belong in the manifest (which declares what a
 * business DRAFT contains, and is what the review board paints). Declared here in the manifest's
 * own vocabulary, so the kit renders them exactly like every other field.
 */
const WEBSITE_FIELD: FieldDef = { path: 'websiteUrl', label: 'Website', kind: 'url', section: 'research' }
const CITY_FIELD: FieldDef = { path: 'cityHint', label: 'City', kind: 'text', section: 'research' }

const HANDLE_FIELDS: readonly FieldDef[] = [
  { path: 'instagram', label: 'Instagram', kind: 'text', section: 'research' },
  { path: 'facebook', label: 'Facebook', kind: 'text', section: 'research' },
  { path: 'linkedin', label: 'LinkedIn', kind: 'text', section: 'research' },
]

/** The labeled source boxes. `composePaste` folds them into ONE labeled block server-side, so the
 *  extractor can tell an overview from a price list. Unchanged from the wall; only the staging is. */
const CONTENT_FIELDS: readonly FieldDef[] = [
  { path: 'overview', label: 'Overview', kind: 'longtext', section: 'content' },
  { path: 'webContent', label: 'Website content', kind: 'longtext', section: 'content' },
  { path: 'bookingSchedule', label: 'Booking and schedule', kind: 'longtext', section: 'content' },
  { path: 'differentiators', label: 'What makes them different', kind: 'longtext', section: 'content' },
]

/** The example inside each box. Ghost text, not a hint line: an example of the SHAPE of an answer
 *  reads best in the box it belongs to, and it is the treatment this form already had. */
const PLACEHOLDERS: Record<string, string> = {
  websiteUrl: 'acme-yoga.com',
  name: 'Acme Yoga Studio',
  category: 'Yoga studio',
  cityHint: 'Encinitas',
  instagram: '@acmeyoga',
  facebook: 'acmeyoga',
  linkedin: 'company/acme-yoga',
  overview: 'What is this business, in plain terms? Who is it for, what do they do?',
  webContent: 'Paste the About, Home, or Services page copy, bios, mission.',
  bookingSchedule: 'Hours, session lengths, prices, how to book, availability.',
  differentiators: 'The angle, the specialty, the vibe, the proof.',
}

/**
 * The steering dials the START screen offers, derived from the manifest. `lock` is deliberately
 * NOT passed through: a lock protects a field from a REDRAW, and before the first draft exists
 * there is nothing to protect. The review board is where the lock belongs, and already has it.
 */
const START_STEER: SteerCapabilities = {
  mood: BUSINESS_MANIFEST.steer?.mood,
  directions: BUSINESS_MANIFEST.steer?.directions,
}

/** Which door the operator took. The paths are honestly different lengths, which `SparkShell`
 *  supports on purpose: the step count has to tell the truth about the path taken. */
type Door = 'research' | 'content'
const TOTAL_STEPS: Record<Door, number> = { research: 5, content: 4 }

/** What the progress bar shows before a door is chosen, when the path length is genuinely not
 *  known yet: the shortest honest answer. Picking the research door then adds one. */
const MIN_STEPS = Math.min(...Object.values(TOTAL_STEPS))

type Values = Record<string, string>

export function StartImportForm() {
  const router = useRouter()
  const [pending, start] = useTransition()

  const [door, setDoor] = useState<Door | null>(null)
  const [step, setStep] = useState(1)
  const [values, setValues] = useState<Values>({ type: 'business' })
  const [sourceText, setSourceText] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [mood, setMood] = useState<SeedMood>(DEFAULT_SEED_MOOD)
  const [directions, setDirections] = useState('')
  const [runInline, setRunInline] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Set when the intake was created but the photos did not attach, so the operator is told rather
   *  than routed past it. The primary action then opens the review board instead of starting again. */
  const [startedId, setStartedId] = useState<string | null>(null)

  const value = (path: string) => values[path] ?? ''
  const trimmed = (path: string) => value(path).trim()
  const set = (path: string, next: string | string[]) =>
    setValues((prev) => ({ ...prev, [path]: Array.isArray(next) ? next.join(', ') : next }))

  // Mirrors the server's own guard (a website, some content, or a name) so the operator learns it
  // before the round trip rather than after it.
  const hasContent = Boolean(sourceText.trim()) || CONTENT_FIELDS.some((f) => trimmed(f.path))
  const hasSeed = Boolean(trimmed('websiteUrl')) || Boolean(trimmed('name')) || hasContent

  const totalSteps = door ? TOTAL_STEPS[door] : MIN_STEPS

  /** Back off step two returns to the doors, so the path itself is re-choosable. */
  function back() {
    if (step === 2) {
      setDoor(null)
      setStep(1)
      return
    }
    setStep(step - 1)
  }

  function submit() {
    setError(null)
    start(async () => {
      const handles: Record<string, string> = {}
      for (const f of HANDLE_FIELDS) {
        const handle = trimmed(f.path)
        if (handle) handles[f.path] = handle
      }

      const res = await startBusinessImport({
        websiteUrl: trimmed('websiteUrl') || undefined,
        nameHint: trimmed('name') || undefined,
        cityHint: trimmed('cityHint') || undefined,
        categoryHint: trimmed('category') || undefined,
        type: value('type') === 'nonprofit' ? 'nonprofit' : 'business',
        socialHandles: Object.keys(handles).length ? handles : undefined,
        mood,
        directions: directions.trim() || undefined,
        overview: trimmed('overview') || undefined,
        webContent: trimmed('webContent') || undefined,
        bookingSchedule: trimmed('bookingSchedule') || undefined,
        differentiators: trimmed('differentiators') || undefined,
        // Anything dropped or pasted into the shared drop zone is one more source.
        pastedContent: sourceText.trim() || undefined,
        runInline,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }

      // Photos staged on screen one are filed onto the new intake through the EXISTING staging
      // action (`uploadSeederImages`, staff-gated and bound to the intake id). The start action is
      // untouched: the intake has to exist before an image can be bound to it, so this is a second
      // call rather than a wider input.
      if (images.length > 0) {
        const fd = new FormData()
        for (const file of images) fd.append('files', file)
        const staged = await uploadSeederImages(res.intakeId, fd)
        if (!staged.ok) {
          setStartedId(res.intakeId)
          setError(`The import started, but the photos did not attach: ${staged.error} You can add them on the review board.`)
          return
        }
      }

      router.push(`/admin/business-seeder/${res.intakeId}`)
    })
  }

  const fields = (list: readonly FieldDef[]) => (
    <div className="space-y-4">
      {list.map((f) => (
        <StudioField key={f.path} label={f.label}>
          <FieldControl
            def={f}
            value={value(f.path)}
            onChange={(next) => set(f.path, next)}
            disabled={pending}
            placeholder={PLACEHOLDERS[f.path]}
          />
        </StudioField>
      ))}
    </div>
  )

  // ── Screen 1: the two doors ──────────────────────────────────────────────────────────
  if (!door) {
    return (
      <SparkShell
        eyebrow="New import"
        title="Seed a business"
        description="Two ways in. Either one works, and anything you drop below feeds both."
        // This Spark runs INSIDE the admin console, which already owns the page's h1.
        headingLevel={2}
        step={1}
        totalSteps={MIN_STEPS}
        stepLabel="Start"
      >
        <SparkDoors
          entityLabel={BUSINESS_MANIFEST.label}
          veraLabel="Research it from the web"
          veraHint="Give a website or a name. Frequency harvests it, checks every commercial fact against a source, and hands you a reviewed draft."
          manualLabel="I already have the content"
          manualHint="Paste what you have and the seeder works from that instead of hunting for a site."
          onVera={() => {
            setDoor('research')
            setStep(2)
          }}
          onManual={() => {
            setDoor('content')
            setStep(2)
          }}
          disabled={pending}
        >
          <SparkDropzone
            accepts={BUSINESS_MANIFEST.accepts ?? []}
            sourceText={sourceText}
            onSourceText={setSourceText}
            images={images}
            onImages={setImages}
            disabled={pending}
          />
        </SparkDoors>
      </SparkShell>
    )
  }

  const onResearch = door === 'research'
  const lastStep = totalSteps

  // ── The middle screens, in the order an operator has the answers ──────────────────────
  if (step < lastStep) {
    // Research: 2 the business · 3 narrow the search · 4 anything already written.
    // Content:  2 what you have · 3 who it is.
    const stage = onResearch
      ? [
          {
            title: 'What should we research?',
            description: 'A website is enough. Everything else just sharpens the search.',
            label: 'The business',
            list: [WEBSITE_FIELD, ...SPARK_FIELDS],
            ready: hasSeed,
          },
          {
            title: 'Where else are they?',
            description: 'All optional. These keep the research on the right business.',
            label: 'Narrow it',
            list: [CITY_FIELD, ...HANDLE_FIELDS],
            ready: true,
          },
          {
            title: 'Anything you already have?',
            description: 'Optional. Labeled boxes help the extractor sort it. All of it is treated as a source.',
            label: 'Content',
            list: CONTENT_FIELDS,
            ready: true,
          },
        ][step - 2]
      : [
          {
            title: 'Paste what you have',
            description: 'Labeled boxes help the extractor sort it. All of it is treated as a source.',
            label: 'Content',
            list: CONTENT_FIELDS,
            ready: hasContent,
          },
          {
            title: 'Who is it?',
            description: 'Enough to name the Space this becomes.',
            label: 'The business',
            list: [...SPARK_FIELDS, CITY_FIELD],
            ready: hasSeed,
          },
        ][step - 2]

    // Defensive: an unreachable step index would otherwise render nothing at all.
    if (!stage) return null

    return (
      <SparkShell
        eyebrow="New import"
        title={stage.title}
        description={stage.description}
        headingLevel={2}
        step={step}
        totalSteps={totalSteps}
        stepLabel={stage.label}
        onBack={back}
        onNext={() => setStep(step + 1)}
        nextDisabled={!stage.ready}
        busy={pending}
      >
        {fields(stage.list)}
      </SparkShell>
    )
  }

  // ── The last screen: steer it, then go ────────────────────────────────────────────────
  return (
    <SparkShell
      eyebrow="New import"
      title="Steer the seed"
      description="Optional. Tell the seeder how to approach this business before it drafts."
      headingLevel={2}
      step={lastStep}
      totalSteps={totalSteps}
      stepLabel="Steer"
      // Once the intake exists there is nothing to go back to: the only way on is the review board,
      // and a Back here would let a second submit create a duplicate import.
      onBack={startedId ? undefined : back}
      onNext={startedId ? () => router.push(`/admin/business-seeder/${startedId}`) : submit}
      nextLabel={startedId ? 'Open the review board' : 'Start import'}
      nextDisabled={!hasSeed && !startedId}
      busy={pending}
      error={
        error ? (
          <Banner tone={startedId ? 'warning' : 'critical'} title={startedId ? 'The import started' : 'Could not start the import'}>
            {error}
          </Banner>
        ) : null
      }
    >
      {/* Mood and directions both persist onto the intake: the mood steers the reframe's tone from
          the first draft, and the review board's re-seed panel opens on the one chosen here. */}
      <SparkSteer
        steer={START_STEER}
        mood={mood}
        onMood={setMood}
        directions={directions}
        onDirections={setDirections}
        disabled={pending}
      />

      <div className="mt-4">
        <Checkbox
          label="Run the research now"
          hint="Faster to a draft. The durable queue is the safety net either way."
          checked={runInline}
          onChange={(e) => setRunInline(e.target.checked)}
          disabled={pending}
        />
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-meta leading-snug text-subtle">
        <Rocket className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Every seeded Space starts as an unlisted demo. Nothing goes live until you flip it.
      </p>
    </SparkShell>
  )
}
