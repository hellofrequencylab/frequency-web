import type { CSSProperties, ReactNode } from 'react'
import { NETWORK_CSS, NETWORK_BLOCK_CSS } from '@/components/sites/network-css'
import { networkAccentVars, networkScheme } from '@/lib/theme/network'
import { SITE_FACE_SHEETS, SITE_FACE_VARS } from '@/lib/theme/site-faces'

// THE SPACE PAGE IN ITS WEBSITE'S LOOK (LIVE-906). A Space whose website wears Network shows the same sections
// on its Frequency page, so the page body wears the website's paper, scheme, faces and section sheet instead
// of reading as a second, unstyled copy. The app keeps its own chrome (header, tabs, rail): only the body is
// dressed, and the paper is painted on this wrapper, never on <html>/<body> the way the website does.
//
// FACES: the website self-hosts them through next/font on its own root (components/sites/network-fonts.ts).
// Importing that here would register three faces on every Space page route (DEPLOY-SAFETY), so this page
// asks Google Fonts for them only when it renders (the CSP already allows fonts.googleapis.com and
// fonts.gstatic.com), and sets the `--font-nw-*` variables the token block reads to the named faces.
const FACES = SITE_FACE_SHEETS.network
const FONT_VARS = SITE_FACE_VARS.network

/** The website sheet minus its page-level rule: the app's own canvas stays the app's. The body column is
 *  narrower than the viewport the sheet's `vw` sizes assume, so the widest number sizes to the column. */
const NETWORK_APP_CSS = `${NETWORK_CSS.split('\n').filter((line) => !line.startsWith('html:has(')).join('\n')}
[data-nw-app]{border-radius:var(--nw-r-cover);overflow:clip;container-type:inline-size}
[data-nw-app] .nw-stat dd{font-size:clamp(2.2rem,1.2rem + 2.6cqi,3.6rem)}`

/** Dress a page body that carries Network sections. `wearsNetwork`: the Space's website wears the Network
 *  theme, so the body takes its full look; otherwise the sections bring their own sheet in the Space's
 *  palette (NETWORK_BLOCK_CSS), the same way they do on a website in another theme. */
export function NetworkPageScope({ wearsNetwork, accent, children }: { wearsNetwork: boolean; accent: string | null; children: ReactNode }) {
  if (!wearsNetwork) {
    return (
      <>
        <style>{NETWORK_BLOCK_CSS}</style>
        {children}
      </>
    )
  }
  return (
    <div data-nw-app="" data-house-theme="network" data-scheme={networkScheme(accent)} style={{ ...networkAccentVars(accent), ...FONT_VARS } as CSSProperties}>
      <link rel="stylesheet" href={FACES} precedence="default" />
      <style>{NETWORK_APP_CSS}</style>
      {children}
    </div>
  )
}

