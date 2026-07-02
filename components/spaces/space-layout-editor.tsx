'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isError, type ActionResult } from '@/lib/action-result'
import type { SpaceBlockRow } from '@/lib/page-editor/templates/space-blocks'
import {
  setSpaceLayoutPreset,
  setSpaceLayoutDefault,
  reorderSpaceBlock,
  setSpaceBlockHidden,
} from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import {
  SPACE_TEMPLATES,
  normalizeTemplate,
  type LayoutPreset,
  type SpaceTemplateId,
} from '@/lib/spaces/layout-presets'

// THE SPACE TEMPLATE EDITOR — the Space's own version of the circle page-template editor, driving the
// Space layout system (Puck feature blocks + the layout-presets display transform), NOT the circle
// page-modules system. It matches the circle editor's look + feel: SCOPE tabs, a fixed-aspect-ratio
// template thumbnail grid (pick a picture, the active one is ringed + tinted), then the per-block
// show/hide/reorder list for the page being edited.
//
// SCOPE for a Space is just two levels (there is no "section" concept): "This page" writes the active
// page's own template (preferences.pageLayouts[slug]); "All pages" writes the space-level default
// (preferences.pageLayouts['*']) applied to any page with no template of its own. Every write calls a
// server action that RE-GATES the owner/admin/editor role; this client is fast inline feedback only.
// DAWN semantic tokens only (no hex), sentence-case copy, no em dashes (CONTENT-VOICE §10).

type Scope = 'page' | 'all'

// A tiny vector mock of a template's shape — the block arrangement the real page renders, so an operator
// picks a LAYOUT by clicking its picture, not by reading a name. EVERY icon shares ONE outer frame with
// an IDENTICAL fixed aspect ratio (h-10 w-16, i.e. 16:10): the outer box never resizes across templates;
// only the internal block shapes differ. `active` tints the blocks with the brand colour so the chosen
// template reads at a glance.
function SpaceTemplateThumbnail({ id, active }: { id: SpaceTemplateId; active: boolean }) {
  const box = `rounded-[2px] ${active ? 'bg-primary/70' : 'bg-border-strong'}`
  const row = 'flex flex-1 gap-0.5'
  // The outer frame is pixel-identical for every template; only the inner arrangement changes.
  const frame = 'flex h-full w-full'
  switch (id) {
    case 'main-side':
      return (
        <div className={`${frame} gap-0.5`}>
          <div className={`${box} basis-3/5`} />
          <div className={`${box} basis-2/5`} />
        </div>
      )
    case 'two-col':
      return (
        <div className={`${frame} flex-col gap-0.5`}>
          <div className={`${box} h-2`} />
          <div className={row}>
            <div className={`${box} flex-1`} />
            <div className={`${box} flex-1`} />
          </div>
        </div>
      )
    case 'three-col':
      return (
        <div className={`${frame} flex-col gap-0.5`}>
          <div className={`${box} h-2`} />
          <div className={row}>
            <div className={`${box} flex-1`} />
            <div className={`${box} flex-1`} />
            <div className={`${box} flex-1`} />
          </div>
        </div>
      )
    case 'header-side':
      return (
        <div className={`${frame} flex-col gap-0.5`}>
          <div className={`${box} h-2`} />
          <div className={row}>
            <div className={`${box} basis-3/5`} />
            <div className={`${box} basis-2/5`} />
          </div>
        </div>
      )
    case 'single':
    default:
      return (
        <div className={`${frame} gap-0.5`}>
          <div className={`${box} flex-1`} />
        </div>
      )
  }
}

