'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  Upload,
  LayoutTemplate,
  MessageCircleQuestion,
  PenLine,
} from 'lucide-react'
import { WizardProgress, wizardPrimaryClass, wizardSecondaryClass } from '@/components/templates'
import type { PillarSlug } from '@/lib/pillars'
import { PILLAR_SLUGS } from '@/lib/pillars'
import type { CircleSparkDraft } from '@/lib/ai/circle-spark'
import {
  sparkPreviewAction,
  createDraftFromSparkAction,
  createBlankDraftAction,
  extractOutlineAction,
} from '@/app/(main)/circles/builder-actions'

// The four-entry Circle builder wizard (Stage 4, decision #8). A centered,
// rail-less Focus surface mirroring the Journey Spark. Four ways in:
//   1. Start from a Starter Circle  → link to the gallery (/circles/templates)
//   2. Upload an outline            → extract → Vera spark → review → create
//   3. Answer a few questions (Vera)→ small form → spark → review → create
//   4. Start from scratch           → blank draft → straight into the builder
// Paths 2 + 3 share the review step (an editable CircleSparkDraft); committing
// runs createDraftFromSparkAction and pushes into the builder. Nothing persists
// until that commit.

const PILLAR_LABELS: Record<PillarSlug, string> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
  expression: 'Expression',
}

const FIELD =
  'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-primary placeholder:text-subtle'

type Mode = 'choose' | 'upload' | 'questions' | 'review'

