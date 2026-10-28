'use client'

import type { ReactNode } from 'react'
import { SparkShell } from '@/components/studio/spark'

// THE ONE CREATE FLOW (LIVE-1733). Every guided "make a Space" surface, the signed-in Create a Space page and the
// launch page alike, is this engine with a different layout and skin: a step list, one body per step, a kit banner
// for the visitor who arrived with a kit, and a summary slot. It owns the chrome and the order; the CALLER owns
// the values and the steps' bodies, so no second step engine exists and a step (Name, Look, Spotlight, Website,
// Email) is an embeddable body, never a route.
//
//   layout "framed"  one step at a time in a card, with Back and Continue (the Spark footer and autosave).
//   layout "stacked" every step is an open section on one page, the active one expanded.

export interface FlowStep {
  id: string
  /** The short name in the step list. */
  label: string
  /** The step heading. Its last word is set in the serif italic. */
  title: string
  description?: ReactNode
  body: ReactNode
  /** The step is finished (drawn as done in the list, and the section header in the stacked layout). */
  done?: boolean
  /** False keeps Continue off until the step's required answers are in. Defaults to true. */
  canContinue?: boolean
  nextLabel?: string
  /** Runs instead of moving on. The last step uses it to create the Space. */
  onNext?: () => void | Promise<void>
}

export interface FlowKit {
  label: string
  /** The step the banner's Change link opens. */
  changeStepId: string
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

export function CreateFlow({
  steps,
  index,
  onIndexChange,
  layout = 'framed',
  kit = null,
  summary,
  recap,
  eyebrow = 'New Space',
  busy = false,
  error = null,
  draftKey = null,
  footerNote,
}: {
  steps: FlowStep[]
  /** The open step. Controlled: the caller keeps it, so a flow can resume where it stopped. */
  index: number
  onIndexChange: (index: number) => void
  layout?: 'framed' | 'stacked'
  kit?: FlowKit | null
  /** The summary card beside the steps where the column is wide enough. */
  summary?: ReactNode
  /** The one-line recap shown in its place where it is not. */
  recap?: string
  eyebrow?: string
  busy?: boolean
  error?: string | null
  /** Where autosaved answers are filed (the Spark draft store); null turns autosave off. */
  draftKey?: string | null
  /** A quiet line under the steps (a link to a different way in). */
  footerNote?: ReactNode
}) {
  const step = steps[index]
  const last = index === steps.length - 1
  const go = (to: number) => onIndexChange(Math.min(Math.max(to, 0), steps.length - 1))
  const next = (s: FlowStep) => (s.onNext ? s.onNext() : go(index + 1))

  return (
    <div className="@container space-y-6">
      {kit && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-[image:var(--fq-pa-soft)] p-3">
          <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-control bg-ink font-display text-body-sm font-bold text-on-ink">
            {kit.label.charAt(0)}
          </span>
          <p className="min-w-0 flex-1 text-meta text-muted">
            <strong className="block text-body-sm text-text">{kit.label} kit is picked</strong>
            Your website, email and Spotlight start in this look. You can change it on the {steps.find((s) => s.id === kit.changeStepId)?.label ?? 'Look'} step.
          </p>
          <button
            type="button"
            className="text-meta font-semibold text-text underline underline-offset-4"
            onClick={() => go(steps.findIndex((s) => s.id === kit.changeStepId))}
          >
            Change
          </button>
        </div>
      )}

      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {steps.map((s, i) => {
          const state = i === index ? 'on' : s.done || i < index ? 'done' : 'todo'
          return (
            <li
              key={s.id}
              aria-current={state === 'on' ? 'step' : undefined}
              className={`flex h-9 items-center gap-2 rounded-pill border px-2.5 text-meta font-semibold sm:px-3.5 ${
                state === 'on' ? 'border-ink bg-ink text-on-ink' : 'border-border text-muted'
              }`}
            >
              <span
                aria-hidden
                className={`grid h-5 w-5 place-items-center rounded-pill text-eyebrow ${state === 'todo' ? 'bg-surface-elevated' : 'bg-[image:var(--fq-pa)] text-text'}`}
              >
                {i + 1}
              </span>
              <span className={state === 'on' ? undefined : 'hidden sm:inline'}>{s.label}</span>
            </li>
          )
        })}
      </ol>

      {recap && summary && <p className="text-meta text-muted @3xl:hidden">{recap}</p>}

      <div className={`grid items-start gap-6 ${summary ? '@3xl:grid-cols-[minmax(0,1fr)_16.5rem]' : ''}`}>
        {layout === 'framed' ? (
          <div className="card @container p-5 sm:p-7">
            <SparkShell
              bare
              eyebrow={eyebrow}
              headingLevel={2}
              title={lockup(step.title)}
              description={step.description}
              step={index + 1}
              totalSteps={steps.length}
              stepLabel={step.label}
              onBack={index > 0 ? () => go(index - 1) : undefined}
              onNext={() => next(step)}
              nextLabel={step.nextLabel ?? (last ? 'Create' : 'Continue')}
              nextDisabled={step.canContinue === false}
              busy={busy}
              error={error}
              draftScopeKey={draftKey}
            >
              {step.body}
            </SparkShell>
          </div>
        ) : (
          <div className="space-y-4">
            {steps.map((s, i) => {
              const open = i === index
              return (
                <section key={s.id} aria-label={s.label} className="card @container p-5 sm:p-7">
                  <button
                    type="button"
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() => go(i)}
                  >
                    <span className="font-display text-card-title font-bold text-text">{lockup(s.title)}</span>
                    <span className="text-meta text-muted">{s.done ? 'Done' : open ? '' : s.label}</span>
                  </button>
                  {open && (
                    <div className="mt-4 space-y-5">
                      {s.description && <p className="text-meta text-muted">{s.description}</p>}
                      {s.body}
                      {error && i === index && (
                        <p role="alert" className="text-body-sm text-warning">
                          {error}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={s.canContinue === false || busy}
                        className="btn pa lg w-full"
                        onClick={() => next(s)}
                      >
                        {s.nextLabel ?? (i === steps.length - 1 ? 'Create' : 'Continue')}
                      </button>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
        {summary && (
          <aside className="card hidden p-5 @3xl:sticky @3xl:top-6 @3xl:block" aria-label="Your space so far">
            {summary}
          </aside>
        )}
      </div>
      {footerNote && <p className="text-center text-meta text-muted">{footerNote}</p>}
    </div>
  )
}
