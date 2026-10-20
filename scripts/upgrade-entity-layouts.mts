// CONVERT STORED PAGE LAYOUTS TO NODE STORAGE, ONCE (E0 task 15, docs/EDITOR-E0.md §1.6).
//
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs \
//       scripts/upgrade-entity-layouts.mts [--apply] [--backup <file>]
//
// Dry run by default. Nothing is written until you pass --apply.
//
// ── WHEN TO RUN IT ─────────────────────────────────────────────────────────────────────────────
//
// NOT before `render_path_space_profile` is on and the Space, Spotlight and member editors have been
// tested with it on. Once a layout is stored as nodes, the type-keyed editors REFUSE to save over it
// (lib/entity-blocks/legacy-write-guard.ts), so converting with the switch off strands the owner. If it
// is never run, nothing breaks: every read upgrades on the fly (LIVE-119).
//
// ── WHAT IT TOUCHES ────────────────────────────────────────────────────────────────────────────────
//
//   spaces.preferences.profileLayout and .profileLayoutDraft   (kind space)
//   profiles.meta.entityGrid                                    (kind member)
//
// Every other key in `preferences` / `meta` is kept. A document already stored as nodes is skipped, so a
// second run converts nothing. A value that is not a layout is reported and left alone. Email documents
// (campaigns.block_json, nurture_steps.block_json) are NOT converted here: they convert on their next
// save behind `render_path_email`, and the send path reads either shape.
//
// ── SAFETY ─────────────────────────────────────────────────────────────────────────────────────────
//
// With --apply the script first writes every value it is about to replace, with its row id, to the backup
// file (default ./entity-layout-backup-<timestamp>.json), and only then patches. Restoring is putting each
// `before` back at its `path`. Take a database snapshot first as well.

import { writeFileSync } from 'node:fs'
import { backfillLayout } from '../lib/entity-blocks/backfill.ts'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✖ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const backupArg = process.argv.indexOf('--backup')
const BACKUP = backupArg > -1 ? process.argv[backupArg + 1] : `./entity-layout-backup-${Date.now()}.json`
const REST = `${URL}/rest/v1`
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const PAGE = 500

type Json = Record<string, unknown>
type Target = { table: 'spaces' | 'profiles'; label: string; column: 'preferences' | 'meta'; key: string; kind: 'space' | 'member'; ident: string }
const TARGETS: Target[] = [
  { table: 'spaces', label: 'space published', column: 'preferences', key: 'profileLayout', kind: 'space', ident: 'slug' },
  { table: 'spaces', label: 'space draft', column: 'preferences', key: 'profileLayoutDraft', kind: 'space', ident: 'slug' },
  { table: 'profiles', label: 'member grid', column: 'meta', key: 'entityGrid', kind: 'member', ident: 'handle' },
]

async function rest(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${REST}${path}`, { ...init, headers: { ...auth, ...(init.headers as Record<string, string> | undefined) } })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

async function rows(t: Target): Promise<Json[]> {
  const out: Json[] = []
  for (let from = 0; ; from += PAGE) {
    const page = (await rest(`/${t.table}?select=id,${t.ident},${t.column}&order=id&limit=${PAGE}&offset=${from}`)) as Json[]
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

type Change = { table: string; id: string; ident: string; path: string; column: string; before: unknown; next: unknown; whole: Json }
const changes: Change[] = []
const tally = new Map<string, { convert: number; alreadyNative: number; invalid: number }>()

for (const t of TARGETS) {
  const counts = { convert: 0, alreadyNative: 0, invalid: 0 }
  for (const row of await rows(t)) {
    const whole = (row[t.column] ?? {}) as Json
    if (!(t.key in whole)) continue
    const verdict = backfillLayout(whole[t.key], t.kind)
    if (verdict.action === 'skip') {
      if (verdict.reason === 'already-native') counts.alreadyNative += 1
    } else if (verdict.action === 'invalid') {
      counts.invalid += 1
      console.warn(`  ! ${t.label} ${String(row[t.ident])}: not a layout, left alone`)
    } else {
      counts.convert += 1
      changes.push({ table: t.table, id: String(row.id), ident: String(row[t.ident]), path: `${t.column}.${t.key}`, column: t.column, before: whole[t.key], next: verdict.next, whole })
    }
  }
  tally.set(t.label, counts)
}

console.log(APPLY ? '── APPLY ──' : '── DRY RUN (nothing written) ──')
for (const [label, c] of tally) console.log(`${label.padEnd(16)} convert ${c.convert}   already nodes ${c.alreadyNative}   invalid ${c.invalid}`)
for (const c of changes) console.log(`  ${c.table}/${c.ident} ${c.path}`)

if (!APPLY) {
  console.log(`\n${changes.length} document(s) would convert. Re-run with --apply once the switches are on and tested.`)
  process.exit(0)
}
if (!changes.length) {
  console.log('\nNothing to convert.')
  process.exit(0)
}

writeFileSync(BACKUP, JSON.stringify(changes.map(({ table, id, ident, path, before }) => ({ table, id, ident, path, before })), null, 2))
console.log(`\nBackup written to ${BACKUP}`)

// One PATCH per row, folding every changed key of that row into a single write over a fresh read, so a row
// with both a published and a draft layout is written once and no other key is lost.
const byRow = new Map<string, Change[]>()
for (const c of changes) byRow.set(`${c.table}:${c.id}`, [...(byRow.get(`${c.table}:${c.id}`) ?? []), c])
let written = 0
for (const group of byRow.values()) {
  const first = group[0]!
  const fresh = ((await rest(`/${first.table}?select=${first.column}&id=eq.${first.id}`)) as Json[])[0]
  const doc = { ...((fresh?.[first.column] as Json | undefined) ?? first.whole) }
  for (const c of group) doc[c.path.split('.')[1]!] = c.next
  await rest(`/${first.table}?id=eq.${first.id}`, { method: 'PATCH', body: JSON.stringify({ [first.column]: doc }), headers: { Prefer: 'return=minimal' } })
  written += 1
}
console.log(`Converted ${changes.length} document(s) across ${written} row(s). Re-run to confirm: it should convert 0.`)
