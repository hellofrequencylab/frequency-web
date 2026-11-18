import localFont from 'next/font/local'

// Route group for the link-only, noindex partner pages under /build (the /build index, /build/how, /build/vision). Deliberately OUTSIDE (marketing): no SiteShell
// header, mega menu or footer, and nothing here is in lib/frequency/site-nav.ts or app/sitemap.ts.
// The brief brings its own chrome. Fonts are the repo's own files (app/fonts), loaded only here.
const unbounded = localFont({ src: '../fonts/unbounded/unbounded.woff2', variable: '--font-unbounded', weight: '200 900', display: 'swap' })
const hanken = localFont({ src: '../fonts/hanken-grotesk/hanken-grotesk.woff2', variable: '--font-hanken', weight: '100 900', display: 'swap' })
// Fraunces italic (SIL OFL, via @fontsource/fraunces) carries the captions. Self-hosted so the page
// never depends on a third-party font request.
const fraunces = localFont({
  src: [
    { path: '../fonts/fraunces/fraunces-latin-400-italic.woff2', weight: '400', style: 'italic' },
    { path: '../fonts/fraunces/fraunces-latin-500-italic.woff2', weight: '500', style: 'italic' },
  ],
  variable: '--font-fraunces-italic',
  display: 'swap',
})

// Instrument Serif carries the italic voice of the /build/vision canvas (the Frequency design system's serif).
const instrumentSerif = localFont({
  src: [
    { path: '../fonts/instrument-serif/instrument-serif.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/instrument-serif/instrument-serif-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
})

export default function BriefLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${unbounded.variable} ${hanken.variable} ${fraunces.variable} ${instrumentSerif.variable} contents`}>{children}</div>
}
