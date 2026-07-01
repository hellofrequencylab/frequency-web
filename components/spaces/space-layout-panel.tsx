'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Render, type Data } from '@measured/puck'
import { Check, Loader2, Sparkles, ArrowRight } from 'lucide-react'
import { config } from '@/lib/page-editor/config'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'
import { isError, type ActionResult } from '@/lib/action-result'
import type { SpaceTemplate } from '@/lib/spaces/templates'
import type { CoverSize } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { setSpaceLayoutTemplate, setSpaceCoverSize } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { switchSpaceFocus } from '@/app/(main)/spaces/[slug]/manage/mode/actions'

// SPACE LAYOUT panel — the operator surface for picking the public-page STARTING layout (ADR-472). It
// shows a gallery of the four templates (Book · Schedule · Storefront · Hub), each with a live mini
// preview of its generated preset, and lets the operator set the layout. Every write calls a server
// action that RE-GATES the owner/admin/editor role; this layer is fast inline feedback only. A thin echo
// of the Focus switch sits above the gallery (the full mode settings stay at /manage/mode).
//
// SEMANTICS (see actions.ts): "Use this layout" sets preferences.template (non-destructive). When the
// page is CUSTOMIZED (a stored puck doc wins over any preset), that alone would not visibly change the
// live page, so a secondary "Reset to this layout" also clears the doc (behind a confirm). When the page
// is NOT customized, "Use this layout" applies immediately.
//
// COPY (CONTENT-VOICE §10): plain nouns, plain verbs, skeptic-proof, no em dashes. DAWN semantic tokens
// only (no hex, no text-[10/11px]).

/** A focus choice mirroring the mode view's shape, kept LOCAL so this surface stays decoupled from the
 *  mode settings module (it only needs these fields to render the echo). */
export interface FocusChoiceLike {
  variant: string
  label: string
  tagline: string
  active: boolean
}

// The two public-header cover sizes, with a plain forward function each (CONTENT-VOICE, no em dashes).
const COVER_SIZES: { value: CoverSize; label: string; tagline: string }[] = [
  { value: 'header', label: 'Header', tagline: 'A compact band. Good when the page is the point.' },
  { value: 'hero', label: 'Hero', tagline: 'A tall, immersive cover. Good for a strong first image.' },
]

export interface LayoutPreview {
  template: SpaceTemplate
  label: string
  /** The plain one-line forward function (CONTENT-VOICE). */
  blurb: string
  /** The generated Puck preset for this template (rendered as the mini preview). */
  data: Data
}

