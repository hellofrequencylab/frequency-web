'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Render, type Data } from '@measured/puck'
import { ArrowRight, ArrowDown, ArrowUp, Check, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'
import { config } from '@/lib/page-editor/config'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'
import { isError, type ActionResult } from '@/lib/action-result'
import type { SpaceTemplate } from '@/lib/spaces/templates'
import type { SpaceBlockRow } from '@/lib/page-editor/templates/space-blocks'
import type { CoverSize } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import {
  setSpaceLayoutTemplate,
  setSpaceCoverSize,
  setSpaceAccent,
  reorderSpaceBlock,
  setSpaceBlockHidden,
} from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { switchSpaceFocus } from '@/app/(main)/spaces/[slug]/manage/mode/actions'
import { ACCENT_TOKENS } from '@/components/spaces/space-form'
import { SpaceEditorOverlay } from '@/components/spaces/space-editor-overlay'

// THE PAGE quick-edit panel (the compact Manage surface, NO Puck runtime). Approved model: a compact
// panel in Manage for FAST tweaks (layout, cover size, theme/accent, and block order + show/hide), plus
// a prominent "Full page editor" button that opens the COMPLETE Puck editor as a fullscreen overlay for
// deep editing. Mirrors the Layout panel it grew out of: every write calls a server action that RE-GATES
// the owner/admin/editor role; this client is fast inline feedback only. DAWN semantic tokens only (no
// hex), sentence-case copy, no em dashes (CONTENT-VOICE §10).

/** A focus choice mirroring the mode view's shape, kept LOCAL so this surface stays decoupled from the
 *  mode settings module (it only needs these fields to render the echo). */
export interface FocusChoiceLike {
  variant: string
  label: string
  tagline: string
  active: boolean
}

// The two public-header cover sizes, each with a plain forward function (CONTENT-VOICE, no em dashes).
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

export function SpacePagePanel({
  slug,
  brandName,
  activeTemplate,
  overrideIsAuto,
  customized,
  coverSize,
  accent,
  blocks,
  editorData,
  previews,
  metadata,
  focus,
  readOnly = false,
}: {
  slug: string
  /** The Space display name, for the full-editor overlay title. */
  brandName: string
  /** The currently RESOLVED template (after any override), so the active card + auto row read true. */
  activeTemplate: SpaceTemplate
  /** Whether the layout is deriving automatically (no preferences.template override set). */
  overrideIsAuto: boolean
  /** Whether a customized page (a stored puck doc) exists, so the "Reset to this layout" path shows. */
  customized: boolean
  /** The chosen public-header cover size (Header vs Hero), for the Cover size toggle. */
  coverSize: CoverSize
  /** The Space's stored brand accent token, or '' for none (the per-role default paints). */
  accent: string
  /** The TOP-LEVEL blocks of the current landing doc (stored-or-preset), in order, for the Blocks list. */
  blocks: SpaceBlockRow[]
  /** The resolved landing doc (hidden blocks already stripped) the Full page editor overlay opens on. */
  editorData: Data
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

      {/* The prominent deep-edit entry: opens the COMPLETE Puck editor as a fullscreen overlay. The
          editor + Puck bundle lazy-load only when opened, never on this panel's initial load. */}
      {!readOnly && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Full page editor</p>
              <p className="mt-1 text-sm text-muted">
                Open the full editor to add, edit, and arrange every block on your page.
              </p>
            </div>
            <SpaceEditorOverlay
              slug={slug}
              title={brandName}
              data={editorData}
              customized={customized}
            />
          </div>
        </section>
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

      {/* Theme / accent: the curated brand accent that paints the page (tokens only, never a hex). */}
      <section>
        <SectionHeader title="Theme and accent" />
        <p className="-mt-2 mb-3 text-sm text-muted">
          Your brand color. It paints your buttons, the active tab, and highlights across the page.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={readOnly || pending}
            onClick={() => run(() => setSpaceAccent(slug, ''))}
            aria-pressed={accent === ''}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60',
              accent === ''
                ? 'border-primary bg-primary-bg text-primary-strong'
                : 'border-border text-muted hover:border-border-strong',
            )}
          >
            Default
          </button>
          {ACCENT_TOKENS.map((a) => {
            const active = accent === a.token
            return (
              <button
                key={a.token}
                type="button"
                disabled={readOnly || pending}
                onClick={() => run(() => setSpaceAccent(slug, a.token))}
                aria-pressed={active}
                title={a.label}
                aria-label={a.label}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60',
                  active ? 'border-primary bg-primary-bg text-text' : 'border-border text-muted hover:border-border-strong',
                )}
              >
                <span
                  className="h-4 w-4 rounded-full border border-border"
                  style={{ backgroundColor: `var(${a.token})` }}
                  aria-hidden
                />
                {a.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Blocks: the page's top-level blocks, with reorder + show/hide. No Puck; fast tweaks only. The
          full editor (overlay above) is where blocks are added + edited. */}
      <section>
        <SectionHeader title="Blocks" />
        <p className="-mt-2 mb-3 text-sm text-muted">
          The sections on your page, top to bottom. Reorder them or hide one from your public page. Open
          the full editor to add or edit a block.
        </p>
        {blocks.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
            Your page has no blocks yet. Open the full editor to add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {blocks.map((block, index) => (
              <li
                key={block.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm',
                  block.hidden && 'opacity-70',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">{block.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {block.hidden ? 'Hidden from your public page' : 'Showing on your public page'}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    label={`Move ${block.label} up`}
                    disabled={readOnly || pending || index === 0}
                    onClick={() => run(() => reorderSpaceBlock(slug, index, -1))}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`Move ${block.label} down`}
                    disabled={readOnly || pending || index === blocks.length - 1}
                    onClick={() => run(() => reorderSpaceBlock(slug, index, 1))}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={block.hidden ? `Show ${block.label}` : `Hide ${block.label}`}
                    disabled={readOnly || pending}
                    onClick={() => run(() => setSpaceBlockHidden(slug, index, !block.hidden))}
                  >
                    {block.hidden ? (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden />
                    )}
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
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

/** A compact square icon button for the block row controls (reorder / show-hide). */
function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-text disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none"
    >
      {children}
    </button>
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
