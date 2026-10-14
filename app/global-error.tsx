'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { SITE_DESIGN } from '@/lib/theme/design'
import { AuthFrame } from '@/components/frequency/auth/auth-frame'
// global-error renders its own document WITHOUT the root layout's stylesheets (Next's error.md, "Good
// to know"). The Frequency token sheets and the outside-the-kit primitives are brought here so the
// frame below has its tokens; each is scoped to [data-design="frequency"], so a DAWN build's page is
// untouched by them.
import './themes/frequency/core.css'
import './themes/frequency.css'
import './themes/frequency/members-ui.css'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Forward root-level render errors to Sentry (no-op when Sentry is unconfigured).
    Sentry.captureException(error)
    console.error(error)
  }, [error])

  // FREQUENCY (ADR-1737, build-time). This replaces the ROOT LAYOUT, so the `data-design` the layout
  // stamps on <html> is gone with it: it is stamped here, or none of the design's scoped rules would
  // match. The doorway frame, a retry and a plain link home (a full load, since the app around it broke).
  if (SITE_DESIGN === 'frequency') {
    return (
      <html lang="en" data-design="frequency">
        <body>
          <AuthFrame
            kicker="Something broke"
            title="Frequency hit a snag"
            lead="Something broke on our end before the page could load. Try again, or head back home."
          >
            <div className="fqa-actions">
              <button type="button" className="btn pa" onClick={reset}>
                Try again
              </button>
              {/* A plain <a>: a client navigation would reuse the app state that just failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="btn" href="/">
                Back home
              </a>
            </div>
          </AuthFrame>
        </body>
      </html>
    )
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-surface flex items-center justify-center px-4 font-sans">
        <div className="text-center max-w-sm">
          <p className="text-display-h2 font-bold text-subtle/60 mb-4">500</p>
          <h1 className="text-lead font-semibold text-text mb-2">
            Something went wrong
          </h1>
          <p className="text-body-sm text-muted leading-relaxed mb-8">
            A critical error occurred. Please refresh the page.
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  )
}