export function CircleWizard() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('choose')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [extracting, setExtracting] = useState(false)

  // Question-path answers.
  const [topic, setTopic] = useState('')
  const [who, setWho] = useState('')
  const [primaryPillar, setPrimaryPillar] = useState<PillarSlug | null>(null)
  const [cadence, setCadence] = useState('')
  // Upload-path source text.
  const [sourceText, setSourceText] = useState('')

  // Vera's drafted frame (review step, editable).
  const [spark, setSpark] = useState<CircleSparkDraft | null>(null)

  const onFile = (file: File) => {
    setError(null)
    setExtracting(true)
    const fd = new FormData()
    fd.append('file', file)
    start(async () => {
      try {
        const res = await extractOutlineAction(fd)
        setSourceText((prev) => (prev.trim() ? `${prev}\n\n${res.text}` : res.text))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read that file. Paste the text instead.')
      } finally {
        setExtracting(false)
      }
    })
  }

  const generate = (fromUpload: boolean) => {
    setError(null)
    start(async () => {
      try {
        const res = await sparkPreviewAction({
          topic,
          who,
          primaryPillar,
          cadence: cadence.trim() || undefined,
          sourceText: fromUpload ? sourceText : undefined,
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

  // ── Header copy + progress per mode ──
  const total = mode === 'questions' ? 2 : 1
  const current = mode === 'review' ? total : 1
  const stepLabel =
    mode === 'choose'
      ? 'Start'
      : mode === 'upload'
        ? 'Your outline'
        : mode === 'questions'
          ? 'A few questions'
          : 'Review'

  const heading =
    mode === 'choose'
      ? { title: 'Start a Circle', description: 'Four ways in. Pick the one that fits how you like to build.' }
      : mode === 'upload'
        ? { title: 'Upload your outline', description: 'Drop in your own write-up and Vera drafts the Circle from it. PDF, Word, or text.' }
        : mode === 'questions'
          ? { title: 'Tell Vera the basics', description: 'A few answers and Vera drafts the whole frame for you to edit.' }
          : { title: 'Here is your Circle', description: "Vera's draft. Edit anything, then create it." }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <WizardProgress current={current} total={total} label={stepLabel} />

      <div className="mt-7">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary-strong">New Circle</p>
        <h1 className="text-2xl font-bold text-text">{heading.title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">{heading.description}</p>

        <div className="mt-5">
          {/* ── CHOOSE ── */}
          {mode === 'choose' && (
            <div className="space-y-2.5">
              <Link
                href="/circles/templates"
                className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-elevated"
              >
                <LayoutTemplate className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">Start from a Starter Circle</span>
                  <span className="block text-xs leading-snug text-muted">
                    Remix a staff-made blueprint, then make it yours.
                  </span>
                </span>
              </Link>

              <button
                type="button"
                onClick={() => setMode('upload')}
                className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-elevated"
              >
                <Upload className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">Upload an outline</span>
                  <span className="block text-xs leading-snug text-muted">
                    Have it written already? Paste or upload it and Vera builds the frame.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMode('questions')}
                className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-elevated"
              >
                <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">Answer a few questions</span>
                  <span className="block text-xs leading-snug text-muted">
                    Tell Vera the basics and she drafts the whole Circle.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={scratch}
                disabled={pending}
                className="flex w-full items-start gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-elevated disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary-strong" aria-hidden />
                ) : (
                  <PenLine className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">Start from scratch</span>
                  <span className="block text-xs leading-snug text-muted">A blank Circle. Write every field yourself.</span>
                </span>
              </button>
            </div>
          )}

          {/* ── UPLOAD ── */}
          {mode === 'upload' && (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={8}
                className={FIELD}
                placeholder="Paste your Circle outline, write-up, or notes here…"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={extracting || pending}
                  className={`${wizardSecondaryClass} !px-3 !py-2 text-sm`}
                >
                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}{' '}
                  Upload a file
                </button>
                <span className="text-xs text-subtle">PDF, Word, or plain text</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.pdf,.docx,.doc,application/pdf,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onFile(f)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          )}

          {/* ── QUESTIONS ── */}
          {mode === 'questions' && (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">What is it about</span>
                <input
                  autoFocus
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className={FIELD}
                  placeholder="e.g. Trail running and coffee after"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Who is it for</span>
                <input
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  className={FIELD}
                  placeholder="e.g. Busy adults who want real friends"
                />
              </label>
              <div>
                <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-subtle">
                  Primary Pillar (optional)
                </span>
                <div className="flex flex-wrap gap-2">
                  {PILLAR_SLUGS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={primaryPillar === p}
                      onClick={() => setPrimaryPillar((cur) => (cur === p ? null : p))}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        primaryPillar === p
                          ? 'border-primary/50 bg-primary-bg text-primary-strong'
                          : 'border-border bg-surface text-muted hover:text-text'
                      }`}
                    >
                      {PILLAR_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">
                  How it meets (optional)
                </span>
                <input
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value)}
                  className={FIELD}
                  placeholder="e.g. Wednesdays evening, Saturday mornings"
                />
              </label>
            </div>
          )}

          {/* ── REVIEW ── */}
          {mode === 'review' && spark && (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Name</span>
                <input
                  value={spark.name}
                  onChange={(e) => setSpark({ ...spark, name: e.target.value })}
                  className={`${FIELD} font-semibold`}
                  placeholder="Name your Circle"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">The Card</span>
                <input
                  value={spark.card}
                  onChange={(e) => setSpark({ ...spark, card: e.target.value })}
                  className={FIELD}
                  placeholder="The hook, under a dozen words"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">About</span>
                <textarea
                  value={spark.oneLiner}
                  onChange={(e) => setSpark({ ...spark, oneLiner: e.target.value })}
                  rows={3}
                  className={FIELD}
                  placeholder="Who it is for and what they get"
                />
              </label>
              <p className="text-2xs leading-relaxed text-subtle">
                Vera also drafted the four Pillars inside, the rhythm, the agreements, and more. Create the draft to edit
                all of it in the builder.
              </p>
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-warning">{error}</p>}

        <div className="mt-7 flex gap-3">
          {mode === 'choose' ? (
            <Link href="/circles" className={`${wizardSecondaryClass} w-full`}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Back to Circles
            </Link>
          ) : mode === 'upload' ? (
            <>
              <button type="button" onClick={() => setMode('choose')} disabled={pending} className={`${wizardSecondaryClass} flex-1`}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Back
              </button>
              <button
                type="button"
                onClick={() => generate(true)}
                disabled={pending || extracting || !sourceText.trim()}
                className={`${wizardPrimaryClass} flex-1`}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}{' '}
                Draft with Vera
              </button>
            </>
          ) : mode === 'questions' ? (
            <>
              <button type="button" onClick={() => setMode('choose')} disabled={pending} className={`${wizardSecondaryClass} flex-1`}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Back
              </button>
              <button
                type="button"
                onClick={() => generate(false)}
                disabled={pending || !topic.trim()}
                className={`${wizardPrimaryClass} flex-1`}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}{' '}
                Draft with Vera
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMode('choose')}
                disabled={pending}
                className={`${wizardSecondaryClass} flex-1`}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Start over
              </button>
              <button type="button" onClick={create} disabled={pending || !spark?.name.trim()} className={`${wizardPrimaryClass} flex-1`}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Create the draft
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
