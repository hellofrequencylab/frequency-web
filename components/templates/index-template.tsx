// Index template — the "list / discovery" shell (PAGE-FRAMEWORK §3, Template B).
//
// One grammar for browse pages (Circles, Channels, Events, Partners, Directory):
// a title + description, an optional header action (create/new), an optional
// toolbar (filters/search), over the list body. The body and any right rail are
// the page's own; this is the consistent chrome around them.
//
// The header is the shared <PageHeading> — the same title block Stream / Dashboard
// / Focus use, so every page reads the same.
//
// Presentational + server-friendly (no hooks).

import { PageHeading } from './page-heading'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PageAdminBar } from '@/components/layout/page-admin-bar'

/** One crumb in the standard index breadcrumb (`/network` -> this section). */
export type Crumb = { href: string; label: string }

export function IndexTemplate({
  eyebrow,
  title,
  description,
  action,
  back,
  toolbar,
  trail,
  heroImage,
  heroOverlay = false,
  heroSize = 'standard',
  underHero,
  banner,
  adminBar = true,
  children,
}: {
  /** Small contextual line above the title. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right action, e.g. a "New circle" button. */
  action?: React.ReactNode
  /** Back-link for a nested index (e.g. a sub-page under a dashboard). */
  back?: { href: string; label: string }
  /** Optional filter/search row under the header. */
  toolbar?: React.ReactNode
  /** Standard breadcrumb trail, rendered at the very top of the header (the standardized
   *  index lockup: breadcrumb -> hero -> title). Pass it instead of hand-building a banner. */
  trail?: Crumb[]
  /** Operator hero image URL. Rendered as the STANDARD cropped header banner below the
   *  breadcrumb (16:9-ish, object-cover) so every index reads the same. Renders only when set. */
  heroImage?: string | null
  /** OVERLAY hero mode: the title / description / action render ON the hero image over an ink
   *  legibility scrim (the Space-profile hero grammar), instead of the banner-above-heading
   *  lockup. Only applies when `heroImage` is set; the admin-bar rule still draws below, so the
   *  operator Settings affordance never disappears. */
  heroOverlay?: boolean
  /** Overlay hero band size. 'standard' (default) is the uniform index hero every section
   *  shares; 'large' is a deliberately taller band with a bigger title — reserved for the
   *  one surface that should read bigger (the Business Spaces directory). Only applies in
   *  overlay mode. */
  heroSize?: 'standard' | 'large'
  /** Optional controls row rendered directly UNDER the hero banner — a wrapping pill row for
   *  secondary page controls (Manage / drafts / subscribe), keeping the header-right `action`
   *  for the primary CTA only. Rendered in BOTH the standard-banner and overlay-hero branches. */
  underHero?: React.ReactNode
  /** Escape hatch for a fully custom header media node (rendered after trail + heroImage).
   *  Prefer `trail` + `heroImage` — `banner` is for the rare bespoke header. */
  banner?: React.ReactNode
  /** Render the operator on-page "Settings" admin bar (default on). Set false on a page that has
   *  its own customizer so the old operator page-layout control doesn't double up. */
  adminBar?: boolean
  children: React.ReactNode
}) {
  // OVERLAY hero: one composed header band — image + bottom-heavy ink scrim + the page heading
  // grammar (eyebrow / h1 / description on-ink, the action bottom-right) anchored over it. The
  // standard PageHeading is suppressed (its h1 would double), but the admin-bar rule below stays.
  if (heroImage && heroOverlay) {
    // The size lever: 'standard' reproduces the uniform index hero exactly; 'large' is the
    // deliberately taller band (Business Spaces stays the biggest header on the site).
    const bandMinH = heroSize === 'large' ? 'min-h-[18rem] sm:min-h-[24rem]' : 'min-h-[14rem] sm:min-h-[18rem]'
    const titleSize = heroSize === 'large' ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
    return (
      <div>
        {trail && <Breadcrumbs trail={trail} />}
        <div className={`relative mt-3 ${bandMinH} overflow-hidden rounded-2xl border border-border`}>
          {/* Raw <img> (not next/image) so an arbitrary operator URL on a non-whitelisted host
              still renders; fetchPriority high gives this above-the-fold hero an LCP hint. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImage} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/35 to-transparent" aria-hidden />
          <div className={`relative flex ${bandMinH} flex-col justify-end gap-4 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8`}>
            <div className="min-w-0">
              {eyebrow && (
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-on-ink-muted">
                  {eyebrow}
                </p>
              )}
              <h1 className={`mb-1 text-balance ${titleSize} font-bold text-on-ink [text-shadow:0_1px_3px_rgb(0_0_0/0.35)]`}>
                {title}
              </h1>
              {description && (
                <p className="max-w-2xl text-sm font-medium leading-relaxed text-on-ink [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]">
                  {description}
                </p>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        </div>
        {/* Secondary page controls, directly under the overlaid hero band (same wrapping pill
            row as the standard-banner branch) — keeps the header-right `action` for the CTA. */}
        {underHero && <div className="mt-4 flex flex-wrap gap-2">{underHero}</div>}
        {banner}
        {/* The header rule + operator Settings, same contract as the standard heading. */}
        <div className="mt-4">
          {adminBar ? <PageAdminBar asDivider /> : <div className="mb-5 border-b border-border sm:mb-6" />}
        </div>
        {toolbar && <div className="mb-4">{toolbar}</div>}
        {children}
      </div>
    )
  }

  return (
    <div>
      {(trail || heroImage || banner || underHero) && (
        <div>
          {trail && <Breadcrumbs trail={trail} />}
          {heroImage && (
            // The standardized header banner: cropped (object-cover) to a consistent height so
            // every index reads the same, regardless of the uploaded image's aspect ratio.
            // Raw <img> (not next/image) so an arbitrary operator URL on a non-whitelisted host
            // still renders; fetchPriority high gives this above-the-fold banner an LCP hint.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImage}
              alt=""
              fetchPriority="high"
              className="mb-6 mt-3 h-44 w-full rounded-2xl border border-border object-cover sm:h-56"
            />
          )}
          {/* Secondary page controls, sitting directly under the banner (a wrapping pill row) —
              the primary CTA stays in the header-right `action` beside the title. */}
          {underHero && <div className="mb-4 flex flex-wrap gap-2">{underHero}</div>}
          {banner}
        </div>
      )}
      <PageHeading eyebrow={eyebrow} title={title} description={description} actions={action} back={back} adminBar={adminBar} />
      {toolbar && <div className="mb-4">{toolbar}</div>}
      {children}
    </div>
  )
}
