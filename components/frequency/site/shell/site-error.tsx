'use client'

// The website's error state in the kit (see site-status.tsx). Reports the error exactly as RouteError
// does (console + Sentry), then offers a retry and a way home.

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { SiteStatus } from './site-status'

export function SiteError({
  error,
  reset,
  lead,
  homeHref = '/',
  homeLabel = 'Back home',
}: {
  error: Error & { digest?: string }
  reset: () => void
  lead: string
  homeHref?: string
  homeLabel?: string
}) {
  useEffect(() => {
    console.error(error)
    Sentry.captureException(error)
  }, [error])

  return (
    <SiteStatus
      crumb="Something broke"
      title={
        <>
          This page <em className="fq-iri-text">hit a snag.</em>
        </>
      }
      lead={lead}
    >
      <button type="button" className="btn fq-iri-btn" onClick={reset}>
        Try again
      </button>
      <Link className="btn btn-ghost fq-iri-rim" href={homeHref}>
        {homeLabel}
      </Link>
    </SiteStatus>
  )
}
