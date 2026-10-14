'use client'

import Link from 'next/link'
import '@/app/themes/active/members-community'

// The community pages' error boundary face, in the kit (Circles, Classifieds). The route's error.tsx
// keeps its own Sentry report and hands this the copy and the reset; under DAWN it draws its
// EmptyState as before.
export function FqErrorState({
  title,
  body,
  href,
  cta,
  reset,
}: {
  title: string
  body: string
  href: string
  cta: string
  reset: () => void
}) {
  return (
    <div className="empty stack" role="alert">
      <h1 className="h3">{title}</h1>
      <span className="t2">{body}</span>
      <div className="row wrap fqm-row-center">
        <button type="button" className="btn" onClick={reset}>
          Try again
        </button>
        <Link className="btn pa" href={href}>
          {cta}
        </Link>
      </div>
    </div>
  )
}
