'use client'

import { useSyncExternalStore } from 'react'
import { SITE_ADMIN_HINT_COOKIE } from '@/lib/sites/site-admin-hint'
import { SiteAdminBar, type SiteAdminNavLink } from './site-admin-bar'

// The admin row on a cached, anonymous public page (site-admin-bar.tsx): drawn only once the browser holds
// the handoff's readable hint (lib/sites/site-admin-hint.ts), so a visitor's page never shows it. The
// server render is always empty, so the cached HTML is the same for everyone.

const noop = () => () => {}
const hasHint = () => document.cookie.split('; ').some((c) => c.startsWith(`${SITE_ADMIN_HINT_COOKIE}=`))

export function SiteAdminBarGate({ links }: { links: SiteAdminNavLink[] }) {
  const show = useSyncExternalStore(noop, hasHint, () => false)
  return show ? <SiteAdminBar links={links} /> : null
}