export function SpaceLayoutPanel({
  slug,
  activeTemplate,
  overrideIsAuto,
  customized,
  coverSize,
  previews,
  metadata,
  focus,
  readOnly = false,
}: {
  slug: string
  /** The currently RESOLVED template (after any override), so the active card + auto row read true. */
  activeTemplate: SpaceTemplate
  /** Whether the layout is deriving automatically (no preferences.template override set). */
  overrideIsAuto: boolean
  /** Whether a customized page (a stored puck doc) exists, so the "Reset to this layout" path shows. */
  customized: boolean
  /** The chosen public-header cover size (Header vs Hero), for the Cover size toggle. */
  coverSize: CoverSize
  previews: LayoutPreview[]
  /** The Render metadata (metadata.space) so previews resolve identity + highlights like the live page. */
  metadata: Record<string, unknown>
  /** The Focus switcher echo, or null to omit it. */
  focus: { choices: FocusChoiceLike[] } | null
  /** A staff previewer (read-only): the controls render disabled. */
  readOnly?: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(fn: () => Promise<ActionResult>) {
    setError(null)
    start(async () => {
      const result = await fn()
      if (result && isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {/* Type / focus echo (the full mode settings live at /manage/mode). */}
      {focus && focus.choices.length > 0 && (
        <section>
          <SectionHeader title="Type and focus" />
          <p className="-mt-2 mb-3 text-sm text-muted">
            How this space runs shapes the layout we suggest. Switching keeps all your data.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {focus.choices.map((c) => (
              <button
                key={c.variant}
                type="button"
                disabled={readOnly || pending || c.active}
                onClick={() => run(() => switchSpaceFocus(slug, c.variant))}
                aria-pressed={c.active}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors disabled:cursor-default motion-reduce:transition-none',
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
          <Link
            href={`/spaces/${slug}/manage/mode`}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-strong hover:underline"
          >
            More mode settings
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </section>
      )}

      {/* The automatic affordance. */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-text">
              <Sparkles className="h-4 w-4 text-primary-strong" aria-hidden />
              Automatic layout
            </p>
            <p className="mt-1 text-sm text-muted">
              {overrideIsAuto
                ? `On. Your layout follows your type and focus (currently ${templateLabel(previews, activeTemplate)}).`
                : `Off. You have picked ${templateLabel(previews, activeTemplate)}. Turn this on to follow your type and focus instead.`}
            </p>
          </div>
          {!overrideIsAuto && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={readOnly || pending}
              onClick={() => run(() => setSpaceLayoutTemplate(slug, 'auto'))}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Use automatic
            </Button>
          )}
        </div>
      </section>

      {/* Cover size: the public header's cover band height (compact Header vs tall Hero). */}
      <section>
        <SectionHeader title="Cover size" />
        <p className="-mt-2 mb-3 text-sm text-muted">
          How tall your cover image shows at the top of your public page.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {COVER_SIZES.map((c) => {
            const active = coverSize === c.value
            return (
              <button
                key={c.value}
                type="button"
                disabled={readOnly || pending || active}
                onClick={() => run(() => setSpaceCoverSize(slug, c.value))}
                aria-pressed={active}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors disabled:cursor-default motion-reduce:transition-none',
                  active
                    ? 'border-primary bg-primary-bg'
                    : 'border-border bg-surface hover:border-border-strong',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-text">
                  {c.label}
                  {active && <Check className="h-4 w-4 text-primary" aria-hidden />}
                </span>
                <span className="mt-1 block text-xs text-muted">{c.tagline}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* The four-layout gallery. */}
      <section>
        <SectionHeader title="Pick a layout" />
        <p className="-mt-2 mb-3 text-sm text-muted">
          Each layout leads with a different thing. Pick the one that fits, or preview them all. You can
          rearrange any page after in the editor.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {previews.map((preview) => (
            <LayoutCard
              key={preview.template}
              slug={slug}
              preview={preview}
              metadata={metadata}
              active={preview.template === activeTemplate}
              customized={customized}
              readOnly={readOnly}
              pending={pending}
              run={run}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

/** The plain label for a template id (falls back to the id if absent). */
function templateLabel(previews: LayoutPreview[], template: SpaceTemplate): string {
  return previews.find((p) => p.template === template)?.label ?? template
}

function LayoutCard({
  slug,
  preview,
  metadata,
  active,
  customized,
  readOnly,
  pending,
  run,
}: {
  slug: string
  preview: LayoutPreview
  metadata: Record<string, unknown>
  active: boolean
  customized: boolean
  readOnly: boolean
  pending: boolean
  run: (fn: () => Promise<ActionResult>) => void
}) {
  function handleReset() {
    if (
      !window.confirm(
        'This replaces your customized page with the starting design for this layout. You can build it up again anytime.',
      )
    )
      return
    run(() => setSpaceLayoutTemplate(slug, preview.template, { reset: true }))
  }

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-sm transition-colors',
        active ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      {/* The live mini preview: rendered at a large fixed width and scaled down to a thumbnail. It is
          clipped, non-interactive, and aria-hidden (the label below names the layout). */}
      <div
        className="relative h-44 shrink-0 overflow-hidden border-b border-border bg-canvas"
        aria-hidden
      >
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left [transform:scale(0.34)] [width:1120px]">
          <Render config={config} data={preview.data} metadata={metadata} />
        </div>
        {active && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold text-on-primary shadow-sm">
            <Check className="h-3 w-3" aria-hidden />
            Current
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-text">{preview.label}</p>
          <p className="mt-0.5 text-xs text-muted">{preview.blurb}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={active ? 'secondary' : 'primary'}
            size="sm"
            disabled={readOnly || pending || (active && !customized)}
            onClick={() => run(() => setSpaceLayoutTemplate(slug, preview.template))}
            title="Set this as your starting layout"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {active ? 'In use' : 'Use this layout'}
          </Button>
          {customized && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={readOnly || pending}
              onClick={handleReset}
              title="Clear your customized page and start from this layout's design"
            >
              Reset to this layout
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
