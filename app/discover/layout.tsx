import Link from 'next/link'
import Image from 'next/image'
import { SiteHeader } from '@/components/layout/site-header'

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
      <main className="min-h-dvh bg-surface" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}>{children}</main>

      <footer className="bg-marketing-canvas border-t border-border/60 px-6 py-10">
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
    </>
  )
}
