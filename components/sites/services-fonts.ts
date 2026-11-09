import localFont from 'next/font/local'

// THE SERVICES FACES, loaded ONLY on a Services website (components/sites/site-page.tsx), never from the root layout (a face registered
// in app/layout.tsx rides every route, DEPLOY-SAFETY). Bricolage Grotesque speaks and explains, Lora italic is the one soft phrase and
// DM Mono labels (lib/theme/services.ts --sv-font-*). next/font self-hosts the same files New World's Detail pairing uses and sets the
// `--font-sv-*` variables on the site root through SERVICES_FONT_CLASS. The skin reads them with the named faces as fallbacks.
// Not imported by components/sites/site-chrome.tsx, which the suite renders: next/font needs Next's compiler.

const bricolage = localFont({ src: '../../app/fonts/bricolage-grotesque/bricolage-grotesque.woff2', variable: '--font-sv-bricolage', weight: '200 800', display: 'swap', preload: false })
const lora = localFont({
  src: [
    { path: '../../app/fonts/lora/lora.woff2', weight: '400 700', style: 'normal' },
    { path: '../../app/fonts/lora/lora-italic.woff2', weight: '400 700', style: 'italic' },
  ],
  variable: '--font-sv-lora',
  display: 'swap',
  preload: false,
})
const dmMono = localFont({
  src: [
    { path: '../../app/fonts/dm-mono/dm-mono-400.woff2', weight: '400' },
    { path: '../../app/fonts/dm-mono/dm-mono-500.woff2', weight: '500' },
  ],
  variable: '--font-sv-mono',
  display: 'swap',
  preload: false,
})

/** The class that sets the three `--font-sv-*` variables; put it on the Services site root. */
export const SERVICES_FONT_CLASS = [bricolage, lora, dmMono].map((f) => f.variable).join(' ')
