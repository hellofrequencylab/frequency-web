// Detail template — the "nested page" shell (PAGE-FRAMEWORK §3, Template C).
//
// One consistent grammar for every single-entity page (a Circle, an Interest, an
// Event, a Profile): a context header band (identity · badges · inline actions)
// over a tab row over the body. The body is itself usually a Stream or Index —
// templates nest, you reuse not rebuild.
//
// NOTE on the right rail: a Detail page's scope-scoped rail is rendered by the
// global shell via the route layout's `sidebar` slot (AppShell) — NOT here.
// Rendering a second rail inside the page is the double-sidebar trap we avoid.
//
// Presentational + server-friendly (no hooks). `tabs[].active` is precomputed by
// the page, so this works in a server component.

import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ImageIcon } from 'lucide-react'
import { PageAdminBar } from '@/components/layout/page-admin-bar'

export interface DetailTab {
  href: string
  label: string
  active?: boolean
}

export function DetailTemplate({
  hero,
  coverImage,
  title,
  subtitle,
  badges,
  actions,
  back,
  band,
  tabs,
  children,
}: {
  /** A fully custom hero node rendered ABOVE the context header band. The escape hatch for a
   *  bespoke cover (e.g. a hero with a date fallback). Prefer `coverImage` for the standard cover. */
  hero?: React.ReactNode
  /** STANDARD entity cover (the symmetric twin of IndexTemplate's `heroImage`). A string URL
   *  renders the standard cropped 16:6 cover; an explicit `null` renders the neutral gradient
   *  placeholder; omit it entirely for no cover (existing pages are unchanged). Ignored when
   *  `hero` is set. */
  coverImage?: string | null
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Status / mode chips (e.g. the in-person designator). */
  badges?: React.ReactNode
  /** Capability-gated inline actions (the headerActions slot). Gate with <Can>. */
  actions?: React.ReactNode
  /** Back-link shown above the identity band (nested detail pages). The single
   *  back affordance — don't also hand-roll one in `actions`. */
  back?: { href: string; label: string }
  /** OPTIONAL self-contained identity band. When provided it REPLACES the default
   *  title/subtitle/badges/actions lockup (the entity profile passes its own hero
   *  CARD here, §A.4), while the back-link, tab row, and divider stay identical.
   *  Every other Detail page omits it and is unchanged. The band must own the single
   *  page `<h1>` itself; `title` is then ignored for rendering. */
  band?: React.ReactNode
  tabs?: DetailTab[]
  children: React.ReactNode
}) {
  return (
    <div>
      {/* Cover at the very top of the header. A custom `hero` wins; otherwise the standard
          `coverImage` treatment renders when the prop is provided (image, or a neutral gradient
          placeholder for an explicit null). Omitting both leaves no cover. */}
      {hero ? (
        <div className="mb-4">{hero}</div>
      ) : coverImage !== undefined ? (
        <div className="mb-4">
          {coverImage ? (
            <div className="relative aspect-[16/6] w-full overflow-hidden rounded-2xl bg-surface-elevated">
              <Image src={coverImage} alt="" fill sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" />
            </div>
          ) : (
            <div className="flex aspect-[16/6] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg text-primary-strong">
              <ImageIcon className="h-8 w-8 opacity-60" aria-hidden />
            </div>
          )}
        </div>
      ) : null}
      {/* Context header band. On mobile the actions stack BELOW the identity so the
          title is never crushed into a truncation; from sm up they sit inline right.
          No bottom border here: the rule is drawn by <PageAdminBar asDivider> below, with
          the "Settings" split sitting INLINE on it (one line, not two). */}
      <header className="pb-4">
        {back && (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            <ChevronLeft className="h-4 w-4" />
            {back.label}
          </Link>
        )}
        {/* The identity band: a page-supplied self-contained `band` (e.g. the entity profile's hero
            card) when given, else the default title/badges/subtitle/actions lockup. */}
        {band ?? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-text break-words">{title}</h1>
                {badges}
              </div>
              {subtitle && (
                <div className="mt-1 text-sm text-muted">{subtitle}</div>
              )}
            </div>
            {actions && <div className="flex items-center gap-2 flex-wrap sm:shrink-0">{actions}</div>}
          </div>
        )}

        {/* Context tabs */}
        {tabs && tabs.length > 0 && (
          <nav className="flex items-center gap-1 mt-4 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  tab.active
                    ? 'bg-primary-bg text-primary-strong'
                    : 'text-muted hover:bg-surface-elevated hover:text-text'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* The header's hairline rule, with the on-page "Settings" split inline on it (one line). */}
      <PageAdminBar asDivider />

      {/* Body — usually a Stream or Index */}
      {children}
    </div>
  )
}
