'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { AuthFrame } from '@/components/frequency/auth/auth-frame'
// global-error renders its own document WITHOUT the root layout's stylesheets (Next's error.md, "Good
// to know"). The Frequency token sheets and the outside-the-kit primitives are brought here so the
// frame below has its tokens. The imports are generated through app/themes/active/.
import './themes/active/core'
import './themes/active/alias'
import './themes/active/members-ui'

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

  // This boundary replaces the root document, so keep its own html/body,
  // Frequency marker and token imports when the surrounding app cannot render.
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
