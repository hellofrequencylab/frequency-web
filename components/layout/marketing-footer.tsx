import Link from 'next/link'
import Image from 'next/image'
import { MARKETING_NAV, ORG_LEGAL_NAME, CONTACT_EMAIL } from '@/lib/site'

// Shared footer for the public marketing site. Includes the nav, contact, and
// legal links. A mailing address slot is left ready for when one exists (it's
// also a CAN-SPAM requirement once marketing email goes out at scale).
export function MarketingFooter() {
  return (
    <footer className="bg-marketing-canvas border-t border-border/60 px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8">
          {/* Brand */}
          <div className="max-w-xs">
            <Image src="/frequency-logo.png" alt="Frequency" width={963} height={170} className="h-6 w-auto opacity-50 mb-3" />
            <p className="text-sm text-muted leading-relaxed">
              A third space for a disconnected generation. Not home, not work.
              A place to be human, together.
            </p>
          </div>

          {/* Nav */}
          <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {MARKETING_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted hover:text-text transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-10 pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs text-muted">
            &copy; {new Date().getFullYear()} {ORG_LEGAL_NAME}
          </span>
          <div className="flex items-center gap-8 text-xs text-muted">
            <Link href="/privacy" className="hover:text-text transition-colors">Privacy</Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-text transition-colors">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
