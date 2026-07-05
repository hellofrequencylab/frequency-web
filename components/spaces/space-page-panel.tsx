'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Globe,
  LayoutGrid,
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
import type { CoverScrim } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import {
  setSpaceCoverScrim,
  setSpaceAccent,
  createSpacePage,
  renameSpacePage,
  reorderSpacePages,
  deleteSpacePage,
  setWebsitePublished,
} from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { AccentPicker } from '@/components/spaces/space-form'
import { SpaceBusinessForm } from '@/components/spaces/space-business-form'
import type { SpaceProfileData } from '@/lib/spaces/profile-data'

// THE PAGE quick-edit panel (the compact Manage surface, NO Puck runtime). A compact panel in Manage
// for FAST tweaks: it manages the operator-defined PAGES (create / rename / reorder / delete + pick the
// page you are editing), then for the SELECTED page offers cover size, theme/accent, and block order +
// show/hide. The grid block-picker ("Edit your profile") is the primary and only profile editor here;
// the Puck full page builder is reserved for marketing and external site pages, not member Space
// profiles. Every write calls a server action that RE-GATES the owner/admin/editor role; this client is
// fast inline feedback only. DAWN semantic tokens only (no hex), sentence-case copy, no em dashes
// (CONTENT-VOICE §10).

// The two Hero cover-scrim treatments. A Space profile ALWAYS uses the Hero cover (ADR-526), where the
// identity (logo + name + actions) overlays the image, so the scrim choice is always relevant. Plain
// forward taglines, no em dashes (CONTENT-VOICE).
const COVER_SCRIMS: { value: CoverScrim; label: string; tagline: string }[] = [
  { value: 'shade', label: 'Shade', tagline: 'A soft dark fade so your name stays readable on any photo.' },
  { value: 'blend', label: 'Blend', tagline: 'The photo melts into the page. Best with a calm image.' },
]

export function SpacePagePanel({
  slug,
  pages,
  activePageSlug,
  maxPages,
  coverScrim,
  accent,
  businessInfo,
  coverImageUrl = null,
  brandLogoUrl = null,
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
  /** The chosen Hero scrim treatment (Shade vs Blend). The Space cover is always Hero (ADR-526). */
  coverScrim: CoverScrim
  /** The Space's stored brand accent token, or '' for none (the per-role default paints). */
  accent: string
  /** The Space's CENTRAL business info (single source of truth), for the Business info form. */
  businessInfo: SpaceProfileData
  /** The Space's current header (cover) image URL, for the Business info form's upload control. */
  coverImageUrl?: string | null
  /** The Space's current profile (logo) image URL, for the Business info form's upload control. */
  brandLogoUrl?: string | null
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

      {/* PRIMARY EDIT (ADR-516 Phase D): the freeform rows page builder is now the primary way to arrange
          this profile, and it lives IN THE RAIL on the profile itself — the live page previews every change.
          This links to the profile, where the builder mounts in the Page rail surface. */}
      {!readOnly && (
        <section>
          <Link href={`/spaces/${slug}`} className={buttonClasses('primary', 'md')}>
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Arrange your page
          </Link>
          <p className="mt-2 text-sm text-muted">
            Open your page and use the Page panel to arrange your blocks into rows and columns. Every change
            previews live.
          </p>
        </section>
      )}

      {/* Cover style (scrim): the Space cover is always Hero (ADR-526), where the identity overlays the image.
          Shade keeps text legible on any photo; Blend fades the photo into the page. */}
      <section>
        <SectionHeader title="Cover style" />
        <p className="-mt-2 mb-3 text-sm text-muted">
          How your name and buttons sit on the Hero cover image.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {COVER_SCRIMS.map((c) => {
            const active = coverScrim === c.value
            return (
              <button
                key={c.value}
                type="button"
                disabled={readOnly || pending || active}
                onClick={() => run(() => setSpaceCoverScrim(slug, c.value))}
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

      {/* Theme / accent: the brand color that paints the page. A real color picker + on-brand swatches
          (shared AccentPicker); each pick persists at once through the owner-gated setSpaceAccent. */}
      <section>
        <SectionHeader title="Theme and accent" />
        <p className="-mt-2 mb-3 text-sm text-muted">
          Your brand color. It paints your buttons, the active tab, and highlights across the page.
        </p>
        <AccentPicker
          value={accent}
          onChange={(v) => run(() => setSpaceAccent(slug, v))}
          disabled={readOnly || pending}
        />
      </section>

      {/* MORE PAGE SETTINGS: the heavier, less-frequent controls (pages, business info, external website)
          tucked behind ONE disclosure so the panel LEADS with the quick tweaks (grid, cover, accent,
          focus). A closed <details> keeps its children mounted, so every control stays reachable +
          keyboard-operable + reachable by a read-only staff previewer. Default closed. */}
      <details className="group rounded-lg border border-border">
        <summary className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium text-subtle outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
          More page settings
          <ChevronDown
            className="ml-auto h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </summary>
        <div className="space-y-8 border-t border-border px-3 pb-3 pt-6">
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

          {/* BUSINESS INFO: the single source of truth. Edited once here, it feeds every block that shows
              it (Contact, Business, About) on every page and surface. */}
          <section>
            <SectionHeader title="Business info" />
            <SpaceBusinessForm
              slug={slug}
              initial={businessInfo}
              initialCoverUrl={coverImageUrl}
              initialLogoUrl={brandLogoUrl}
              readOnly={readOnly}
            />
          </section>

          {/* EXTERNAL WEBSITE (ADR-508 U4-B): publish your Home page as a standalone public site at its own
              link, reading the same content as your profile. Fail-closed: unpublished, only you can reach it. */}
          {!readOnly && (
            <section>
              <SectionHeader title="External website" />
              <p className="-mt-2 mb-3 text-sm text-muted">
                Publish your Home page as a standalone website with its own link. It shows the same content as
                your profile, so you edit once and it stays in sync.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant={websitePublished ? 'secondary' : 'primary'}
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => setWebsitePublished(slug, !websitePublished))}
                >
                  <Globe className="h-4 w-4" aria-hidden />
                  {websitePublished ? 'Unpublish website' : 'Publish website'}
                </Button>
                {websitePublished && (
                  <Link
                    href={`/sites/${slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary-strong hover:underline"
                  >
                    View website
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">
                {websitePublished
                  ? 'Your website is live and anyone with the link can view it.'
                  : 'Your website is off. Publish it to share a public link.'}
              </p>
            </section>
          )}
        </div>
      </details>
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
