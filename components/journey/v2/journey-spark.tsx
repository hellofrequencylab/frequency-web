'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE JOURNEY SPARK, composed from the Spark kit (docs/STUDIO.md §0, ADR-986 · ADR-302).
//
// This file used to be the wizard every other wizard was copied from: its own centered column,
// its own progress cue, its own heading block, its own field styling, and a manual door that was
// an 11px grey text link under the card. It now DECLARES nothing about how a field looks and
// composes the kit instead:
//
//   SparkShell     the staged surface, the progress cue, the footer vocabulary
//   SparkDoors     screen one: two doors at EQUAL weight, plus the entity's extra doors
//   SparkDropzone  one drop zone under BOTH doors (source material is source material either way)
//   FieldControl   one control per field KIND, rendered from JOURNEY_MANIFEST
//   SparkSteer     the mood dial, on review, so it costs no extra step
//
// EVERY ENTRY PATH IS KEPT. What was buried is now first-class:
//   • Vera drafts it, from four questions                     (door 1)
//   • Build it yourself, in the full builder                  (door 2, was a text link)
//   • The recommended Master Framework, no AI                 (extra door)
//   • A ready-made template                                   (extra door, then the picker)
//   • Bring your own write-up, pasted or uploaded             (the drop zone, on screen one)
//
// DEFERRED CREATION IS UNCHANGED: nothing persists until the author commits a reviewed title.
// The server actions (sparkJourneyAction, createJourneyFromSparkAction, createMasterFrameworkAction,
// createJourneyFromTemplateAction, extractOverviewFilesAction) keep their exact signatures and
// payloads. This is a front-door rebuild, not a pipeline change.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Compass, FileStack, LayoutTemplate, Loader2, Sparkles } from 'lucide-react'
import { wizardSecondaryClass } from '@/components/templates'
import {
  SparkDoors,
  SparkDropzone,
  SparkShell,
  SparkSteer,
  FieldControl,
  StudioField,
  type SparkDoor,
} from '@/components/studio/spark'
import { InfoTip } from '@/components/ui/info-tip'
import { isError } from '@/lib/action-result'
import { JOURNEY_MANIFEST } from '@/lib/studio/entities/journey'
import { sparkFields } from '@/lib/studio/kernel/review-kernel'
import { DEFAULT_SEED_MOOD, type SeedMood } from '@/lib/studio/kernel/moods'
import type { FieldDef } from '@/lib/studio/kernel/manifest'
import {
  sparkJourneyAction,
  createJourneyFromSparkAction,
  extractOverviewFilesAction,
  createMasterFrameworkAction,
  createJourneyFromTemplateAction,
} from '@/app/(main)/journeys/create-actions'
import type { JourneyPace, ArcWeek, SparkSettings, SparkMeeting } from '@/lib/ai/journey-spark'
import { JourneyBuilder } from './journey-builder'

const EMPTY_MEETING: SparkMeeting = { format: null, schedule: null, timezone: null, location: null, link: null }

/** Every declared field, by path. The wizard renders the MANIFEST; it never restates a field. */
const FIELD = new Map<string, FieldDef>(JOURNEY_MANIFEST.fields.map((f) => [f.path, f]))

/** The fields a Spark asks for (`placement: 'spark'` plus anything required), by path. `title` is
 *  in here because it is required; it is asked on the review step, where the author names what
 *  Vera drafted, which is the one question that cannot be asked before there is a draft. */
const ASKED = new Map<string, FieldDef>(sparkFields(JOURNEY_MANIFEST).map((f) => [f.path, f]))

/**
 * The question sequence. The FIELDS come from the manifest; only the framing (which paths share a
 * screen, and the example that helps someone answer) lives here, because an example tuned to the
 * question being asked is copy, not schema.
 */
const QUESTIONS: { label: string; title: string; description: string; paths: string[]; requires?: string }[] = [
  {
    label: 'Who',
    title: 'Tell us about this Journey',
    description: 'Who is it for, and what do you want them to get out of it?',
    paths: ['answers.who'],
    requires: 'answers.who',
  },
  {
    label: 'About',
    title: 'What is it about?',
    description: 'A topic, or just general wellbeing. Either works.',
    paths: ['answers.topic'],
    requires: 'answers.topic',
  },
  {
    label: 'Outcome',
    title: 'What should people walk away with?',
    description: 'The outcome, in plain words. Lead with the feeling.',
    paths: ['answers.outcome'],
    requires: 'answers.outcome',
  },
  {
    label: 'Shape',
    title: 'How long, and how much a day?',
    description: 'One Phase per week. Keep the daily ask honest.',
    paths: ['answers.weeks', 'answers.pace'],
  },
]

