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

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeading } from './page-heading'
import { PageHero, type PageHeroSize, type PageHeroVariant } from './page-hero'
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
  heroFocus,
  heroOverlay = false,
  heroLayout = 'overlay',
  heroSize = 'large',
  heroScrim = true,
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
  /** Focal point for the hero image, a CSS object-position string ("x% y%") from the operator's
   *  focal-point picker. Applied to the hero <img> in BOTH the banner and overlay branches so the
   *  important part of the photo survives the crop. Unset = centered (today's behavior). */
  heroFocus?: string | null
  /** OVERLAY hero mode: the title / description / action render ON the hero image over an ink
   *  legibility scrim (the Space-profile hero grammar), instead of the banner-above-heading
   *  lockup. Only applies when `heroImage` is set; the admin-bar rule still draws below, so the
   *  operator Settings affordance never disappears. */
  heroOverlay?: boolean
  /** Overlay hero LAYOUT variant, forwarded to PageHero (`overlay` | `identity` | `minimal`).
   *  Defaults to the shipped centered `overlay`. Only applies in overlay mode. */
  heroLayout?: PageHeroVariant
  /** Overlay hero band size, forwarded to PageHero. Defaults to the taller `large` directory
   *  band (today's look). Only applies in overlay mode. */
  heroSize?: PageHeroSize
  /** Draw the ink scrim over the overlay hero cover. Default on. Only applies in overlay mode. */
  heroScrim?: boolean
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
  if (heroOverlay) {
    // The overlaid index hero now renders the ONE canonical PageHero (the single-source header band),
    // so this branch and every entity/commerce hero share one component + one edit point. A page may
    // pass `heroOverlay` with no `heroImage` (or an explicit null) to get the band with the neutral
    // gradient placeholder — so a manager surface with no cover still reads as a unified hero.
    return (
      <div>
        {trail && <Breadcrumbs trail={trail} />}
        {back && (
          <Link href={back.href} className="mb-2 mt-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text">
            <ChevronLeft className="h-4 w-4" /> {back.label}
          </Link>
        )}
        <div className={back ? '' : 'mt-3'}>
          <PageHero
            coverImage={heroImage ?? null}
            coverFocus={heroFocus}
            eyebrow={eyebrow}
            title={title}
            subtitle={description}
            actions={action}
            variant={heroLayout}
            size={heroSize}
            overlay={heroScrim}
            rawImg={!!heroImage}
          />
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
              style={heroFocus ? { objectPosition: heroFocus } : undefined}
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
