'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowLeft, Loader2, Upload, Video, MapPin, Users, Compass, LayoutTemplate, PenLine } from 'lucide-react'
import { WizardProgress, wizardPrimaryClass, wizardSecondaryClass } from '@/components/templates'
import { InfoTip } from '@/components/ui/info-tip'
import { isError } from '@/lib/action-result'
import { sparkJourneyAction, createJourneyFromSparkAction, extractOverviewFilesAction, createMasterFrameworkAction, createJourneyFromTemplateAction } from '@/app/(main)/journeys/create-actions'
import type { JourneyPace, ArcWeek, SparkSettings, SparkMeeting } from '@/lib/ai/journey-spark'
import { JourneyBuilder } from './journey-builder'

// Meeting formats (ADR-302) — matches the editor's Settings panel so the chips read the same.
const MEETING_FORMATS = [
  ['virtual', Video, 'Virtual'],
  ['in_person', MapPin, 'In person'],
  ['hybrid', Users, 'Hybrid'],
] as const

const EMPTY_MEETING: SparkMeeting = { format: null, schedule: null, timezone: null, location: null, link: null }

// The guided Journey builder, Step 1 "Spark" (ADR-302). Two ways in:
//   • QUESTIONS — a short stepped form (who / about / outcome / shape), or
//   • OVERVIEW  — paste or upload your own write-up (PDF / Word / text) and let Vera rebuild it.
// Either way Vera drafts the identity + weekly arc for review, then committing creates the Journey
// (+ one Phase per week, opening week's practices) and drops into the editor. Nothing persists until
// that commit. "Build it myself" hands off to the manual draft editor.

const FIELD =
  'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-primary placeholder:text-subtle'

const WEEK_CHOICES = [2, 4, 6, 8] as const

/** Client-safe template metadata for the "Start from a template" picker (the full template trees
 *  in lib/journeys/templates.ts pull server-only compose code, so the page maps to this shape). */
export interface JourneyTemplateMeta {
  id: string
  name: string
  description: string
  emoji: string
  phases: number
  lessons: number
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
  const [mode, setMode] = useState<'wizard' | 'manual'>('wizard')
  const [usingOverview, setUsingOverview] = useState(false)
  const [picking, setPicking] = useState(false)
  const [step, setStep] = useState(1)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [who, setWho] = useState('')
  const [topic, setTopic] = useState('')
  const [outcome, setOutcome] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [pace, setPace] = useState<JourneyPace>('light')
  const [sourceText, setSourceText] = useState('') // the pasted / uploaded overview
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

  if (mode === 'manual') return <JourneyBuilder draft spaceSlug={spaceSlug} />

  const onReview = step === 5
  const total = picking ? 1 : usingOverview ? 2 : 5
  const current = picking ? 1 : onReview ? total : usingOverview ? 1 : step
  const label = picking ? 'Template' : onReview ? 'Review' : usingOverview ? 'Your overview' : ['Who', 'About', 'Outcome', 'Shape'][step - 1]

  const generate = () => {
    setError(null)
    start(async () => {
      const res = await sparkJourneyAction({ who, topic, outcome, weeks, pace }, usingOverview ? sourceText : undefined)
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
      setStep(5)
    })
  }

