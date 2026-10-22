import Link from 'next/link'
import type { ReactNode } from 'react'
import '@/app/themes/active/kit-members'
import '@/app/themes/active/space-page'

// THE SPACE PAGE, FREQUENCY CHROME (ADR-1737; LIVE-1029). The default Header size is DAWN's layout, the one
// the owner asked back (2026-10-19): a clean cover band, the logo chip hanging off it, one identity row under
// it with the buttons at the right. The Hero size keeps the identity on the photo as a cover CARD
// (templates/members/Circle.html and Event.html), then the kit's underline tab row, then the page body. Both Space trees
// render it: the member profile's (profile) layout and the signed-out share page. Every read and gate
// stays with the caller; this file only places what it is handed.
//
// The body wrapper stamps `data-space-page`, the scope app/themes/frequency/space-page.css dresses in
// the Frequency idiom (type roles, cards, buttons, fields). The blocks inside are the SAME markup a Space
// website renders (one render path, ADR-1727); the website never carries this marker, so it keeps its
// own theme.
//
// Server component, no JS. `kit-members.css` is imported here as well as by the member shell because
// the share page lives outside that shell (app/(public)); the sheet is one module, bundled once.
//
// SIGNED OUT (`public`, SCAN-883). A signed-in member reads this chrome inside the member shell, which
// gives it a centred column and a right rail. A visitor reads it under the public site shell, which gives
// it neither, so the page ran edge to edge with its first tab cut at the screen's edge. Public pages
// therefore open their own frame: the site kit's centred `.wrap` (the container every public Frequency
// page sits in), the same cover and tab row inside it untouched, then the body at the column's
// full width (the DAWN presentation, owner 2026-10-16) with the key facts (FqSpaceFacts) as a band of
// cards under it. The member tree passes neither prop and renders exactly as before.

export function FqSpaceChrome({
  back,
  coverImage,
  coverFocus,
  tall,
  logo,
  eyebrow,
  name,
  badges,
  coverBadge,
  coverAction,
  tagline,
  actions,
  nav,
  notices,
  public: isPublic = false,
  aside,
  children,
}: {
  /** The way back to the directory (the share page's "Spaces" link); the member tree has breadcrumbs. */
  back?: { href: string; label: string }
  coverImage: string
  /** The owner's focal point for the cover (an object-position value). */
  coverFocus?: string
  /** The Hero cover size: a taller card. */
  tall?: boolean
  /** The Space's logo chip, when the owner shows one. */
  logo?: ReactNode
  /** The owner's optional kicker above the name. */
  eyebrow?: string | null
  name: string
  /** The Founding Business and Boosted marks, beside the name. */
  badges?: ReactNode
  /** Marks drawn inside the cover photo's top-left corner (both sizes). */
  coverBadge?: ReactNode
  /** The control drawn inside the cover photo's top-right corner (both sizes): the Check In button. */
  coverAction?: ReactNode
  /** The tagline, or the owner's "add a tagline" prompt. */
  tagline?: ReactNode
  /** The cover's buttons: the primary action, QR and Connect, the owner's Edit. */
  actions?: ReactNode
  /** The tab row (SpaceProfileMenu / SpaceProfileMenuView, which draw the kit tabs under Frequency). */
  nav: ReactNode
  /** Owner notices above the body (the private-Space assist). */
  notices?: ReactNode
  /** The share page sits outside the member shell, so it opens its own kit scope. */
  public?: boolean
  /** The signed-out page's key facts (FqSpaceFacts): a band of cards under the full-width body. */
  aside?: ReactNode
  children: ReactNode
}) {
  // The name block: shared by both sizes. On the Hero size the logo chip leads it; on the Header size the
  // chip hangs off the cover instead.
  const identity = (
    <div className="fqs-id">
      {tall && logo}
      <div className="stack">
        {/* The public page reads as DAWN's: cover, then the way back, then the name. */}
        {back && isPublic && !tall && (
          <Link className="meta fqs-back" href={back.href}>
            ← {back.label}
          </Link>
        )}
        {eyebrow && <span className="fqs-k">{eyebrow}</span>}
        {/* header-ok: the cover IS this route group's header, so the chrome owns the page's one h1
            (the precedent the DAWN profile layout and DetailTemplate's `band` slot follow). */}
        <h1 className="h1">{name}</h1>
        {badges}
        {tagline}
      </div>
    </div>
  )
  const pane = (
    <div className="fqs-pane" data-space-page="">
      {children}
    </div>
  )
  const body = (
    <>
      {back && (tall || !isPublic) && (
        <Link className="meta fqs-back" href={back.href}>
          ← {back.label}
        </Link>
      )}
      {tall ? (
        // HERO SIZE: the identity sits on the photo, over the scrim.
        <section
          className="ph fqs-hero tall"
          style={{ backgroundImage: `url('${coverImage}')`, backgroundPosition: coverFocus }}
        >
          {coverBadge && <div className="fqs-cover-badge">{coverBadge}</div>}
          {coverAction && <div className="fqs-cover-action">{coverAction}</div>}
          <div className="fqs-hero-in">
            {identity}
            {actions && <div className="fqs-acts">{actions}</div>}
          </div>
        </section>
      ) : (
        // HEADER SIZE (the default, DAWN's grammar): a clean cover band, the logo hanging off its bottom
        // edge, then one identity row on the page ground with the buttons at its right.
        <>
          <div className="fqs-cover">
            <div
              className="fqs-cover-img"
              role="img"
              aria-label=""
              style={{ backgroundImage: `url('${coverImage}')`, backgroundPosition: coverFocus }}
            />
            {coverBadge && <div className="fqs-cover-badge">{coverBadge}</div>}
            {coverAction && <div className="fqs-cover-action">{coverAction}</div>}
            {logo && <div className="fqs-cover-logo">{logo}</div>}
          </div>
          <div className={logo ? 'fqs-ident has-logo' : 'fqs-ident'}>
            {identity}
            {actions && <div className="fqs-acts">{actions}</div>}
          </div>
        </>
      )}
      {nav}
      <div className="fqs-notices">{notices}</div>
      {aside ? (
        <div className="fqs-cols">
          {pane}
          <aside className="fqs-aside" aria-label="About this Space">
            {aside}
          </aside>
        </div>
      ) : (
        pane
      )}
    </>
  )
  return isPublic ? (
    <div data-kit="members" className="fqs-public">
      <div className="wrap fqs-wrap">{body}</div>
    </div>
  ) : (
    body
  )
}
