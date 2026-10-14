// THE FREQUENCY PUBLIC SITE SHELL: the kit root, skip link, header + mega menu + sheet + search, the
// page in <main id="main">, the footer, and the FX island. Rendered by every public layout when
// SITE_DESIGN is 'frequency' (app/(marketing), app/(help), app/(public), app/discover, the legal and
// utility routes, the claim pages, app/for) and by the front door (app/page.tsx); DAWN keeps its own chrome.
//
// Pages set their state through lib/frequency/site-pages.ts (a row per route, in the first paint) or
// <SitePage/> (after hydration); they end on <KeepGoing/>; client components read the side with
// useSiteSide(). The kit stylesheet is imported here, so only the layouts that render this shell load it.
//
// SURFACE (guidelines/site-themes.md). The layout names its family's theme and a page row can override it:
//
//   surface="stage"    (default) dark: Home and the marketing pages, Help, the persona doors.
//   surface="commons"  light, Thermal at night: /discover, the public detail pages, legal and utility.
//
// It lands as `data-surface` on the kit root, which is what a body's CSS keys on. On Commons the header and
// the footer still wear Stage (`.fq-stage-band`, a `display: contents` box that only carries the tokens),
// so the hall is the same on every page and only the room changes. The Commons body is `.fq-commons-body`
// (SiteBody), where the shared primitives a DAWN-era body renders (Button, Badge, cards, fields) wear the
// members idiom through the bridge in app/themes/frequency/members-ui.css; a members-kit body inside keeps
// its own kit. A Stage body speaks the site kit only.
//
// `chrome={false}` keeps the kit root, <main> and FX but draws no header or footer: the funnel doors under
// app/for are chrome-free on purpose (ADR-591).
//
// NOT under the shell, on purpose: a Space's website (app/sites, app/hosted) and a member's or a Space's
// Spotlight (app/spotlight, app/spaces/[slug]/spotlight) wear their owner's theme; the capture doors
// (app/(capture)) are a Space's own one-card forms; app/print/qr is a sheet of paper.
//
// No request data is read anywhere in the shell: the signed-in state resolves client-side after paint,
// so every page under it stays static (app/front-door-static.test.ts, docs/DEPLOY-SAFETY.md).

import '@/app/themes/frequency/kit-site.css'
import '@/app/themes/frequency/site-shell.css'
import { SiteBody, SiteRoot } from '@/components/frequency/site/shell/site-root'
import { SiteHeader } from '@/components/frequency/site/shell/site-header'
import { SiteFooter } from '@/components/frequency/site/shell/site-footer'
import { SiteFx } from '@/components/frequency/site/shell/site-fx'
import type { Surface } from '@/lib/frequency/site-pages'

export function SiteShell({
  children,
  after,
  surface = 'stage',
  chrome = true,
}: {
  children: React.ReactNode
  after?: React.ReactNode
  /** The body's theme for this family of routes; a lib/frequency/site-pages.ts row can override it. */
  surface?: Surface
  /** False: no header and no footer (the chrome-free funnel doors, ADR-591). */
  chrome?: boolean
}) {
  return (
    <SiteRoot surface={surface}>
      <a className="fq-skip" href="#main">
        Skip to content
      </a>
      {chrome && (
        <div data-surface="stage" className="fq-stage-band">
          <SiteHeader />
        </div>
      )}
      <main id="main" className={chrome ? 'fq-main' : 'fq-main fq-bare'}>
        <SiteBody>{children}</SiteBody>
      </main>
      {chrome && (
        <div data-surface="stage" className="fq-stage-band">
          <SiteFooter />
        </div>
      )}
      {after}
      <SiteFx />
    </SiteRoot>
  )
}