/** The ghost example in each question's control. A placeholder is tuned to the question being
 *  asked, which is why the kit takes it as a prop rather than reading it off the manifest. */
const PLACEHOLDER: Record<string, string> = {
  'answers.who':
    'e.g. Busy parents who feel wired and tired. By the end they keep a ten minute evening wind down and get their evenings back.',
  'answers.topic': 'e.g. Sleep and screen habits. Or: general wellbeing.',
  'answers.outcome': 'e.g. Fall asleep easier and wake up clearer, most days.',
}

/** A line under the control, where the answer needs a bound rather than an example. */
const HINT: Record<string, string> = {
  'answers.weeks': 'One Phase per week. Anything from one to twelve.',
  'answers.pace': 'The honest daily ask. It sets the minutes shown on the card.',
}

/** Client-safe template metadata for the "Start from a template" door (the full template trees
 *  in lib/journeys/templates.ts pull server-only compose code, so the page maps to this shape). */
export interface JourneyTemplateMeta {
  id: string
  name: string
  description: string
  emoji: string
  phases: number
  lessons: number
}

/** Weeks is a plain number field: keep it inside what createJourneyFromSparkAction will honour. */
function clampWeeks(raw: string): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? Math.min(12, n) : 4
}

export function JourneySpark({
  templates = [],
  spaceSlug = null,
}: {
  templates?: JourneyTemplateMeta[]
  /** When set, this same guided create is reached from a Space's Journeys manager: the new Journey is
   *  stamped to that Space (owner authoring), not the caller's personal account. */
  spaceSlug?: string | null
}) {
  const router = useRouter()
  // 'doors' is screen one for every entity. 'questions' and 'source' are the two lengths the
  // guided path comes in; 'templates' is this entity's own extra door; 'manual' leaves the Spark.
  const [stage, setStage] = useState<'doors' | 'questions' | 'source' | 'templates' | 'review' | 'manual'>('doors')
  const [fromSource, setFromSource] = useState(false)
  const [qIndex, setQIndex] = useState(0)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [who, setWho] = useState('')
  const [topic, setTopic] = useState('')
  const [outcome, setOutcome] = useState('')
  const [weeksText, setWeeksText] = useState('4')
  const [pace, setPace] = useState<JourneyPace>('light')
  const [sourceText, setSourceText] = useState('') // the pasted / uploaded write-up
  const [extracting, setExtracting] = useState(false)
  const [skipped, setSkipped] = useState<string[]>([]) // files Vera could not read (surfaced honestly)

  // Vera's drafted identity (review step, editable).
  const [title, setTitle] = useState('')
  const [promise, setPromise] = useState('')
  const [overview, setOverview] = useState('')
  const [arc, setArc] = useState<ArcWeek[]>([])
  const [settings, setSettings] = useState<SparkSettings | null>(null)
  // How the group meets (ADR-302). Pre-filled from Vera's extraction on review; the author can
  // confirm or edit. Stays all-null when nothing is set, so the Journey persists no meeting.
  const [meeting, setMeeting] = useState<SparkMeeting>(EMPTY_MEETING)
  const patchMeeting = (patch: Partial<SparkMeeting>) => setMeeting((m) => ({ ...m, ...patch }))
  // The mood dial (kernel/moods.ts), shown on review so it costs no extra step.
  const [mood, setMood] = useState<SeedMood>(DEFAULT_SEED_MOOD)

  if (stage === 'manual') return <JourneyBuilder draft spaceSlug={spaceSlug} />

  const weeks = clampWeeks(weeksText)
  const source = sourceText.trim()

  // One binding per asked field. The control comes from the manifest; the value stays in the
  // exact shape createJourneyFromSparkAction already takes.
  const bound: Record<string, { value: string; set: (next: string) => void }> = {
    'answers.who': { value: who, set: setWho },
    'answers.topic': { value: topic, set: setTopic },
    'answers.outcome': { value: outcome, set: setOutcome },
    'answers.weeks': { value: weeksText, set: setWeeksText },
    'answers.pace': { value: pace, set: (next) => setPace(next === 'medium' ? 'medium' : 'light') },
  }

  const askField = (path: string) => {
    const def = ASKED.get(path)
    const bind = bound[path]
    if (!def || !bind) return null
    return (
      <StudioField key={path} label={def.label}>
        <FieldControl
          def={def}
          value={bind.value}
          onChange={(next) => bind.set(Array.isArray(next) ? next.join(', ') : next)}
          disabled={pending}
          placeholder={PLACEHOLDER[path]}
          hint={HINT[path]}
        />
      </StudioField>
    )
  }

  const reviewField = (path: string, value: string, set: (next: string) => void, placeholder?: string) => {
    const def = FIELD.get(path)
    if (!def) return null
    return (
      <StudioField label={def.label}>
        <FieldControl
          def={def}
          value={value}
          onChange={(next) => set(Array.isArray(next) ? next.join(', ') : next)}
          disabled={pending}
          placeholder={placeholder}
        />
      </StudioField>
    )
  }

  // ── The actions. Signatures and payloads are exactly as they were. ──

  const generate = () => {
    setError(null)
    start(async () => {
      const res = await sparkJourneyAction({ who, topic, outcome, weeks, pace }, source || undefined)
      if (isError(res)) {
        setError(res.error)
      } else {
        setTitle(res.data.title)
        setPromise(res.data.promise)
        setOverview(res.data.overview)
        setArc(res.data.arc ?? [])
        setSettings(res.data.settings ?? null)
        setMeeting(res.data.meeting ?? EMPTY_MEETING)
      }
      setStage('review')
    })
  }

  const create = () => {
    if (!title.trim()) return
    setError(null)
    start(() =>
      createJourneyFromSparkAction(
        {
          title,
          promise,
          overview,
          answers: { who, topic, outcome, weeks, pace },
          arc,
          settings: settings ?? undefined,
          meeting,
          sourceText: source || undefined,
        },
        spaceSlug,
      ),
    )
  }

  // The recommended path: stamp the new Journey to the Master Framework (deterministic, no AI) and
  // open its editor. Uses the chosen number of weeks; the rest is the recommended shape, ready to fill.
  const framework = () => {
    setError(null)
    start(async () => {
      const res = await createMasterFrameworkAction({ weeks, spaceSlug })
      if (isError(res)) setError(res.error)
      else router.push(`/journeys/${res.data.slug}/edit`)
    })
  }

  // Instantiate one of the simple template skeletons into a fresh private draft, then (the action
  // redirects server-side) drop into the editor to make it yours.
  const chooseTemplate = (id: string) => {
    setError(null)
    start(() => createJourneyFromTemplateAction(id, spaceSlug))
  }

  // Read a WHOLE stack of files at once (the outline plus any supporting docs). Vera extracts each
  // supported file (PDF, Word, text) and concatenates them; any it cannot read is reported honestly.
  const onFiles = (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : []
    if (!files.length) return
    setError(null)
    setSkipped([])
    setExtracting(true)
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    start(async () => {
      const res = await extractOverviewFilesAction(fd)
      if (isError(res)) setError(res.error)
      else {
        setSourceText((prev) => (prev.trim() ? `${prev}\n\n${res.data.text}` : res.data.text))
        setSkipped(res.data.skipped)
      }
      setExtracting(false)
    })
  }

  // The drop zone, plus this entity's batch upload. The kit's zone takes one document at a time
  // (it appends), and "drop in your whole course at once" is the Journey's own promise, so the
  // multi-file picker rides beside it on the unchanged extractOverviewFilesAction.
  const sourceZone = (
    <>
      <SparkDropzone
        accepts={JOURNEY_MANIFEST.accepts ?? []}
        sourceText={sourceText}
        onSourceText={setSourceText}
        disabled={pending}
      />
      <BatchUpload onFiles={onFiles} extracting={extracting} disabled={pending} skipped={skipped} />
    </>
  )

  // ── Screen one: the doors ──

  if (stage === 'doors') {
    const extraDoors: SparkDoor[] = [
      {
        key: 'framework',
        label: 'Use the recommended framework',
        hint: 'The proven shape, with no AI: a welcome, weekly practices across the Pillars, an Expression Challenge each week, and a capstone.',
        Icon: Compass,
        onSelect: framework,
      },
    ]
    if (templates.length > 0) {
      extraDoors.push({
        key: 'templates',
        label: 'Start from a template',
        hint: `${templates.length} ready-made shapes. We create it as a private draft and open the editor so you can make it yours.`,
        Icon: LayoutTemplate,
        onSelect: () => setStage('templates'),
      })
    }

    return (
      <SparkShell
        eyebrow="New Journey"
        title="How do you want to start?"
        description="Every way here makes the same Journey. Pick whichever suits what you already have."
        step={1}
        totalSteps={QUESTIONS.length + 2}
        stepLabel="Start"
        error={error}
      >
        <SparkDoors
          entityLabel={JOURNEY_MANIFEST.label}
          onVera={() => {
            setFromSource(!!source)
            setStage(source ? 'source' : 'questions')
            setQIndex(0)
          }}
          onManual={() => setStage('manual')}
          veraLabel="Have Vera draft it"
          veraHint="Answer four short questions and Vera drafts the name, the promise, and the weekly arc for you to edit."
          manualLabel="Build it yourself"
          manualHint="Go straight to the builder and shape the Phases, modules, and lessons your own way."
          extraDoors={extraDoors}
          disabled={pending}
        >
          {sourceZone}
        </SparkDoors>
      </SparkShell>
    )
  }

  // ── The template picker (this entity's extra door) ──

  if (stage === 'templates') {
    return (
      <SparkShell
        eyebrow="New Journey"
        title="Start from a proven structure"
        description="Pick a shape. We create it as a private draft and open the editor so you can make it yours."
        step={2}
        totalSteps={2}
        stepLabel="Template"
        error={error}
        footer={
          <button type="button" onClick={() => setStage('doors')} disabled={pending} className={`${wizardSecondaryClass} w-full`}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </button>
        }
      >
        <ul className="space-y-2.5">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => chooseTemplate(t.id)}
                disabled={pending}
                className="flex w-full items-start gap-3 rounded-control border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-elevated disabled:opacity-60"
              >
                <span className="text-page-title leading-none" aria-hidden>
                  {t.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-semibold text-text">{t.name}</span>
                  <span className="block text-meta leading-snug text-muted">{t.description}</span>
                  <span className="mt-1 block text-2xs font-medium uppercase tracking-wide text-muted">
                    {t.phases} {t.phases === 1 ? 'phase' : 'phases'} · {t.lessons} {t.lessons === 1 ? 'lesson' : 'lessons'}
                  </span>
                </span>
                {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary-strong" aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      </SparkShell>
    )
  }

  // ── The source path: one screen, because the write-up already came in on screen one ──

  if (stage === 'source') {
    return (
      <SparkShell
        eyebrow="New Journey"
        title="Your course, and how long it runs"
        description="Vera builds the whole Journey from what you brought. Tell her how many weeks to lay it out over."
        step={2}
        totalSteps={3}
        stepLabel="Your course"
        onBack={() => setStage('doors')}
        onNext={generate}
        nextLabel="Draft with Vera"
        nextDisabled={!source}
        busy={pending}
        error={error}
        exits={[
          {
            label: 'Answer the questions instead',
            onSelect: () => {
              setFromSource(false)
              setQIndex(0)
              setStage('questions')
            },
          },
          { label: 'Build it yourself', onSelect: () => setStage('manual') },
        ]}
      >
        <div className="space-y-4">
          {sourceZone}
          {/* Weeks, and only weeks: the same one question this path has always asked. The daily
              ask comes from what Vera reads in the write-up. */}
          {askField('answers.weeks')}
        </div>
      </SparkShell>
    )
  }

  // ── The question path ──

  if (stage === 'questions') {
    const q = QUESTIONS[qIndex]
    const last = qIndex === QUESTIONS.length - 1
    const answered = !q.requires || (bound[q.requires]?.value.trim().length ?? 0) > 0

    return (
      <SparkShell
        eyebrow="New Journey"
        title={q.title}
        description={
          qIndex === 0 ? (
            <>
              {q.description}{' '}
              <InfoTip
                side="bottom"
                label="Describe the person and the change. For example: busy parents who want calmer mornings, and by the end they keep a ten minute routine that sticks. The more specific you are, the sharper Vera's draft."
              />
            </>
          ) : (
            q.description
          )
        }
        step={2 + qIndex}
        totalSteps={QUESTIONS.length + 2}
        stepLabel={q.label}
        onBack={() => (qIndex === 0 ? setStage('doors') : setQIndex((i) => i - 1))}
        onNext={() => (last ? generate() : setQIndex((i) => i + 1))}
        nextLabel={last ? 'Draft with Vera' : 'Continue'}
        nextDisabled={!answered}
        busy={pending}
        error={error}
        exits={[{ label: 'Build it yourself', onSelect: () => setStage('manual') }]}
      >
        <div className="space-y-5">{q.paths.map((path) => askField(path))}</div>
      </SparkShell>
    )
  }

  // ── Review. Vera's draft, editable, with the mood dial. Nothing has persisted yet. ──

  const drafting = pending && !title

  return (
    <SparkShell
      eyebrow="New Journey"
      title="Here is your Journey"
      description="Vera's draft. Edit anything, then create it."
      step={fromSource ? 3 : QUESTIONS.length + 2}
      totalSteps={fromSource ? 3 : QUESTIONS.length + 2}
      stepLabel="Review"
      onBack={() => {
        if (fromSource) setStage('source')
        else {
          setQIndex(QUESTIONS.length - 1)
          setStage('questions')
        }
      }}
      onNext={create}
      nextLabel="Create Journey"
      nextDisabled={!title.trim()}
      busy={pending}
      error={error}
    >
      {drafting ? (
        <p className="flex items-center gap-2 rounded-card border border-border bg-canvas px-4 py-3 text-body-sm text-muted">
          <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-primary-strong" aria-hidden /> Vera is drafting your Journey…
        </p>
      ) : (
        <div className="space-y-4">
          {reviewField('title', title, setTitle, 'Name your Journey')}
          {reviewField('summary', promise, setPromise, "What they'll walk away with")}
          {reviewField('intro', overview, setOverview, "What this is and who it's for.")}

          {arc.length > 0 && (
            <div>
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
                Your {arc.length} {arc.length === 1 ? 'week' : 'weeks'}
              </p>
              <ol className="space-y-1.5">
                {arc.map((w, i) => (
                  <li key={i} className="rounded-lg border border-border bg-surface px-3 py-2">
                    <span className="block text-body-sm font-medium text-text">
                      Week {i + 1}: {w.title}
                    </span>
                    {w.focus && <span className="block text-meta leading-snug text-muted">{w.focus}</span>}
                  </li>
                ))}
              </ol>
              <p className="mt-1.5 text-2xs text-muted">Vera lays these out as weekly Phases. Edit them in the next step.</p>
            </div>
          )}

          {/* How the group meets (ADR-302). Optional and pre-filled from Vera's read of the
              outline; the full editor lives in the Journey's Settings panel later. */}
          <div className="space-y-3 rounded-card border border-border bg-canvas px-3.5 py-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted">How will you meet?</p>
            {reviewField('meeting.format', meeting.format ?? '', (next) =>
              patchMeeting({ format: (next || null) as SparkMeeting['format'] }),
            )}
            {reviewField('meeting.schedule', meeting.schedule ?? '', (next) => patchMeeting({ schedule: next || null }), 'e.g. Sundays 7pm')}
            {reviewField('meeting.timezone', meeting.timezone ?? '', (next) => patchMeeting({ timezone: next || null }), 'e.g. ET')}
            {(meeting.format === 'in_person' || meeting.format === 'hybrid') &&
              reviewField('meeting.location', meeting.location ?? '', (next) => patchMeeting({ location: next || null }), 'e.g. The community hall')}
            {(meeting.format === 'virtual' || meeting.format === 'hybrid') &&
              reviewField('meeting.link', meeting.link ?? '', (next) => patchMeeting({ link: next || null }), 'https://')}
            <p className="text-2xs text-muted">Optional. You can fine-tune this in Settings later.</p>
          </div>

          {/* The mood dial (kernel/moods.ts). On review, so it costs no extra step. */}
          <SparkSteer
            steer={{ mood: JOURNEY_MANIFEST.steer?.mood }}
            mood={mood}
            onMood={setMood}
            directions=""
            onDirections={() => {}}
            disabled={pending}
          />
        </div>
      )}
    </SparkShell>
  )
}

/**
 * The Journey's batch upload, beside the shared drop zone. The kit's zone reads one document at a
 * time; "bring your whole course at once" is this entity's own promise, so the multi-file picker
 * stays, on the same server action it always used, reporting honestly what it could not read.
 */
function BatchUpload({
  onFiles,
  extracting,
  disabled,
  skipped,
}: {
  onFiles: (files: FileList | null) => void
  extracting: boolean
  disabled?: boolean
  skipped: string[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || extracting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
        >
          {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileStack className="h-3.5 w-3.5" aria-hidden />}
          {extracting ? 'Reading…' : 'Add several files at once'}
        </button>
        <span className="inline-flex items-center gap-1 text-2xs text-subtle">
          Your outline and every handout
          <InfoTip
            side="top"
            label="Select your outline and every supporting document together. Vera reads PDF, Word, and plain text and weaves them into one Journey. A zip or an image is accepted but not read yet, so unzip first for now."
          />
        </span>
        <input
          ref={fileRef}
          type="file"
          multiple
          aria-label="Course documents"
          accept=".txt,.md,.pdf,.docx,.doc,.rtf,.pages,.zip,application/pdf,text/plain,application/zip"
          className="sr-only"
          onChange={(e) => {
            onFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {skipped.length > 0 && (
        <p className="mt-2 rounded-lg border border-border bg-canvas px-3 py-2 text-2xs text-muted">
          Could not read: {skipped.join(', ')}. Vera reads PDF, Word, and plain text.
        </p>
      )}
    </div>
  )
}
