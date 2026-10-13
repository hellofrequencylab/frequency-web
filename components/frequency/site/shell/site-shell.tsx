// THE FREQUENCY PUBLIC SITE SHELL: the kit root, skip link, header + mega menu + sheet + search, the
// page in <main id="main">, the footer, and the FX island. Rendered by app/(marketing)/layout.tsx and
// the front door (app/page.tsx) when SITE_DESIGN is 'frequency'; DAWN keeps its own chrome.
//
// Pages set their state through lib/frequency/site-pages.ts (a row per route, in the first paint) or
// <SitePage/> (after hydration); they end on <KeepGoing/>; client components read the side with
// useSiteSide(). The kit stylesheet is imported here, so only the layouts that render this shell load it.
//
// No request data is read anywhere in the shell: the signed-in state resolves client-side after paint,
// so every page under it stays static (app/front-door-static.test.ts, docs/DEPLOY-SAFETY.md).

import '@/app/themes/frequency/kit-site.css'
import '@/app/themes/frequency/site-shell.css'
import { SiteRoot } from '@/components/frequency/site/shell/site-root'
import { SiteHeader } from '@/components/frequency/site/shell/site-header'
import { SiteFooter } from '@/components/frequency/site/shell/site-footer'
import { SiteFx } from '@/components/frequency/site/shell/site-fx'

export function SiteShell({ children, after }: { children: React.ReactNode; after?: React.ReactNode }) {
  return (
    <SiteRoot>
      <a className="fq-skip" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="fq-main">
        {children}
      </main>
      <SiteFooter />
      {after}
      <SiteFx />
    </SiteRoot>
  )
}
