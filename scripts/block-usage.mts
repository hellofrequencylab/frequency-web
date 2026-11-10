// The block census (PROG-D4, ADR-1502): which block types are placed in which stored documents,
// across how many tenants. This is the question PROG-E2 must answer BEFORE retiring a block
// ("which tenants use this block", ADR-975): a type that reads 0 documents can go; a type on 19
// Space profiles needs an `up` migration that rewrites those documents first.
//
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... pnpm block-usage            # every type
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... pnpm block-usage SpaceAbout # one type
//   ... pnpm block-usage --json                                                              # machine-readable
//   pnpm block-usage --tenant-snapshot [system type]                                         # checked-in aggregate
//
// Reads through PostgREST's RPC surface (`public.block_type_usage`, service_role only, a live scan
// over pages, Space page docs, Space entity layouts and page_settings; see migration
// 20270345007500). Service-role only. No `pnpm install` assumptions beyond Node: plain fetch.

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
if (args[0] === '--tenant-snapshot') {
  const snapshot = JSON.parse(readFileSync(new URL('./block-tenant-usage.snapshot.json', import.meta.url), 'utf8'))
  const [, system, blockType] = args
  if (args.length === 1) {
    console.log(JSON.stringify(snapshot, null, 2))
    process.exit(0)
  }
  if (args.length !== 3 || !Object.hasOwn(snapshot.systems, system)
    || !Object.hasOwn(snapshot.systems[system], blockType)) {
    console.error('Unknown or missing system or block type in the captured registry')
    process.exit(1)
  }
  console.log(JSON.stringify({ capturedOn: snapshot.capturedOn, system, blockType, tenants: snapshot.systems[system][blockType] }))
  process.exit(0)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !KEY) {
  console.error('✖ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const json = args.includes('--json')
const type = args.find((a) => !a.startsWith('--')) ?? null

type Row = { block_type: string; store: string; documents: number; tenants: number; placements: number }

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/block_type_usage`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ p_block_type: type }),
})
if (!res.ok) {
  // A failed read is a failure, never an empty census (ADR-979).
  console.error(`✖ block_type_usage failed: HTTP ${res.status} ${await res.text()}`)
  process.exit(1)
}
const rows = (await res.json()) as Row[]

if (json) {
  console.log(JSON.stringify(rows, null, 2))
  process.exit(0)
}

if (rows.length === 0) {
  console.log(type ? `No stored document places "${type}".` : 'No stored document places any block.')
  process.exit(0)
}

const w = (s: string, n: number) => s.padEnd(n)
const widest = Math.max(10, ...rows.map((r) => r.block_type.length))
console.log(`${w('block type', widest)}  ${w('store', 14)}  ${'documents'.padStart(9)}  ${'tenants'.padStart(7)}  ${'placements'.padStart(10)}`)
for (const r of rows) {
  console.log(
    `${w(r.block_type, widest)}  ${w(r.store, 14)}  ${String(r.documents).padStart(9)}  ${String(r.tenants).padStart(7)}  ${String(r.placements).padStart(10)}`,
  )
}
console.log(`\n${rows.length} row${rows.length === 1 ? '' : 's'} · a live scan, nothing cached`)
