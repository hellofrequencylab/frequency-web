'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE PRACTICE SPARK, composed from the Spark kit (docs/STUDIO.md §0, ADR-986 · ADR-358).
//
// The Practice wizard was a copy of the Journey wizard: its own column, its own progress cue, its
// own field styling, and a manual door that was an 11px grey text link ("Skip, I'll build it
// myself"). It now declares nothing about how a field looks and composes the kit instead:
//
//   SparkShell     the staged surface, the progress cue, the footer vocabulary
//   SparkDoors     screen one: two doors at EQUAL weight
//   SparkDropzone  one drop zone under BOTH doors (paste it, or upload the write-up)
//   FieldControl   one control per field KIND, rendered from PRACTICE_MANIFEST
//   SparkSteer     the mood dial, on review, so it costs no extra step
//
// EVERY ENTRY PATH IS KEPT:
//   • Vera drafts it, from four questions          (door 1)
//   • Build it yourself, in the full builder       (door 2, was a text link)
//   • Bring the practice you already wrote         (the drop zone, on screen one)
//
// DEFERRED CREATION IS UNCHANGED: nothing persists until the author commits a reviewed title.
// sparkPracticeAction, createPracticeFromSparkAction and createPracticeDraftAction keep their
// exact signatures and payloads. This is a front-door rebuild, not a pipeline change.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { SparkDoors, SparkDropzone, SparkShell, SparkSteer, FieldControl, StudioField } from '@/components/studio/spark'
import { isError } from '@/lib/action-result'
import { PRACTICE_MANIFEST } from '@/lib/studio/entities/practice'
import { sparkFields } from '@/lib/studio/kernel/review-kernel'
import { DEFAULT_SEED_MOOD, type SeedMood } from '@/lib/studio/kernel/moods'
import type { FieldDef } from '@/lib/studio/kernel/manifest'
import { sparkPracticeAction, createPracticeFromSparkAction } from '@/app/(main)/practices/create-actions'
import { createPracticeDraftAction } from '@/app/(main)/practices/actions'
import type { PracticePace, PracticeCadenceHint, PracticeSparkTimer } from '@/lib/ai/practice-spark'
import { timerPreview } from '@/lib/movement'

// The Be Still sub-mode LABELS (naming canon: member copy never shows raw enum slugs).
const MINDLESS_LABEL: Record<string, string> = {
  meditate: 'Meditate',
  breathe: 'Breathe',
  journal: 'Journal',
  stillness: 'Stillness',
  ritual: 'Ritual',
}

/**
 * The three cadence hints the Spark offers. The manifest declares `answers.cadence` as the
 * `cadence` KIND, which the kit renders as free text (right for "Wednesdays, coffee after", wrong
 * here): this question feeds `PracticeCadenceHint`, a closed set of three. Until the manifest
 * declares it a `select` (the kernel's own note says a closed recurrence is a select), the Spark
 * overrides the control kind locally and keeps the value space safe.
 */
const CADENCE_OPTIONS: { value: PracticeCadenceHint; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'few-times-week', label: 'A few times a week' },
  { value: 'weekly', label: 'Weekly' },
]

const CADENCE_VALUES = CADENCE_OPTIONS.map((c) => c.value)

/** The four Pillars a Practice can develop. A Practice may span more than one, which is why this
 *  stays a chip group: the manifest's `domain_id` is a single loaded reference by id, and the
 *  create action takes Pillar slugs. */
const PILLARS: { key: 'mind' | 'body' | 'spirit' | 'expression'; label: string }[] = [
  { key: 'mind', label: 'Mind' },
  { key: 'body', label: 'Body' },
  { key: 'spirit', label: 'Spirit' },
  { key: 'expression', label: 'Expression' },
]

/** Every declared field, by path. The wizard renders the MANIFEST; it never restates a field. */
const FIELD = new Map<string, FieldDef>(PRACTICE_MANIFEST.fields.map((f) => [f.path, f]))

/** The fields a Spark asks for (`placement: 'spark'` plus anything required), by path. `title` is
 *  in here because it is required; it is asked on review, where the author names what Vera drafted. */
const ASKED = new Map<string, FieldDef>(sparkFields(PRACTICE_MANIFEST).map((f) => [f.path, f]))

/**
 * The question sequence. The FIELDS come from the manifest; only the framing (which paths share a
 * screen, and the example that helps someone answer) lives here, because an example tuned to the
 * question being asked is copy, not schema.
 */
const QUESTIONS: { label: string; title: string; description: string; paths: string[]; requires?: string }[] = [
  {
    label: 'Who',
    title: 'Who is this Practice for?',
    description: 'Tell Vera who it is for in a sentence and she drafts the whole Practice.',
    paths: ['answers.who'],
    requires: 'answers.who',
  },
  {
    label: 'The act',
    title: 'What do they actually do?',
    description: 'The act, in plain words. The concrete thing, not a vibe.',
    paths: ['answers.act'],
    requires: 'answers.act',
  },
  {
    label: 'Outcome',
    title: 'What do they walk away with?',
    description: 'The outcome after a week. Lead with the feeling, plainly.',
    paths: ['answers.outcome'],
    requires: 'answers.outcome',
  },
  {
    label: 'Shape',
    title: 'How often, and how long?',
    description: 'Keep the ask honest. The entry version should fit in five minutes.',
    paths: ['answers.cadence', 'answers.pace'],
  },
]

