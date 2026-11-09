import localFont from 'next/font/local'

// THE CYBERWITCH FACES, loaded ONLY on a CyberWitch website (components/sites/site-page.tsx) and its Spotlight, never from the root
// layout (a face registered in app/layout.tsx rides every route, DEPLOY-SAFETY). UnifrakturCook is the blackletter headline, Permanent
// Marker is the one lit phrase, Spectral does everything else including the tracked caps (lib/theme/cyberwitch.ts --cw-font-*).
// next/font self-hosts the files (OFL) and sets the `--font-cw-*` variables on the site root through CYBERWITCH_FONT_CLASS. The skin
// reads them with the named faces as fallbacks. Not imported by components/sites/site-chrome.tsx, which the suite renders.

const gothic = localFont({ src: '../../app/fonts/unifrakturcook/unifrakturcook-700.woff2', variable: '--font-cw-gothic', weight: '700', display: 'swap', preload: false })
const scrawl = localFont({ src: '../../app/fonts/permanent-marker/permanent-marker-400.woff2', variable: '--font-cw-scrawl', weight: '400', display: 'swap', preload: false })
const spectral = localFont({
  src: [
    { path: '../../app/fonts/spectral/spectral-400.woff2', weight: '400', style: 'normal' },
    { path: '../../app/fonts/spectral/spectral-500.woff2', weight: '500', style: 'normal' },
    { path: '../../app/fonts/spectral/spectral-600.woff2', weight: '600', style: 'normal' },
    { path: '../../app/fonts/spectral/spectral-700.woff2', weight: '700', style: 'normal' },
    { path: '../../app/fonts/spectral/spectral-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-cw-spectral',
  display: 'swap',
  preload: false,
})

/** The class that sets the three `--font-cw-*` variables; put it on the CyberWitch site root. */
export const CYBERWITCH_FONT_CLASS = [gothic, scrawl, spectral].map((f) => f.variable).join(' ')
