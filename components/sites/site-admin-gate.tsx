'use client'

import { useEffect, useState, type ReactNode } from 'react'

// WHO SEES A WEBSITE'S ADMIN LINKS (SCAN-970, owner 2026-10-16: "The public site shows the admin edit button.
// That should ONLY be available for a logged in admin. Same with any footer links."). The website is cached and
// anonymous, so the page itself cannot know who is reading it. After it is up, this island asks the site's own
// check (on the site's host, `/admin/session`, which reads the admin pass cookie; on Frequency's host, the
// reader's session) whether the reader runs this Space, and only then shows the admin links. Until the answer
// arrives, and for every visitor, nothing admin is drawn.

const answers = new Map<string, Promise<boolean>>()

function askSiteAdmin(check: string): Promise<boolean> {
  let answer = answers.get(check)
  if (!answer) {
    answer = fetch(check, { credentials: 'include', headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { admin?: unknown } | null) => body?.admin === true)
      .catch(() => false)
    answers.set(check, answer)
  }
  return answer
}

/** True once the site's check says the reader may manage this Space. False for everyone else. */
export function useSiteAdmin(check: string | null | undefined): boolean {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    if (!check) return
    let live = true
    void askSiteAdmin(check).then((ok) => {
      if (live) setAdmin(ok)
    })
    return () => {
      live = false
    }
  }, [check])
  return admin
}

/** Draws its children only for a reader the site's check confirms as an admin. */
export function SiteAdminOnly({ check, children }: { check: string | null | undefined; children: ReactNode }) {
  return useSiteAdmin(check) ? <>{children}</> : null
}
