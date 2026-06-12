'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, Eye, GripVertical, Plus, Copy, Trash2, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import {
  TRIGGERS, CADENCES, LAYOUTS, ACCENTS,
  TRIGGER_LABELS, CADENCE_LABELS, LAYOUT_LABELS, ACCENT_TOKENS,
  blankStep,
  type Walkthrough, type WalkthroughStep, type StepLayout,
} from '@/lib/walkthroughs'
import { WalkthroughSlide, STEP_ICONS, ACCENT_CLASSES } from '@/components/walkthroughs/slide'
import {
  ONBOARDING_CRITERIA,
  ONBOARDING_WALKTHROUGH_SLUG,
  CRITERION_LABELS,
  type OnboardingStepKey,
} from '@/lib/onboarding/steps'
import { updateWalkthrough, setWalkthroughActive } from '../actions'

// The clever editor (Phase A centerpiece). A SPLIT layout: LEFT = controls (sequence
// meta + a reorderable slide list + the per-slide editor), RIGHT = a LIVE PREVIEW that
// renders the current slide the way it'll look in-app, emulating the chores-overlay /
// vera-lightbox card with the chosen accent token + layout. Every field updates the
// preview as you type. Styling stays token-only — the accent picker offers SEMANTIC token
// swatches, never a raw hex. Mirrors the sequence-wizard's ergonomics (dirty/save state,
// per-step fields, in-page preview). Triggering + rendering are Phase B.

const field =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-broadcast'
const lbl = 'block text-xs font-semibold text-subtle mb-1'

