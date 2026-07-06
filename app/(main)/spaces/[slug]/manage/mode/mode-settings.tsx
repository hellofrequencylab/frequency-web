'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'
import { isError, type ActionResult } from '@/lib/action-result'
import { switchSpaceFocus, resetModeOverrides } from './actions'

// SPACE MODE settings - the client surface (Space Modes M3, ADR-461/464). Renders the current Mode +
// Focus, a read-only "what this preset leads with" preview, a non-destructive Focus switcher, and the
// lexicon / pipeline the preset seeds. Every write calls a server action that re-gates the owner/admin
// role; this layer is fast inline feedback only. The page (an RSC) resolves + gates and hands this a plain
// view model.
//
// MENU VISIBILITY lives ONLY in the Module Manager (Menu and features, ADR-552 Phase 4). This surface no
// longer carries an in-nav / hidden toggle: it is preset-only (focus, lexicon, pipeline), so there is one
// place to show or hide a module.
//
// COPY (CONTENT-VOICE): plain, skeptic-proof, no em dashes. The switch confirm states the
// non-destructive guarantee in plain words ("your data stays").

/** A plain-noun label per add-on catalog key (kept local so this surface never imports lib/pricing). */
const ADDON_LABEL: Record<string, string> = {
  marketing: 'Marketing',
  ai: 'AI Engine',
  team: 'Team',
  branding: 'Branding',
}

export interface ModuleRow {
  fn: string
  /** The effective label (operator override wins, else the function's registry label). */
  label: string
  /** The function's own registry label (shown as the "default" when overridden). */
  defaultLabel: string
  /** Whether the operator has overridden this module's label. */
  overridden: boolean
}

export interface FocusChoice {
  variant: string
  label: string
  tagline: string
  active: boolean
}

export interface ModeView {
  modeLabel: string
  focusLabel: string
  tagline: string
  pipeline: { name: string; kind: 'open' | 'won' | 'lost' }[]
  lexicon: { people: string; person: string; offerings: string; offering: string }
  recommendedAddons: string[]
  nextBestActions: { label: string }[]
  modules: ModuleRow[]
  focusChoices: FocusChoice[]
  hasOverrides: boolean
}

export function ModeSettings({
  slug,
  view,
  readOnly,
}: {
  slug: string
  view: ModeView
  /** A staff previewer (read-only): the controls render disabled. */
  readOnly: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(fn: () => Promise<ActionResult>) {
    setError(null)
    start(async () => {
      const result = await fn()
      if (result && isError(result)) setError(result.error)
    })
  }

  return (
    <div className="space-y-8">
      {/* Current Mode + Focus */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Starter preset</p>
        <h2 className="mt-1 text-lg font-semibold text-text">
          {view.modeLabel}: {view.focusLabel}
        </h2>
        <p className="mt-1 text-sm text-muted">{view.tagline}</p>
        <p className="mt-3 text-sm text-muted">
          A preset is just a quick-setup shortcut. It seeds a suggested layout, pipeline, and wording so you
          are not starting from a blank page. Every tool stays available no matter which preset you pick,
          and switching never removes anything.
        </p>
      </section>

      {error && (
        <p className="rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {/* What this preset leads with (read-only preview). Menu visibility lives in the Module Manager. */}
      <section>
        <SectionHeader title="What this preset leads with" />
        <p className="-mt-2 mb-3 text-sm text-muted">
          A preset never locks anything. Every tool stays available; this is the order your console leads
          with and the words it uses. To show or hide a module in your menu, open{' '}
          <Link href={`/spaces/${slug}/manage/modules`} className="font-medium text-primary hover:underline">
            Menu and features
          </Link>
          .
        </p>

        <div className="space-y-2">
          {view.modules.map((m) => (
            <div
              key={m.fn}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium text-text">{m.label}</span>
                {m.overridden && (
                  <span className="ml-2 text-xs text-subtle">renamed from {m.defaultLabel}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Default pipeline */}
      <section>
        <SectionHeader title="Suggested pipeline" />
        <p className="-mt-2 mb-3 text-sm text-muted">
          The starting stages your CRM seeds. Edit them any time on your pipeline board, and switching
          focus keeps a pipeline you have already changed.
        </p>
        <div className="flex flex-wrap gap-2">
          {view.pipeline.map((s) => (
            <span
              key={s.name}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                s.kind === 'won'
                  ? 'border-success bg-success-bg text-success'
                  : s.kind === 'lost'
                    ? 'border-border bg-surface-elevated text-muted'
                    : 'border-border bg-surface text-text',
              )}
            >
              {s.name}
            </span>
          ))}
        </div>
      </section>

      {/* Lexicon */}
      <section>
        <SectionHeader title="The words you use" />
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-3">
            <dt className="text-xs uppercase tracking-wide text-subtle">Your people</dt>
            <dd className="mt-1 text-sm font-medium text-text">{view.lexicon.people}</dd>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <dt className="text-xs uppercase tracking-wide text-subtle">What you offer</dt>
            <dd className="mt-1 text-sm font-medium text-text">{view.lexicon.offerings}</dd>
          </div>
        </dl>
      </section>

      {/* Recommended add-ons */}
      {view.recommendedAddons.length > 0 && (
        <section>
          <SectionHeader title="Recommended add-ons" />
          <p className="-mt-2 mb-3 text-sm text-muted">
            Suggested for this Mode, never turned on for you. Add them when you are ready from billing.
          </p>
          <div className="flex flex-wrap gap-2">
            {view.recommendedAddons.map((a) => (
              <span
                key={a}
                className="rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs font-medium text-text"
              >
                {ADDON_LABEL[a] ?? a}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Next best actions */}
      {view.nextBestActions.length > 0 && (
        <section>
          <SectionHeader title="Where to start" />
          <ul className="space-y-1.5">
            {view.nextBestActions.map((a) => (
              <li key={a.label} className="flex items-center gap-2 text-sm text-text">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                {a.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Switch focus */}
      {view.focusChoices.length > 0 && (
        <section>
          <SectionHeader title="Switch focus" />
          <p className="-mt-2 mb-3 text-sm text-muted">
            Change how this space runs. Your data stays; we will resurface the modules this focus leads
            with and suggest its pipeline.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {view.focusChoices.map((c) => (
              <button
                key={c.variant}
                type="button"
                disabled={readOnly || pending || c.active}
                onClick={() => run(() => switchSpaceFocus(slug, c.variant))}
                aria-pressed={c.active}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors disabled:cursor-default',
                  c.active
                    ? 'border-primary bg-primary-bg'
                    : 'border-border bg-surface hover:border-border-strong',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-text">
                  {c.label}
                  {c.active && <Check className="h-4 w-4 text-primary" aria-hidden />}
                </span>
                <span className="mt-1 block text-xs text-muted">{c.tagline}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Reset overrides */}
      {view.hasOverrides && !readOnly && (
        <section>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => resetModeOverrides(slug))}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            )}
            Reset to the Mode defaults
          </Button>
        </section>
      )}
    </div>
  )
}
