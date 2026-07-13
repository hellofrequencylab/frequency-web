'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Check,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'
import { isError, type ActionResult } from '@/lib/action-result'
import type { ProfilePage } from '@/lib/spaces/profile-pages'
import {
  createSpacePage,
  renameSpacePage,
  reorderSpacePages,
  deleteSpacePage,
  setWebsitePublished,
} from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// THE PAGE quick-edit panel (the compact Manage surface, NO Puck runtime). A compact panel in Manage
// for FAST tweaks: it manages the operator-defined PAGES (create / rename / reorder / delete + pick the
// page you are editing), then for the SELECTED page offers cover size, theme/accent, and block order +
// show/hide. The grid block-picker ("Edit your profile") is the primary and only profile editor here;
// the Puck full page builder is reserved for marketing and external site pages, not member Space
// profiles. Every write calls a server action that RE-GATES the owner/admin/editor role; this client is
// fast inline feedback only. DAWN semantic tokens only (no hex), sentence-case copy, no em dashes
// (CONTENT-VOICE §10).

export function SpacePagePanel({
  slug,
  pages,
  activePageSlug,
  maxPages,
  websitePublished = false,
  canManagePages = false,
  readOnly = false,
}: {
  slug: string
  /** The operator's ordered nav pages (Home first), for the switcher + manager. */
  pages: ProfilePage[]
  /** The page currently being edited (the Pages manager highlights + acts on this one). */
  activePageSlug: string
  /** The most pages a Space may expose, so the panel warns at the cap. */
  maxPages: number
  /** Whether the Space's external website (/sites/<slug>) is currently published. */
  websitePublished?: boolean
  /** Whether the Space may add/manage EXTRA profile pages (the paid multi-page upsell,
   *  space_full_website). Default-deny: a Space gets one continuous home page until it unlocks this,
   *  when the Pages manager shows an upsell instead of the add control. */
  canManagePages?: boolean
  /** A staff previewer (read-only): the controls render disabled. */
  readOnly?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // The external website publish state, optimistic on the prop so the button flips the instant it saves.
  const [published, setPublished] = useState(websitePublished)

  function run<T = void>(fn: () => Promise<ActionResult<T>>, onSuccess?: (data: T) => void) {
    setError(null)
    start(async () => {
      const result = await fn()
      if (result && isError(result)) {
        setError(result.error)
        return
      }
      if (onSuccess) onSuccess((result as { data: T }).data)
      else router.refresh()
    })
  }

  /** Switch which page the blocks list + full editor act on (a search-param nav; the server recomputes). */
  function switchTo(pageSlug: string) {
    setError(null)
    router.push(`${pathname}?page=${encodeURIComponent(pageSlug)}`)
  }

  const custom = pages.filter((p) => !p.system)
  const atCap = pages.length >= maxPages

  /** Move a custom page one step up/down among the custom pages (Home stays pinned first server-side). */
  function movePage(pageSlug: string, dir: -1 | 1) {
    const order = custom.map((p) => p.slug)
    const i = order.indexOf(pageSlug)
    const target = i + dir
    if (i < 0 || target < 0 || target >= order.length) return
    ;[order[i], order[target]] = [order[target], order[i]]
    run(() => reorderSpacePages(slug, order))
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {/* Cover style, theme accent, and business info moved OUT of this panel (the profile+identity rework):
          cover + accent now live in the Branding section, and every business/identity WORD lives in the
          Business info section, so each field has exactly one editor. This panel keeps only the page-level
          controls: the block editor above, plus Pages + External website below. */}

      {/* PAGE SETTINGS: pages + external website, VISIBLE on the rail (ADR-535), not tucked behind a
          disclosure — the operator directive to surface these directly. */}
      <div className="space-y-8">
          {/* PAGES: the operator-defined nav. Pick the page you are editing, rename / reorder / delete, or
              add a new one. Home is your required main page (never deletable, always first). */}
          <section>
            <SectionHeader title="Pages" />
            <p className="-mt-2 mb-3 text-sm text-muted">
              {canManagePages
                ? 'The pages in your profile nav. Pick one to edit its blocks below, or add, rename, reorder, and delete pages. Home is your main page and always comes first.'
                : 'Your profile is one continuous page. Add more pages with your own website to build a full multi-page site.'}
            </p>
            <ul className="space-y-2">
              {pages.map((page) => (
                <PageRow
                  key={page.slug}
                  page={page}
                  active={page.slug === activePageSlug}
                  isFirstCustom={!page.system && custom[0]?.slug === page.slug}
                  isLastCustom={!page.system && custom[custom.length - 1]?.slug === page.slug}
                  readOnly={readOnly}
                  pending={pending}
                  onSelect={() => switchTo(page.slug)}
                  onRename={(label) => run(() => renameSpacePage(slug, page.slug, label))}
                  onMove={(dir) => movePage(page.slug, dir)}
                  onDelete={() =>
                    run(() => deleteSpacePage(slug, page.slug), () => {
                      // If the page being edited was deleted, fall back to Home.
                      if (page.slug === activePageSlug) switchTo('home')
                      else router.refresh()
                    })
                  }
                />
              ))}
            </ul>
            {!readOnly &&
              (canManagePages ? (
                <AddPageRow
                  atCap={atCap}
                  maxPages={maxPages}
                  pending={pending}
                  onAdd={(label) =>
                    run(() => createSpacePage(slug, label), (createdSlug) => switchTo(createdSlug))
                  }
                />
              ) : (
                <AddPagesUpsell slug={slug} />
              ))}
          </section>

          {/* EXTERNAL WEBSITE — publish your Home page as a standalone public site at /sites/<slug>. The
              route is fail-closed on this flag (network-visible AND published, else 404), so the toggle here
              is what turns the public link on. When live it shows the shareable link + an Unpublish control. */}
          {!readOnly && (
            <section>
              <SectionHeader title="External website" />
              <p className="-mt-2 mb-3 text-sm text-muted">
                Publish your Home page as a standalone website with its own link. It shows the same content as
                your profile, so you edit once and it stays in sync.
              </p>
              {published ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
                    <Globe className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                      Your website is live at{' '}
                      <Link href={`/sites/${slug}`} className="font-semibold text-primary-strong hover:underline">
                        /sites/{slug}
                      </Link>
                    </span>
                    <span className="shrink-0 rounded-full bg-success-bg px-2 py-0.5 text-2xs font-semibold text-success">
                      Live
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/sites/${slug}`} className={cn(buttonClasses('primary', 'sm'))} target="_blank">
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      View your website
                    </Link>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => setWebsitePublished(slug, false), () => setPublished(false))}
                    >
                      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      Unpublish
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => setWebsitePublished(slug, true), () => setPublished(true))}
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}
                    Publish website
                  </Button>
                </div>
              )}
            </section>
          )}
      </div>
    </div>
  )
}

/** One page in the Pages manager: a select-to-edit label, plus rename / reorder / delete controls.
 *  Home (system) can be renamed but never moved off the front or deleted. */
function PageRow({
  page,
  active,
  isFirstCustom,
  isLastCustom,
  readOnly,
  pending,
  onSelect,
  onRename,
  onMove,
  onDelete,
}: {
  page: ProfilePage
  active: boolean
  isFirstCustom: boolean
  isLastCustom: boolean
  readOnly: boolean
  pending: boolean
  onSelect: () => void
  onRename: (label: string) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(page.label)

  function saveRename() {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== page.label) onRename(next)
    else setDraft(page.label)
  }

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-surface p-3 shadow-sm transition-colors',
        active ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            saveRename()
          }}
        >
          <input
            autoFocus
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveRename}
            aria-label={`Rename ${page.label}`}
            className="min-w-0 flex-1 rounded-lg border border-border bg-canvas px-2 py-1 text-sm font-medium text-text"
          />
          <IconButton label="Save name" disabled={pending} onClick={saveRename}>
            <Check className="h-4 w-4" aria-hidden />
          </IconButton>
        </form>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={active}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title={active ? 'You are editing this page' : `Edit ${page.label}`}
        >
          <span className="block truncate text-sm font-semibold text-text">{page.label}</span>
          {page.system && (
            <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-subtle">
              Main
            </span>
          )}
          {active && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
        </button>
      )}

      {!readOnly && !editing && (
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label={`Rename ${page.label}`} disabled={pending} onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
          </IconButton>
          {!page.system && (
            <>
              <IconButton
                label={`Move ${page.label} up`}
                disabled={pending || isFirstCustom}
                onClick={() => onMove(-1)}
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton
                label={`Move ${page.label} down`}
                disabled={pending || isLastCustom}
                onClick={() => onMove(1)}
              >
                <ArrowDown className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton
                label={`Delete ${page.label}`}
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete the ${page.label} page? Its blocks are removed. You can build a new page anytime.`,
                    )
                  )
                    onDelete()
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconButton>
            </>
          )}
        </div>
      )}
    </li>
  )
}

