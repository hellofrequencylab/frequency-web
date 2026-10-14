import Link from 'next/link'
import { Radio } from 'lucide-react'
import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteShell } from '@/components/frequency/site/shell/site-shell'
import { SiteNotFound } from '@/components/frequency/site/shell/site-status'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

export default function NotFound() {
  // FREQUENCY (ADR-1737, build-time). This is the 404 an unmatched URL gets (the (main) catch-all closes
  // its params, so Next answers here at routing time). It stood bare on DAWN's canvas with a DAWN tile;
  // under Frequency it is the website's own not-found hero inside the site shell, so a dead link still
  // has the header, the search and the footer to find a way back. The shell reads no request data, so
  // this stays static.
  if (SITE_DESIGN === 'frequency') {
    return (
      <SiteShell>
        <SiteNotFound />
      </SiteShell>
    )
  }
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-card bg-primary-bg flex items-center justify-center">
            <Radio className="w-8 h-8 text-primary-strong" strokeWidth={2} />
          </div>
        </div>
        <p className="text-display-h2 font-bold text-subtle/60 dark:text-text mb-4 tabular-nums">
          404
        </p>
        <h1 className="text-lead font-semibold text-text mb-2">
          Page not found
        </h1>
        <p className="text-body-sm text-muted leading-relaxed mb-8">
          This page doesn&apos;t exist or may have moved.
        </p>
        <Link
          href="/feed"
          className="inline-flex items-center rounded-xl bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
        >
          Back to feed
        </Link>
      </div>
    </div>
  )
}
