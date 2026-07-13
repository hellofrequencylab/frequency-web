import Link from 'next/link'
import Image from 'next/image'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteAlertBar } from '@/components/layout/site-alert-bar'
import { SupportLauncher } from '@/components/support/support-launcher'

// Shared chrome for every public /discover page: the SiteHeader (light variant,
// since these are content pages rather than the hero splash) and a footer. The
// authed app is robots-disallowed, so these are the only indexable community
// URLs. SiteHeader is auth-aware — bots/logged-out visitors get the marketing
// nav (the indexable view is unchanged), while a signed-in member keeps the
// same explore menu + account chrome they had in the app, so the menu doesn't
// switch when they cross over from /feed.
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader variant="light" />
      {/* Spacer clears the now-taller fixed header (4rem + safe-area-inset-top); min-h-dvh
          tracks the iOS dynamic toolbar so landscape height doesn't glitch. */}
      {/* id="main" is the target of SiteHeader's "Skip to content" link (WCAG 2.4.1 Bypass
          Blocks) on the only indexable community surface. */}
      <main id="main" tabIndex={-1} className="min-h-dvh bg-surface" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}>
        {/* Site-wide announcement strip, directly below the fixed header (full width). Self-hides
            once dismissed (localStorage). */}
        <SiteAlertBar />
        {children}
      </main>

      {/* pt base + the home-indicator inset on the bottom so the legal/contact links clear it
          in a standalone PWA (env() = 0 off-device, so unchanged in a normal browser). */}
      <footer
        className="bg-marketing-canvas border-t border-border/60 px-6 pt-10 px-safe"
        style={{ paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Image src="/frequency-logo.png" alt="Frequency" width={963} height={170} className="h-5 w-auto opacity-40" />
            <span className="text-xs text-muted">
              &copy; {new Date().getFullYear()} Frequency Labs Holdings
            </span>
          </div>
          <div className="flex items-center gap-8 text-xs text-muted">
            <Link href="/discover" className="hover:text-text transition-colors">Discover</Link>
            <Link href="/privacy" className="hover:text-text transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-text transition-colors">Terms</Link>
            <a href="mailto:hello@frequencylocal.com" className="hover:text-text transition-colors">Contact</a>
          </div>
        </div>
      </footer>
      {/* The report dialog the SiteAlertBar's "Submit a bug" button opens. This public tree has no
          app shell, so it mounts the launcher here (it listens for the 'open-support' event). */}
      <SupportLauncher />
    </>
  )
}