/** The "add a page" row: a label input + Add button, disabled with a note at the page cap. The slug is
 *  derived + validated server-side; a reserved / duplicate / invalid name comes back as a plain error. */
function AddPageRow({
  atCap,
  maxPages,
  pending,
  onAdd,
}: {
  atCap: boolean
  maxPages: number
  pending: boolean
  onAdd: (label: string) => void
}) {
  const [label, setLabel] = useState('')

  function submit() {
    const next = label.trim()
    if (!next) return
    onAdd(next)
    setLabel('')
  }

  if (atCap) {
    return (
      <p className="mt-3 rounded-xl border border-border bg-surface p-3 text-xs text-muted">
        You have reached the limit of {maxPages} pages. Delete a page to add another.
      </p>
    )
  }

  return (
    <form
      className="mt-3 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        value={label}
        maxLength={40}
        placeholder="New page name"
        onChange={(e) => setLabel(e.target.value)}
        aria-label="New page name"
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-subtle"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending || label.trim().length === 0}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
        Add page
      </Button>
    </form>
  )
}

/** The Pages upsell: shown in place of the "add a page" control when the Space does not have the paid
 *  multi-page profile (space_full_website). A Space gets one continuous page by default; extra pages ride
 *  the full website. Plain copy, sentence-case, no em dashes (CONTENT-VOICE §10). Links to the Space's
 *  billing settings where the plan is chosen. */
function AddPagesUpsell({ slug }: { slug: string }) {
  return (
    <div className="mt-3 rounded-xl border border-border bg-surface p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-text">
        <Globe className="h-4 w-4 text-primary" aria-hidden />
        Add more pages with your own website
      </p>
      <p className="mt-1 text-sm text-muted">
        Your profile is one continuous page. Unlock the full website to add more pages and build a
        multi-page site.
      </p>
      <Link
        href={`/spaces/${slug}/settings/billing`}
        className={cn(buttonClasses('secondary', 'sm'), 'mt-3')}
      >
        See plans
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  )
}

/** A compact square icon button for the row controls (reorder / show-hide / rename / delete). */
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
