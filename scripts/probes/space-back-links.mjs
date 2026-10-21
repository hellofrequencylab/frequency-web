#!/usr/bin/env node
// LIVE-1191 probe: every Space console page's back link names its parent hub tab through consoleBack
// (lib/spaces/console-back.ts), nothing still says "Back to manage" or points at the bare Home by habit, and
// Spotlight is a top-level sidebar row beside the page editor.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const base = 'app/(main)/spaces/[slug]/'
const pages = [
  'loom', 'journeys', 'practices', 'manage/circles', 'manage/leadership', 'manage/layout', 'manage/mode', 'manage/modules', 'manage/spotlight',
  'settings/airwaves', 'settings/program', 'settings/calendar', 'settings/automation', 'settings/members', 'settings/collaborators',
  'settings/billing', 'settings/offerings', 'settings/payments', 'settings/shop', 'settings/email', 'settings/email-style',
  'settings/qr', 'settings/reach', 'settings/cross-listing', 'marketing', 'crm', 'crm/conversations', 'crm/leads', 'crm/doors', 'crm/shared',
]
for (const p of pages) {
  const src = r(`${base}${p}/page.tsx`)
  if (!/consoleBack(For)?\(/.test(src)) bad.push(`${base}${p}/page.tsx: no consoleBack back link`)
  if (/label: 'Back to manage'/.test(src)) bad.push(`${base}${p}/page.tsx: still says "Back to manage"`)
}
if (!/key: 'spotlight'/.test(r('components/frequency/admin/space-console.tsx'))) bad.push('space-console.tsx: no Spotlight sidebar row')

if (bad.length) {
  console.error('Space back links probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('Space back links probe ok')
