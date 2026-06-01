import Link from 'next/link'
import Image from 'next/image'
import { SiteHeader } from '@/components/layout/site-header'

// Shared chrome for every public /discover page: the public SiteHeader (light
// variant, since these are content pages rather than the hero splash) and a
// footer. The authed app is robots-disallowed, so these are the only indexable
// community URLs.
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader profile={null} variant="light" />
      <main className="min-h-screen bg-surface pt-16">{children}</main>

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
            <a href="mailto:hello@findafreq.com" className="hover:text-text transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </>
  )
}