  const create = () => {
    if (!title.trim()) return
    setError(null)
    start(() =>
      createJourneyFromSparkAction({
        title,
        promise,
        overview,
        answers: { who, topic, outcome, weeks, pace },
        arc,
        settings: settings ?? undefined,
        meeting,
        sourceText: usingOverview ? sourceText : undefined,
      }, spaceSlug),
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

  const next = () => {
    if (usingOverview || step === 4) generate()
    else setStep((s) => Math.min(5, s + 1))
  }
  const back = () => setStep((s) => Math.max(1, s - 1))

  const canNext = usingOverview
    ? sourceText.trim().length > 0
    : (step === 1 && who.trim().length > 0) ||
      (step === 2 && topic.trim().length > 0) ||
      (step === 3 && outcome.trim().length > 0) ||
      step === 4

  const heading = picking
    ? { title: 'Start from a proven structure', description: 'Pick a shape. We create it as a private draft and open the editor so you can make it yours.' }
    : onReview
    ? { title: 'Here is your Journey', description: "Vera's draft. Edit anything, then create it." }
    : usingOverview
      ? { title: 'Upload your course', description: 'Drop in your outline and any supporting documents, all at once, and Vera builds the whole Journey from them. Or paste it below.' }
      : [
          { title: 'Tell us about this journey', description: "Who's it for, and what do you want them to get out of it?" },
          { title: 'What is it about?', description: 'A topic, or just general wellbeing. Either works.' },
          { title: 'What should people walk away with?', description: 'The outcome, in plain words. Lead with the feeling.' },
          { title: 'How long, and how much a day?', description: 'One Phase per week. Keep the daily ask honest.' },
        ][step - 1]

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <WizardProgress current={current} total={total} label={label} />

      <div className="mt-7">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary-strong">New Journey</p>
        <h1 className="flex items-center gap-1.5 text-2xl font-bold text-text">
          {heading.title}
          {!picking && !onReview && !usingOverview && step === 1 && (
            <InfoTip
              side="bottom"
              label="Describe the person and the change. For example: busy parents who want calmer mornings, and by the end they keep a ten minute routine that sticks. The more specific you are, the sharper Vera's draft."
            />
          )}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">{heading.description}</p>

        <div className="mt-5">
          {/* Combined structure picker (ADR-252, J4): the recommended framework, the ready-made
              templates, and a section by section scratch build, in one place. */}
          {picking && (
            <div className="space-y-2.5">
              {/* The recommended framework — the proven shape, no AI, filled as you go. */}
              <button
                type="button"
                onClick={framework}
                disabled={pending}
                className="flex w-full items-start gap-3 rounded-xl border border-primary/40 bg-primary-bg/30 px-4 py-3 text-left transition-colors hover:bg-primary-bg/50 disabled:opacity-60"
              >
                {pending ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary-strong" /> : <Compass className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                    Recommended framework
                    <span className="rounded-full bg-primary-bg px-1.5 py-0.5 text-2xs font-semibold text-primary-strong">Best start</span>
                  </span>
                  <span className="block text-xs leading-snug text-muted">The proven shape: a welcome, weekly practices across the Pillars, an Expression Challenge each week, and a capstone.</span>
                </span>
              </button>

              {/* Ready-made template skeletons. */}
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => chooseTemplate(t.id)}
                  disabled={pending}
                  className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-elevated disabled:opacity-60"
                >
                  <span className="text-2xl leading-none" aria-hidden>{t.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">{t.name}</span>
                    <span className="block text-xs leading-snug text-muted">{t.description}</span>
                    <span className="mt-1 block text-2xs font-medium uppercase tracking-wide text-subtle">
                      {t.phases} {t.phases === 1 ? 'phase' : 'phases'} · {t.lessons} {t.lessons === 1 ? 'lesson' : 'lessons'}
                    </span>
                  </span>
                  {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary-strong" /> : null}
                </button>
              ))}

              {/* Start from scratch — a blank draft with the three seeded phases, built section by section. */}
              <button
                type="button"
                onClick={() => setMode('manual')}
                disabled={pending}
                className="flex w-full items-start gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-elevated disabled:opacity-60"
              >
                <PenLine className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">Start from scratch</span>
                  <span className="block text-xs leading-snug text-muted">A blank Journey. Add phases, modules, and lessons section by section, at your own pace.</span>
                </span>
              </button>
            </div>
          )}

          {/* OVERVIEW path */}
          {!picking && usingOverview && !onReview && (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={8}
                className={FIELD}
                placeholder="Paste your course overview, outline, or notes here…"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={extracting || pending}
                  className={`${wizardSecondaryClass} !px-3 !py-2 text-sm`}
                >
                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload files
                </button>
                <span className="inline-flex items-center gap-1 text-xs text-subtle">
                  Add them all at once
                  <InfoTip
                    side="top"
                    label="Select your outline and every supporting document together. Vera reads PDF, Word, and plain text and weaves them into one Journey. A zip or an image is accepted but not read yet, so unzip first for now."
                  />
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.pdf,.docx,.doc,.rtf,.pages,.zip,application/pdf,text/plain,application/zip"
                  className="hidden"
                  onChange={(e) => { onFiles(e.target.files); e.target.value = '' }}
                />
              </div>

              {/* Vera AI note — set the expectation that a model drafts from what they upload. */}
              <p className="flex items-center gap-1 text-2xs text-subtle">
                <Sparkles className="h-3 w-3 text-primary-strong" aria-hidden /> Vera reads your files and drafts the Journey. You review and edit everything before it is created.
              </p>

              {/* Honest report of anything Vera could not read from the batch. */}
              {skipped.length > 0 && (
                <p className="rounded-lg border border-border bg-canvas px-3 py-2 text-2xs text-muted">
                  Could not read: {skipped.join(', ')}. Vera reads PDF, Word, and plain text.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">Weeks</span>
                {WEEK_CHOICES.map((w) => (
                  <button key={w} type="button" onClick={() => setWeeks(w)} aria-pressed={weeks === w}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${weeks === w ? 'border-primary/50 bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:text-text'}`}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* QUESTIONS path — step 1 landing: the "about" box + the two other ways in. */}
          {!picking && !usingOverview && step === 1 && (
            <>
              <textarea autoFocus value={who} onChange={(e) => setWho(e.target.value)} rows={4} className={FIELD} placeholder="e.g. Busy parents who feel wired and tired. By the end they keep a ten minute evening wind down and get their evenings back." />

              <p className="mt-5 mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Or start another way</p>

              {/* Second path: drop in a WHOLE stack of course docs at once and let Vera build it. */}
              <button
                type="button"
                onClick={() => { setUsingOverview(true); setStep(1) }}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-bg/20 px-4 py-3 text-left transition-colors hover:bg-primary-bg/40"
              >
                <Upload className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-semibold text-text">
                    Upload your course
                    <span className="rounded-full bg-primary-bg px-1.5 py-0.5 text-2xs font-semibold text-primary-strong">Vera AI</span>
                  </span>
                  <span className="block text-xs leading-snug text-muted">Already have a course written? Upload your outline and any supporting documents, all at once, and let Vera sort it out.</span>
                </span>
              </button>

              {/* Combined "proven structure": the recommended framework, the templates, and a section by
                  section scratch build, all in one picker. */}
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={pending}
                className="mt-3 flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-elevated disabled:opacity-60"
              >
                <LayoutTemplate className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">Start from a proven structure</span>
                  <span className="block text-xs leading-snug text-muted">The recommended framework, a ready-made template, or a blank build you shape section by section.</span>
                </span>
              </button>
            </>
          )}
          {!usingOverview && step === 2 && (
            <textarea autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} className={FIELD} placeholder="e.g. Sleep and screen habits. Or: general wellbeing." />
          )}
          {!usingOverview && step === 3 && (
            <textarea autoFocus value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={3} className={FIELD} placeholder="e.g. Fall asleep easier and wake up clearer, most days." />
          )}
          {!usingOverview && step === 4 && (
            <div className="space-y-5">
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Weeks</p>
                <div className="flex flex-wrap items-center gap-2">
                  {WEEK_CHOICES.map((w) => (
                    <button key={w} type="button" onClick={() => setWeeks(w)} aria-pressed={weeks === w}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${weeks === w ? 'border-primary/50 bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:text-text'}`}>
                      {w} weeks
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Time a day</p>
                <div className="grid grid-cols-2 gap-2">
                  {([['light', 'Light', 'A few minutes'], ['medium', 'Medium', 'Ten to twenty minutes']] as const).map(([key, lbl, hint]) => (
                    <button key={key} type="button" onClick={() => setPace(key)} aria-pressed={pace === key}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${pace === key ? 'border-primary/50 bg-primary-bg' : 'border-border bg-surface hover:bg-surface-elevated'}`}>
                      <span className="block text-sm font-semibold text-text">{lbl}</span>
                      <span className="block text-xs text-muted">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* REVIEW */}
          {onReview && (
            <div className="space-y-3">
              {pending && !title ? (
                <p className="flex items-center gap-2 rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-muted">
                  <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-primary-strong" aria-hidden /> Vera is drafting your Journey…
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Title</span>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${FIELD} font-semibold`} placeholder="Name your Journey" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">One-line promise</span>
                    <input value={promise} onChange={(e) => setPromise(e.target.value)} className={FIELD} placeholder="What they'll walk away with" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Overview</span>
                    <textarea value={overview} onChange={(e) => setOverview(e.target.value)} rows={4} className={FIELD} placeholder="What this is and who it's for." />
                  </label>
                  {arc.length > 0 && (
                    <div>
                      <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Your {arc.length} {arc.length === 1 ? 'week' : 'weeks'}</span>
                      <ol className="space-y-1.5">
                        {arc.map((w, i) => (
                          <li key={i} className="rounded-lg border border-border bg-surface px-3 py-2">
                            <span className="block text-sm font-medium text-text">Week {i + 1}: {w.title}</span>
                            {w.focus && <span className="block text-xs leading-snug text-muted">{w.focus}</span>}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-1.5 text-2xs text-subtle">Vera lays these out as weekly Phases. Edit them in the next step.</p>
                    </div>
                  )}

                  {/* How the group meets (ADR-302). Optional and pre-filled from Vera's read of the
                      outline; the full editor lives in the Journey's Settings panel later. */}
                  <div className="rounded-xl border border-border bg-canvas px-3 py-3">
                    <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-subtle">How will you meet?</span>
                    <div className="flex flex-wrap gap-1.5">
                      {MEETING_FORMATS.map(([value, Icon, lbl]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => patchMeeting({ format: meeting.format === value ? null : value })}
                          aria-pressed={meeting.format === value}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${meeting.format === value ? 'border-primary/40 bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:text-text'}`}
                        >
                          <Icon className="h-3.5 w-3.5" /> {lbl}
                        </button>
                      ))}
                    </div>

                    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        value={meeting.schedule ?? ''}
                        onChange={(e) => patchMeeting({ schedule: e.target.value || null })}
                        maxLength={120}
                        placeholder="When, e.g. Sundays 7pm"
                        className={`${FIELD} sm:col-span-2`}
                      />
                      <input
                        value={meeting.timezone ?? ''}
                        onChange={(e) => patchMeeting({ timezone: e.target.value || null })}
                        maxLength={40}
                        placeholder="Timezone, e.g. ET"
                        className={FIELD}
                      />
                    </div>

                    {(meeting.format === 'in_person' || meeting.format === 'hybrid') && (
                      <input
                        value={meeting.location ?? ''}
                        onChange={(e) => patchMeeting({ location: e.target.value || null })}
                        maxLength={200}
                        placeholder="Where you meet, e.g. The community hall"
                        className={`${FIELD} mt-2`}
                      />
                    )}
                    {(meeting.format === 'virtual' || meeting.format === 'hybrid') && (
                      <input
                        type="url"
                        value={meeting.link ?? ''}
                        onChange={(e) => patchMeeting({ link: e.target.value || null })}
                        maxLength={500}
                        placeholder="Join link, https://"
                        className={`${FIELD} mt-2`}
                      />
                    )}

                    <p className="mt-1.5 text-2xs text-subtle">Optional. You can fine-tune this in Settings later.</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-warning">{error}</p>}

        <div className="mt-7 flex gap-3">
          {picking ? (
            <button type="button" onClick={() => setPicking(false)} disabled={pending} className={`${wizardSecondaryClass} w-full`}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
          <>
          {(step > 1 || (usingOverview && !onReview)) && (
            <button type="button" onClick={usingOverview && !onReview ? () => setUsingOverview(false) : back} disabled={pending} className={`${wizardSecondaryClass} flex-1`}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          {!onReview ? (
            <button type="button" onClick={next} disabled={!canNext || pending} className={`${wizardPrimaryClass} ${step > 1 || usingOverview ? 'flex-1' : 'w-full'}`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : usingOverview || step === 4 ? <Sparkles className="h-4 w-4" /> : null}
              {usingOverview || step === 4 ? 'Draft with Vera' : 'Continue'}
            </button>
          ) : (
            <button type="button" onClick={create} disabled={!title.trim() || pending} className={`${wizardPrimaryClass} flex-1`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Journey
            </button>
          )}
          </>
          )}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-subtle">
        {!onReview && !usingOverview && !picking && (
          <button type="button" onClick={() => { setUsingOverview(true); setStep(1) }} className="underline-offset-4 transition-colors hover:text-muted hover:underline">
            Have an overview already? Paste or upload it
          </button>
        )}
        {!onReview && !picking && (
          <>
            {!usingOverview && <span className="px-1.5 text-border" aria-hidden>·</span>}
            <button type="button" onClick={() => setMode('manual')} className="underline-offset-4 transition-colors hover:text-muted hover:underline">
              Skip, I&apos;ll build it myself
            </button>
          </>
        )}
      </p>
    </div>
  )
}
