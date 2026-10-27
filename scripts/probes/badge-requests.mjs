#!/usr/bin/env node
// LIVE-1180 probe: members ask a Space for a scannable badge, and the CyberUnicorn console lives in the
// admin menu (Admin and Janitor), not on a Space's page. Fails on main before LIVE-1180 (the console sat
// in the Space's Check in tab, gated on the Space owner, with no request path at all).
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

const page = r('app/(main)/admin/cyberunicorn/page.tsx')
if (!/requireAdmin\('admin'\)/.test(page) || !/CyberUnicornConsole/.test(page)) bad.push('the admin page does not mount the console behind requireAdmin(admin)')
if (!/id: 'cyberunicorn', href: '\/admin\/cyberunicorn'[^\n]*min: 'admin' \}/.test(r('lib/nav/studio.ts'))) bad.push('no staff-only admin menu row for /admin/cyberunicorn')
if (!/\{ leaf: 'cyberunicorn' \}/.test(r('lib/nav/studio.ts'))) bad.push('the cyberunicorn row is not placed in the admin sub-nav')
if (/CyberUnicornConsole/.test(r('app/(main)/spaces/[slug]/settings/checkin/scanners-section.tsx'))) bad.push('the console is still on the Space page')

const store = r('lib/devices/store.ts')
const gate = store.indexOf('export async function consoleStaffGate')
if (gate < 0 || !/isStaff\(caller\.webRole\)/.test(store.slice(gate, gate + 300))) bad.push('consoleStaffGate is not platform staff')

const badges = r('lib/devices/badges.ts')
for (const f of ['listBadgeRequests', 'closeBadgeRequestForCard', 'cancelBadgeRequest', 'findSpaceForConsole']) {
  const i = badges.indexOf('export async function ' + f)
  if (i < 0 || !/consoleStaffGate\(\)/.test(badges.slice(i, i + 400))) bad.push(f + ' is not staff-gated')
}
if (!/closeBadgeRequestForCard\(/.test(r('lib/devices/actions.ts'))) bad.push('writing a card does not close the request')

const layout = r('app/(main)/spaces/[slug]/(profile)/layout.tsx')
if ((layout.match(/<BadgeNote /g) ?? []).length < 1) bad.push('the Space page does not show the badge line')
if (!/Get a (scannable badge|member card)/.test(r('components/spaces/badge-request-button.tsx'))) bad.push('no Get a scannable badge button')

const mig = r('supabase/migrations/20270346018000_badge_requests.sql')
if (!/revoke all on table public\.badge_requests from public, anon, authenticated/.test(mig)) bad.push('badge_requests is not service-role only')
if (!/where status = 'pending'/.test(mig)) bad.push('no one-pending-request-per-member index')

if (bad.length) {
  console.error('LIVE-1180: ' + bad.join('; '))
  process.exit(1)
}