/** The ghost example in each question's control. A placeholder is tuned to the question being
 *  asked, which is why the kit takes it as a prop rather than reading it off the manifest. */
const PLACEHOLDER: Record<string, string> = {
  'answers.who': 'e.g. People who wake up wired and want a calmer start.',
  'answers.act': 'e.g. Sit for two minutes and breathe before reaching for the phone.',
  'answers.outcome': 'e.g. Start the day a notch calmer, most mornings.',
}

/** What the review controls accept, matching what the server stores (lib/practices.ts). */
const LIMIT = { title: 80, summary: 140, description: 280, body: 8000 } as const

export function PracticeSpark() {
  const router = useRouter()
  // 'doors' is screen one for every entity. The written path skips the questions entirely, which
  // is why the step count differs by path.
  const [stage, setStage] = useState<'doors' | 'questions' | 'review'>('doors')
  const [fromSource, setFromSource] = useState(false)
  const [qIndex, setQIndex] = useState(0)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [who, setWho] = useState('')
  const [act, setAct] = useState('')
  const [outcome, setOutcome] = useState('')
  const [cadence, setCadence] = useState<PracticeCadenceHint>('daily')
  const [pace, setPace] = useState<PracticePace>('light')
  const [sourceText, setSourceText] = useState('') // the practice they already wrote

  // Vera's drafted Practice (review step, editable).
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [pillars, setPillars] = useState<Array<'mind' | 'body' | 'spirit' | 'expression'>>([])
  const [draftCadence, setDraftCadence] = useState('')
  const [durationMin, setDurationMin] = useState<number | null>(null)
  // The timer half of Vera's draft (ADR-920 Phase 5): carried through to creation so the
  // practice ships with its timer preset instead of the silent default sit. Shown read-only
  // on the review step; the full tuning lives in the builder after create.
  const [timer, setTimer] = useState<PracticeSparkTimer | null>(null)
  // The mood dial (kernel/moods.ts), shown on review so it costs no extra step.
  const [mood, setMood] = useState<SeedMood>(DEFAULT_SEED_MOOD)

  const source = sourceText.trim()

  // One binding per asked field. The control comes from the manifest; the value stays in the exact
  // shape sparkPracticeAction already takes.
  const bound: Record<string, { value: string; set: (next: string) => void }> = {
    'answers.who': { value: who, set: setWho },
    'answers.act': { value: act, set: setAct },
    'answers.outcome': { value: outcome, set: setOutcome },
    'answers.cadence': {
      value: cadence,
      set: (next) => setCadence(CADENCE_VALUES.includes(next as PracticeCadenceHint) ? (next as PracticeCadenceHint) : 'daily'),
    },
    'answers.pace': { value: pace, set: (next) => setPace(next === 'medium' ? 'medium' : 'light') },
  }

  /** The declared field, with the one local control override the kernel cannot express yet. */
  const asked = (path: string): FieldDef | null => {
    const def = ASKED.get(path)
    if (!def) return null
    if (path === 'answers.cadence') return { ...def, kind: 'select', options: CADENCE_OPTIONS }
    return def
  }

  const askField = (path: string) => {
    const def = asked(path)
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
        />
      </StudioField>
    )
  }

  const reviewField = (path: string, value: string, set: (next: string) => void, max: number, placeholder?: string) => {
    const def = FIELD.get(path)
    if (!def) return null
    return (
      <StudioField label={def.label}>
        <FieldControl
          def={def}
          value={value}
          // The same cap the control used to carry as `maxLength`, and the same one
          // lib/practices.ts applies on write, so a paste truncates instead of surprising later.
          onChange={(next) => set((Array.isArray(next) ? next.join(', ') : next).slice(0, max))}
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
      const res = await sparkPracticeAction({ who, act, outcome, cadence, pace }, source || undefined)
      if (isError(res)) {
        setError(res.error)
      } else {
        setTitle(res.data.title)
        setSummary(res.data.summary)
        setDescription(res.data.description)
        setBody(res.data.body)
        setPillars(res.data.pillar ? [res.data.pillar] : [])
        setDraftCadence(res.data.cadence)
        setDurationMin(res.data.durationMin)
        setTimer(res.data.timer ?? null)
      }
      setStage('review')
    })
  }

  const create = () => {
    if (!title.trim()) return
    setError(null)
    start(() =>
      createPracticeFromSparkAction({
        title,
        summary,
        description,
        body,
        pillars,
        cadence: draftCadence || null,
        durationMin,
        timer,
      }),
    )
  }

  // The manual door: a blank draft, then straight into the full editor (mirrors NewPracticeButton).
  const buildItMyself = () => {
    setError(null)
    start(async () => {
      const r = await createPracticeDraftAction()
      if (isError(r)) setError(r.error)
      else router.push(`/practices/${r.data.id}/edit`)
    })
  }

  // ── Screen one: the doors ──

  if (stage === 'doors') {
    return (
      <SparkShell
        eyebrow="New Practice"
        title="How do you want to start?"
        description="Both ways make the same Practice. Pick whichever suits what you already have."
        step={1}
        totalSteps={QUESTIONS.length + 2}
        stepLabel="Start"
        error={error}
      >
        <SparkDoors
          entityLabel={PRACTICE_MANIFEST.label}
          onVera={() => {
            setFromSource(!!source)
            if (source) {
              // Straight to review: the write-up answered the questions, so the only screen left
              // is the draft itself, which reports its own "Vera is shaping…" state while it runs.
              setStage('review')
              generate()
            } else {
              setQIndex(0)
              setStage('questions')
            }
          }}
          onManual={buildItMyself}
          veraLabel="Have Vera draft it"
          veraHint="Answer four short questions and Vera writes the whole Practice, guide and all, for you to review."
          manualLabel="Build it yourself"
          manualHint="Go straight to the builder and write the guide, the Pillars, and the timer your own way."
          disabled={pending}
        >
          <SparkDropzone
            accepts={PRACTICE_MANIFEST.accepts ?? []}
            sourceText={sourceText}
            onSourceText={setSourceText}
            disabled={pending}
          />
        </SparkDoors>
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
        eyebrow="New Practice"
        title={q.title}
        description={q.description}
        step={2 + qIndex}
        totalSteps={QUESTIONS.length + 2}
        stepLabel={q.label}
        onBack={() => (qIndex === 0 ? setStage('doors') : setQIndex((i) => i - 1))}
        onNext={() => (last ? generate() : setQIndex((i) => i + 1))}
        nextLabel={last ? 'Draft with Vera' : 'Continue'}
        nextDisabled={!answered}
        busy={pending}
        error={error}
        exits={[{ label: 'Build it yourself', onSelect: buildItMyself }]}
      >
        <div className="space-y-5">{q.paths.map((path) => askField(path))}</div>
      </SparkShell>
    )
  }

  // ── Review. Vera's draft, editable, with the mood dial. Nothing has persisted yet. ──

  const drafting = pending && !title

  return (
    <SparkShell
      eyebrow="New Practice"
      title="Here is your Practice"
      description="Vera's draft. Edit anything, then create it."
      step={fromSource ? 2 : QUESTIONS.length + 2}
      totalSteps={fromSource ? 2 : QUESTIONS.length + 2}
      stepLabel="Review"
      onBack={() => {
        if (fromSource) setStage('doors')
        else {
          setQIndex(QUESTIONS.length - 1)
          setStage('questions')
        }
      }}
      onNext={create}
      nextLabel="Create Practice"
      nextDisabled={!title.trim()}
      busy={pending}
      error={error}
    >
      {drafting ? (
        <p className="flex items-center gap-2 rounded-card border border-border bg-canvas px-4 py-3 text-body-sm text-muted">
          <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-primary-strong" aria-hidden /> Vera is shaping your Practice…
        </p>
      ) : (
        <div className="space-y-4">
          {reviewField('title', title, setTitle, LIMIT.title, 'Name your Practice')}
          {reviewField('summary', summary, setSummary, LIMIT.summary, 'The problem it solves, in a line')}
          {reviewField('description', description, setDescription, LIMIT.description, "Who it's for and what they notice after a week")}
          {reviewField('body', body, setBody, LIMIT.body, 'The steps, in plain words')}

          <div>
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Pillars</p>
            <div className="flex flex-wrap gap-1.5">
              {PILLARS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  disabled={pending}
                  onClick={() => setPillars((prev) => (prev.includes(p.key) ? prev.filter((x) => x !== p.key) : [...prev, p.key]))}
                  aria-pressed={pillars.includes(p.key)}
                  className={`rounded-pill border px-3 py-1 text-meta font-medium transition-colors disabled:opacity-60 ${
                    pillars.includes(p.key)
                      ? 'border-primary/40 bg-primary-bg text-primary-strong'
                      : 'border-border bg-surface text-muted hover:text-text'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-2xs text-muted">
              Pick one or more Pillars. You can change them, the cadence, and everything else in the next step.
            </p>
          </div>

          {timer && (
            <div className="rounded-card border border-border bg-canvas px-3.5 py-2.5">
              <span className="block text-2xs font-semibold uppercase tracking-wide text-muted">How it is done</span>
              <p className="mt-0.5 text-body-sm font-medium text-text">
                {timerPreview({
                  timerKind: timer.timerKind,
                  movementConfig: timer.movementMode ? { mode: timer.movementMode } : null,
                  durationMin,
                })}
                {timer.mindlessMode && timer.timerKind === 'mindless' ? ` · ${MINDLESS_LABEL[timer.mindlessMode] ?? ''}` : ''}
              </p>
              <p className="mt-0.5 text-2xs text-muted">Vera set the timer to match the act. Tune every part of it in the next step.</p>
            </div>
          )}

          {/* The mood dial (kernel/moods.ts). On review, so it costs no extra step. */}
          <SparkSteer
            steer={{ mood: PRACTICE_MANIFEST.steer?.mood }}
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
