'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, SearchX } from 'lucide-react'

// THE MEMBER SITE'S STATUS SCREENS, in the members kit: the not-found and the "hit a snag" a member
// meets inside the shell (app/(main)/not-found.tsx and app/(main)/error.tsx) under the Frequency design.
// The kit's soft empty room (`.empty.mu-empty`, members-ui.css) with the page's one <h1> and a row of
// ways back in, every one a route that exists: the Feed first, then Events, Search and Help. DAWN keeps
// its EmptyState in those files.
//
// A client file because the error face must be (it holds the boundary's reset); the not-found face has
// no hooks and renders from the server file as well.

const WAYS_BACK = [
  { href: '/events', label: 'Events' },
  { href: '/search', label: 'Search' },
  { href: '/help', label: 'Help' },
] as const

function Status({
  tone,
  title,
  body,
  primary,
}: {
  tone: 'no-results' | 'error'
  title: string
  body: string
  primary: React.ReactNode
}) {
  const Glyph = tone === 'error' ? AlertTriangle : SearchX
  return (
    <div className="empty mu-empty" data-tone={tone}>
      <span className="ic" aria-hidden="true">
        <Glyph />
      </span>
      <h1 className="h3">{title}</h1>
      <p className="t2" role={tone === 'error' ? 'alert' : undefined}>
        {body}
      </p>
      <div className="mu-act mu-ways" role="group" aria-label="Ways back in">
        {primary}
        {WAYS_BACK.map((w) => (
          <Link key={w.href} className="btn" href={w.href}>
            {w.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

export function MemberNotFound() {
  return (
    <Status
      tone="no-results"
      title="We couldn’t find that"
      body="This page doesn’t exist, or it may have moved. Head back to your Feed, or find your way from here."
      primary={
        <Link className="btn pa" href="/feed">
          Back to Feed
        </Link>
      }
    />
  )
}

export function MemberError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Reported here exactly as the DAWN boundary does: a client-side throw caught by this boundary
    // never reaches instrumentation.ts onRequestError.
    console.error(error)
    Sentry.captureException(error)
  }, [error])
  return (
    <Status
      tone="error"
      title="Something went wrong on our end"
      body="This page hit a snag. Try again, or head back to your Feed."
      primary={
        <>
          <button type="button" className="btn pa" onClick={reset}>
            Try again
          </button>
          <Link className="btn" href="/feed">
            Back to Feed
          </Link>
        </>
      }
    />
  )
}