export function SpaceLayoutEditor({
  slug,
  activePageSlug,
  activeLabel,
  pagePreset,
  defaultPreset,
  blocks,
  readOnly = false,
}: {
  slug: string
  /** The page whose template + blocks this editor acts on. */
  activePageSlug: string
  /** The active page's human label, for the block-list header. */
  activeLabel: string
  /** The active page's EFFECTIVE template (its own, else inherited from the space default). */
  pagePreset: LayoutPreset
  /** The space-level All-pages default template. */
  defaultPreset: LayoutPreset
  /** The active page's TOP-LEVEL blocks, in order, for the show/hide + reorder list. */
  blocks: SpaceBlockRow[]
  /** A staff previewer (read-only): the controls render disabled. */
  readOnly?: boolean
}) {
  const router = useRouter()
  const [scope, setScope] = useState<Scope>('page')
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

  // The template that reads as active for the current scope: the page's own effective template on "This
  // page", the space default on "All pages" (both normalized to a current template id).
  const activeTemplate = normalizeTemplate(scope === 'page' ? pagePreset : defaultPreset)

  const scopes: { value: Scope; label: string; hint: string }[] = [
    { value: 'page', label: 'This page', hint: `The layout for ${activeLabel}. It overrides your all-pages default.` },
    { value: 'all', label: 'All pages', hint: 'The default layout for every page without its own. A page layout overrides it.' },
  ]
  const activeScope = scopes.find((s) => s.value === scope) ?? scopes[0]

  function chooseTemplate(id: SpaceTemplateId) {
    if (id === activeTemplate) return
    if (scope === 'page') run(() => setSpaceLayoutPreset(slug, activePageSlug, id))
    else run(() => setSpaceLayoutDefault(slug, id))
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      {/* Scope: whether the template applies to this page or every page (a page layout wins). */}
      <div className="flex flex-wrap items-center gap-1.5">
        {scopes.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => {
              setError(null)
              setScope(s.value)
            }}
            disabled={pending}
            aria-pressed={s.value === scope}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40',
              s.value === scope ? 'bg-primary text-on-primary' : 'border border-border text-muted hover:text-text',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-2xs text-muted">{activeScope.hint}</p>

      {/* Template: pick the shape by clicking its mock-up (not a name). Each tile draws the layout's
          actual block arrangement in a fixed-ratio frame; the chosen one is ringed + tinted. */}
      <div>
        <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-subtle">Template</p>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
          {SPACE_TEMPLATES.map((t) => {
            const isActive = t.id === activeTemplate
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => chooseTemplate(t.id)}
                disabled={readOnly || pending}
                aria-pressed={isActive}
                title={t.description}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors disabled:opacity-40',
                  isActive
                    ? 'border-primary bg-primary-bg/40 ring-1 ring-primary'
                    : 'border-border bg-surface-elevated/40 hover:border-border-strong',
                )}
              >
                <span className="flex h-10 w-16 items-center justify-center">
                  <SpaceTemplateThumbnail id={t.id} active={isActive} />
                </span>
                <span className={cn('text-center text-3xs font-semibold leading-tight', isActive ? 'text-primary-strong' : 'text-muted')}>
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Blocks: the active page's top-level blocks, top to bottom, with reorder + show/hide. The content
          is the same under every template; only the arrangement changes. */}
      <div>
        <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-subtle">Blocks on {activeLabel}</p>
        {blocks.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-elevated/50 p-3 text-xs text-muted">
            This page has no blocks yet. Open the full editor to add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {blocks.map((block, index) => (
              <li
                key={block.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border border-border bg-surface-elevated/50 p-3',
                  block.hidden && 'opacity-70',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm font-semibold', block.hidden ? 'text-muted' : 'text-text')}>
                    {block.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {block.hidden ? 'Hidden from your public page' : 'Showing on your public page'}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    label={`Move ${block.label} up`}
                    disabled={readOnly || pending || index === 0}
                    onClick={() => run(() => reorderSpaceBlock(slug, index, -1, activePageSlug))}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`Move ${block.label} down`}
                    disabled={readOnly || pending || index === blocks.length - 1}
                    onClick={() => run(() => reorderSpaceBlock(slug, index, 1, activePageSlug))}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={block.hidden ? `Show ${block.label}` : `Hide ${block.label}`}
                    disabled={readOnly || pending}
                    onClick={() => run(() => setSpaceBlockHidden(slug, index, !block.hidden, activePageSlug))}
                  >
                    {block.hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1 text-xs text-danger">{error}</p>
      )}
      {pending && <p className="text-xs font-medium text-primary-strong">Saving your changes</p>}
    </div>
  )
}

/** A compact square icon button for the block-row controls (reorder / show-hide). */
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
