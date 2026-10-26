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
import type { PageHeroSize, PageHeroVariant } from './page-hero'
import { PageIntro } from './page-intro'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'

// The header is PageHeading's kit `.head`; the banner is a borderless 24px photo and the toolbar sits on
// the kit's 28px rhythm (`mu-toolbar`).

/** One crumb in the standard index breadcrumb (`/network` -> this section). */
export type Crumb = { href: string; label: string }

export function IndexTemplate({
  eyebrow,
  title,
  description,
  intro,
  action,
  back,
  toolbar,
  trail,
  heroImage,
  heroFocus,
  heroOverlay = false,
  underHero,
  banner,
  adminBar = true,
  children,
}: {
  /** Small contextual line above the title. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** The operator's intro copy under the header (`page_content.body`, ADR-1284): a paragraph or
   *  three between the heading rule and the toolbar, rendered by <PageIntro>. Blank = nothing. */
  intro?: string | null
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
   *  focal-point picker. Applied to the hero <img> so the
   *  important part of the photo survives the crop. Unset = centered (today's behavior). */
  heroFocus?: string | null
  /** A hub page carries no photo band (owner 2026-10-14 and 2026-10-19): an overlay hero draws no photo
   *  and falls through to the standard kit `.head`. */
  heroOverlay?: boolean
  /** Accepted for existing callers and ignored (see `heroOverlay`). */
  heroLayout?: PageHeroVariant
  /** Accepted for existing callers and ignored (see `heroOverlay`). */
  heroSize?: PageHeroSize
  /** Accepted for existing callers and ignored (see `heroOverlay`). */
  heroScrim?: boolean
  /** Optional controls row rendered directly UNDER the hero banner — a wrapping pill row for
   *  secondary page controls (Manage / drafts / subscribe), keeping the header-right `action`
   *  for the primary CTA only. */
  underHero?: React.ReactNode
  /** Escape hatch for a fully custom header media node (rendered after trail + heroImage).
   *  Prefer `trail` + `heroImage` — `banner` is for the rare bespoke header. */
  banner?: React.ReactNode
  /** Render the operator on-page "Settings" admin bar (default on). Set false on a page that has
   *  its own customizer so the old operator page-layout control doesn't double up. */
  adminBar?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      {(trail || (heroImage && !heroOverlay) || banner || underHero) && (
        <div>
          {trail && <Breadcrumbs trail={trail} />}
          {heroImage && !heroOverlay && (
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
              className="mb-7 mt-3 h-44 w-full rounded-card object-cover sm:h-56"
            />
          )}
          {/* Secondary page controls, sitting directly under the banner (a wrapping pill row) —
              the primary CTA stays in the header-right `action` beside the title. */}
          {underHero && <div className="mb-4 flex flex-wrap gap-2">{underHero}</div>}
          {banner}
        </div>
      )}
      <PageHeading eyebrow={eyebrow} title={title} description={description} actions={action} back={back} adminBar={adminBar} />
      <PageIntro text={intro} />
      {toolbar && <div className="mu-toolbar">{toolbar}</div>}
      {children}
    </div>
  )
}
