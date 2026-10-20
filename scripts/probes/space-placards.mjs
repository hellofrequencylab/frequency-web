#!/usr/bin/env node
// LIVE-1182 probe: staff write a Space's signed door check-in link onto an NFC placard from the
// CyberUnicorn console, the placard is listed in a service-role-only table, and a phone tap on it lands
// on the normal check-in, which the console then shows. The console also mirrors the Unicorn's screen.
// Fails on main before LIVE-1182: there was no space_tags table and the console wrote only member cards.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

const mig = r('supabase/migrations/20270346019000_space_tags.sql')
if (!mig) bad.push('the space_tags migration is missing')
else {
  if (!/create table if not exists public\.space_tags/.test(mig)) bad.push('the migration does not create public.space_tags')
  if (!/alter table public\.space_tags enable row level security/.test(mig)) bad.push('space_tags has no RLS')
  if (!/revoke all on table public\.space_tags from public, anon, authenticated/.test(mig)) bad.push('space_tags is not revoked from public, anon and authenticated')
}

if (!/^space_tags\s+internal\s*$/m.test(r('scripts/table-grants.txt'))) bad.push('space_tags is not internal in scripts/table-grants.txt')
if (!/^space_tags\s*$/m.test(r('scripts/rls-deny-all.txt'))) bad.push('space_tags is not in scripts/rls-deny-all.txt')

const store = r('lib/devices/space-tags.ts')
for (const f of ['listSpaceTags', 'recordSpaceTag', 'removeSpaceTag', 'latestCheckinSince']) {
  const i = store.indexOf('export async function ' + f)
  if (i < 0 || !/consoleStaffGate\(\)/.test(store.slice(i, i + 500))) bad.push(f + ' is not staff-gated')
}

const act = r('lib/devices/tag-actions.ts')
if (!/^'use server'/.test(act)) bad.push('tag-actions.ts is not a server action module')
const start = act.indexOf('export async function startSpaceTag')
if (start < 0 || !/ensureCheckinNodeForStaff\(/.test(act.slice(start, start + 500))) bad.push('startSpaceTag does not gate through ensureCheckinNodeForStaff')
if (!/signed(Node|Placard)Url\(node\.id\)/.test(act)) bad.push('startSpaceTag does not write the signed door link (signedPlacardUrl)')
if (!/recordSpaceTag\(/.test(act) || !/latestCheckinSince\(/.test(act)) bad.push('tag-actions.ts bypasses the staff-gated space-tags store')

const checkin = r('lib/spaces/checkin.ts')
const ens = checkin.indexOf('export async function ensureCheckinNodeForStaff')
if (ens < 0 || !/isStaff\(/.test(checkin.slice(ens, ens + 400))) bad.push('ensureCheckinNodeForStaff does not check platform staff')

const ui = r('components/spaces/loyalty/cyberunicorn-console.tsx')
for (const f of ['startSpaceTag', 'finishSpaceTag', 'checkPlacardTap']) {
  if (!new RegExp(f + '\\(').test(ui)) bad.push('the console never calls ' + f)
}
if (!ui.includes("'screen.nav'")) bad.push("the console never sends 'screen.nav'")

if (!existsSync('lib/device/screen-mirror.ts')) bad.push('lib/device/screen-mirror.ts is missing')

if (bad.length) {
  console.error('LIVE-1182 FAIL:\n  ' + bad.join('\n  '))
  process.exit(1)
}
console.log('LIVE-1182 ok: placards are staff-written with the signed door link, listed service-role only, tap-checked, and the screen mirror is wired.')
