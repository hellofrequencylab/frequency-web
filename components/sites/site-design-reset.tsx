import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteDesignFollow } from './site-design-follow'

// A SPACE WEBSITE WEARS ITS OWN THEME, NEVER THE PLATFORM'S DESIGN (ADR-1723; owner, 2026-10-14). The root
// layout stamps <html data-design> with the platform design, and app/themes/frequency.css re-points every
// DAWN name (--color-*, --design-*, the faces) at Frequency's tokens under data-design="frequency". A
// website's house theme (lib/sites/house-theme.ts, Default and the rest) is built on those DAWN names, so
// once Frequency went live every website lost its theme. This puts the root back on DAWN, the base every
// website theme is drawn on, before the site's body paints: a synchronous inline script, the first node
// of the site's tree. Under DAWN it renders nothing.
//
// THE SITE'S OWN ADMIN IS NOT THE WEBSITE (SCAN-891). /admin/* on the site's host is the platform's site
// editor, drawn in the Frequency editor kit ([data-design="frequency"] [data-kit="editor"]); resetting it to
// DAWN left the editor with no styles at all. So the reset skips /admin, and SiteDesignFollow keeps the root
// right when a client-side move crosses between the site and its admin.
const RESET = `if(!/^\\/admin(\\/|$)/.test(location.pathname))document.documentElement.setAttribute('data-design','dawn')`

export function SiteDesignReset() {
  if (SITE_DESIGN === 'dawn') return null
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: RESET }} />
      <SiteDesignFollow design={SITE_DESIGN} />
    </>
  )
}