// Local datetime <input> wants 'YYYY-MM-DDTHH:mm'; the DB stores ISO. Convert both ways.
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function WalkthroughEditor({ initial, persisted }: { initial: Walkthrough; persisted: boolean }) {
  const router = useRouter()
  const [wt, setWt] = useState<Walkthrough>(initial)
  const [selected, setSelected] = useState(0)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const dragId = useRef<string | null>(null)

  const dirty = !saved && JSON.stringify(wt) !== JSON.stringify(initial)

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // ── meta + slide setters ──
  function setMeta<K extends keyof Walkthrough>(k: K, v: Walkthrough[K]) {
    setWt((s) => ({ ...s, [k]: v }))
    setSaved(false)
  }
  function setStep(i: number, patch: Partial<WalkthroughStep>) {
    setWt((s) => ({ ...s, steps: s.steps.map((st, idx) => (idx === i ? { ...st, ...patch } : st)) }))
    setSaved(false)
  }
  function addStep() {
    setWt((s) => ({ ...s, steps: [...s.steps, blankStep()] }))
    setSelected(wt.steps.length)
    setSaved(false)
  }
  function duplicateStep(i: number) {
    setWt((s) => {
      const next = [...s.steps]
      next.splice(i + 1, 0, { ...s.steps[i], id: blankStep().id })
      return { ...s, steps: next }
    })
    setSelected(i + 1)
    setSaved(false)
  }
  function removeStep(i: number) {
    setWt((s) => ({ ...s, steps: s.steps.filter((_, idx) => idx !== i) }))
    setSelected((sel) => Math.max(0, sel > i ? sel - 1 : sel === i ? Math.min(sel, wt.steps.length - 2) : sel))
    setSaved(false)
  }
  function reorder(overId: string) {
    const from = dragId.current
    if (!from || from === overId) return
    setWt((s) => {
      const next = [...s.steps]
      const fromIdx = next.findIndex((x) => x.id === from)
      const overIdx = next.findIndex((x) => x.id === overId)
      if (fromIdx < 0 || overIdx < 0) return s
      const [moved] = next.splice(fromIdx, 1)
      next.splice(overIdx, 0, moved)
      return { ...s, steps: next }
    })
    setSaved(false)
  }

  function save() {
    if (pending) return
    start(async () => {
      const r = await updateWalkthrough(wt.id, {
        name: wt.name,
        description: wt.description,
        trigger: wt.trigger,
        audience: wt.audience,
        cadence: wt.cadence,
        priority: wt.priority,
        startsAt: wt.startsAt,
        endsAt: wt.endsAt,
        steps: wt.steps,
      })
      if (!isError(r)) {
        setSaved(true)
        router.refresh()
      }
    })
  }

  function toggleActive() {
    start(async () => {
      const next = !wt.active
      const r = await setWalkthroughActive(wt.id, next)
      if (!isError(r)) {
        setMeta('active', next)
        router.refresh()
      }
    })
  }

  const step = wt.steps[selected] as WalkthroughStep | undefined

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Header band */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/admin/walkthroughs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Walkthroughs
          </Link>
          <h1 className="mt-1 text-xl font-bold text-text">{wt.name || 'Untitled walkthrough'}</h1>
          {!persisted && (
            <p className="text-2xs text-warning">Draft. Save to create it (the table appears once migrated).</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-2xs font-medium text-warning">Unsaved</span>}
          {saved && (
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-success">
              <Check className="h-3 w-3" aria-hidden /> Saved
            </span>
          )}
          <Button type="button" disabled={pending} onClick={save}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── LEFT: controls ── */}
        <div className="space-y-5">
          {/* Sequence meta */}
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-base font-bold text-text">Sequence</h2>
            <div>
              <label className={lbl}>Name</label>
              <input className={field} value={wt.name} onChange={(e) => setMeta('name', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Description <span className="font-normal text-subtle/70">· an operator note</span></label>
              <textarea
                className={`${field} resize-y`}
                rows={2}
                value={wt.description ?? ''}
                onChange={(e) => setMeta('description', e.target.value || null)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={lbl}>Trigger <span className="font-normal text-subtle/70">· when it fires</span></label>
                <select className={field} value={wt.trigger} onChange={(e) => setMeta('trigger', e.target.value as Walkthrough['trigger'])}>
                  {TRIGGERS.map((t) => (
                    <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Cadence <span className="font-normal text-subtle/70">· how often</span></label>
                <select className={field} value={wt.cadence} onChange={(e) => setMeta('cadence', e.target.value as Walkthrough['cadence'])}>
                  {CADENCES.map((c) => (
                    <option key={c} value={c}>{CADENCE_LABELS[c]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={lbl}>Audience note <span className="font-normal text-subtle/70">· optional target / role key</span></label>
              <input
                className={field}
                value={wt.audience ?? ''}
                placeholder="e.g. spring-2026 season, or first-week hosts"
                onChange={(e) => setMeta('audience', e.target.value || null)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={lbl}>Priority</label>
                <input
                  type="number"
                  className={field}
                  value={wt.priority}
                  onChange={(e) => setMeta('priority', Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className={lbl}>Starts</label>
                <input
                  type="datetime-local"
                  className={field}
                  value={toLocalInput(wt.startsAt)}
                  onChange={(e) => setMeta('startsAt', fromLocalInput(e.target.value))}
                />
              </div>
              <div>
                <label className={lbl}>Ends</label>
                <input
                  type="datetime-local"
                  className={field}
                  value={toLocalInput(wt.endsAt)}
                  onChange={(e) => setMeta('endsAt', fromLocalInput(e.target.value))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-elevated/40 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-text">Live</p>
                <p className="text-2xs text-subtle">On = reaching members once Phase B fires it.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={wt.active}
                aria-label={wt.active ? 'Switch off' : 'Switch on'}
                disabled={pending}
                onClick={toggleActive}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  wt.active ? 'bg-success' : 'bg-surface-elevated'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
                    wt.active ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Slide list */}
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-text">Slides</h2>
              <Button type="button" variant="secondary" size="sm" onClick={addStep}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add slide
              </Button>
            </div>
            {wt.steps.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-subtle">
                No slides yet. Add one to start.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {wt.steps.map((st, i) => (
                  <li
                    key={st.id}
                    draggable
                    onDragStart={(e) => {
                      dragId.current = st.id
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      reorder(st.id)
                    }}
                    onDragEnd={() => {
                      dragId.current = null
                    }}
                    onClick={() => setSelected(i)}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition-colors ${
                      i === selected ? 'border-primary bg-primary-bg/40' : 'border-border bg-surface hover:bg-surface-elevated'
                    }`}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-subtle active:cursor-grabbing" aria-hidden />
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ACCENT_CLASSES[st.accent].solid}`} />
                    <span className="min-w-0 flex-1 truncate font-medium text-text">
                      {i + 1}. {st.title || 'Untitled slide'}
                    </span>
                    <button
                      type="button"
                      aria-label="Duplicate slide"
                      onClick={(e) => {
                        e.stopPropagation()
                        duplicateStep(i)
                      }}
                      className="rounded p-1 text-subtle hover:bg-surface-elevated hover:text-text"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove slide"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeStep(i)
                      }}
                      className="rounded p-1 text-subtle hover:bg-surface-elevated hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Per-slide editor */}
          {step && (
            <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h2 className="text-base font-bold text-text">Slide {selected + 1}</h2>
              <div>
                <label className={lbl}>Title</label>
                <input className={field} value={step.title} onChange={(e) => setStep(selected, { title: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Body</label>
                <textarea
                  className={`${field} resize-y`}
                  rows={4}
                  value={step.body}
                  onChange={(e) => setStep(selected, { body: e.target.value })}
                />
              </div>

              {/* Activation step — ONLY on the reserved Next Steps funnel. Tags this slide
                  to a real milestone; the funnel's done-detection keys off it. */}
              {wt.slug === ONBOARDING_WALKTHROUGH_SLUG && (
                <div>
                  <label className={lbl}>
                    Activation step <span className="font-normal text-subtle/70">· which milestone this slide stands for</span>
                  </label>
                  <select
                    className={field}
                    value={step.criterion ?? ''}
                    onChange={(e) =>
                      setStep(selected, { criterion: (e.target.value || undefined) as OnboardingStepKey | undefined })
                    }
                  >
                    <option value="">None (slide ignored by the funnel)</option>
                    {ONBOARDING_CRITERIA.map((c) => (
                      <option key={c} value={c}>{CRITERION_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Accent picker — SEMANTIC token swatches (never a hex field) */}
              <div>
                <label className={lbl}>Accent <span className="font-normal text-subtle/70">· a semantic token</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {ACCENTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      title={ACCENT_TOKENS[a].label}
                      aria-label={ACCENT_TOKENS[a].label}
                      aria-pressed={step.accent === a}
                      onClick={() => setStep(selected, { accent: a })}
                      className={`h-7 w-7 rounded-full ${ACCENT_TOKENS[a].swatch} ring-offset-2 ring-offset-surface transition ${
                        step.accent === a ? 'ring-2 ring-text' : 'ring-1 ring-border hover:ring-text/40'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Layout toggle */}
              <div>
                <label className={lbl}>Layout</label>
                <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setStep(selected, { layout: l as StepLayout })}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        step.layout === l ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
                      }`}
                    >
                      {LAYOUT_LABELS[l]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon picker */}
              <div>
                <label className={lbl}>Icon <span className="font-normal text-subtle/70">· optional</span></label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-pressed={!step.icon}
                    onClick={() => setStep(selected, { icon: undefined })}
                    className={`rounded-lg border px-2 py-1.5 text-2xs font-medium transition-colors ${
                      !step.icon ? 'border-primary bg-primary-bg/40 text-primary-strong' : 'border-border text-subtle hover:bg-surface-elevated'
                    }`}
                  >
                    None
                  </button>
                  {STEP_ICONS.map(({ name, Icon }) => (
                    <button
                      key={name}
                      type="button"
                      aria-label={name}
                      aria-pressed={step.icon === name}
                      onClick={() => setStep(selected, { icon: name })}
                      className={`rounded-lg border p-2 transition-colors ${
                        step.icon === name ? 'border-primary bg-primary-bg/40 text-primary-strong' : 'border-border text-muted hover:bg-surface-elevated'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={lbl}>Media URL <span className="font-normal text-subtle/70">· for Media-top / Split</span></label>
                <input
                  className={field}
                  value={step.mediaUrl ?? ''}
                  placeholder="/images/site/…"
                  onChange={(e) => setStep(selected, { mediaUrl: e.target.value || undefined })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={lbl}>CTA label <span className="font-normal text-subtle/70">· optional</span></label>
                  <input
                    className={field}
                    value={step.ctaLabel ?? ''}
                    onChange={(e) => setStep(selected, { ctaLabel: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className={lbl}>CTA link</label>
                  <input
                    className={field}
                    value={step.ctaHref ?? ''}
                    placeholder="/circles"
                    onChange={(e) => setStep(selected, { ctaHref: e.target.value || undefined })}
                  />
                </div>
              </div>

              <div>
                <label className={lbl}>Zaps reward <span className="font-normal text-subtle/70">· optional, granted on finish (Phase B)</span></label>
                <input
                  type="number"
                  className={field}
                  value={step.zaps ?? ''}
                  onChange={(e) => setStep(selected, { zaps: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: live preview ── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-subtle">
            <Eye className="h-3.5 w-3.5" aria-hidden /> Live preview
            {dirty && <span className="font-normal text-warning">· unsaved</span>}
          </p>
          {step ? (
            <WalkthroughSlide step={step} />
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center text-sm text-subtle">
              Add a slide to preview it.
            </div>
          )}
          <p className="mt-2 text-2xs text-subtle">
            This is how the slide presents in-app. Phase B fires it for the right member at the right moment.
          </p>
        </div>
      </div>
    </div>
  )
}
