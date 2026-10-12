'use client'

import { useEffect, useState } from 'react'
import { siteMembershipLine, type SiteMembershipView } from '@/lib/sites/site-member'

// THE READER'S MEMBERSHIP IN THIS SPACE, IN THE WEBSITE HEADER (LIVE-699). The website is cached and
// anonymous (lib/core/anonymous-render.ts), so this island asks Frequency after the page is up, with the
// reader's own session, for their membership in this one Space (app/api/sites/[slug]/membership) and
// shows the tier as a small pill that opens the Space's Memberships page on Frequency. A visitor who is
// not a member, or not signed in, or reading on a custom domain the session does not reach, sees nothing:
// the header stays exactly as the cached page drew it.

export function SiteMemberBadge({ endpoint, href }: { endpoint: string; href: string }) {
  const [membership, setMembership] = useState<SiteMembershipView | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(endpoint, { credentials: 'include', signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { membership?: SiteMembershipView | null } | null) => {
        const m = body?.membership
        if (m && typeof m.tierName === 'string' && (m.status === 'active' || m.status === 'waitlist')) setMembership({ tierName: m.tierName, status: m.status })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [endpoint])
  const line = siteMembershipLine(membership)
  if (!line) return null
  return (
    <a href={href} className="hs-member" aria-label={`${line}. Your membership on Frequency`}>
      {line}
    </a>
  )
}
