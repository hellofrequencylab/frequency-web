#!/usr/bin/env node
// AGENT PACKETS — derive the next work packet per fan-out lane from the one list.
//
// WHY THIS EXISTS. ADR-1325 said two lanes; the owner later asked to fan out. Status still lives
// only in docs/BUILD-BACKLOG.json (ADR-1043). This script does not become a second backlog: it
// READS the one list and prints one open row per independent area, plus the files that would
// collide if two agents claimed the same packet.
//
// Usage:
//   pnpm packets                 # human report: next packet per lane
//   pnpm packets --json          # machine-readable
//   pnpm packets --lane money    # one derived lane
//   pnpm packets --prompt        # print the reusable cloud-agent prompt
//   pnpm packets --ledger l.json # also compare repo migrations to a fetched ledger
//
// Cursor Dashboard cannot be created from this MCP (get-automation is lookup-only). The prompt
// below is what Daniel pastes into Automations. See ADR-1412.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compare, parseLedger, repoRows } from './maintenance/ledger-parity.mjs'

const FILE = 'docs/BUILD-BACKLOG.json'
const MIG_DIR = join('supabase', 'migrations')

/** Parked by name. Do not pick these up. */
export const PARKED_IDS = new Set([
  'LIVE-241', // 16→7 member rail; cancelled by ADR-1406
  'DEF-MOBILE',
  'DEF-ETSY',
  'DEF-A2P',
  'PROG-A1',
  'PROG-A3',
  'PROG-A4',
  'PROG-E10',
  'PROG-W6',
  'PROG-P7',
])

/** Branches other agents already own. Stay off them and off their PRs. */
export const OFF_LIMITS_BRANCHES = ['cursor/cloud-agent-workspace-8978']

/** Journey sales rows currently claimed by the 8978 workspace. */
export const FOREIGN_LANE_CLAIMS = {
  journey: 'cursor/cloud-agent-workspace-8978',
}

const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 }

/** Surfaces that two agents must never edit in the same merge window. */
export const SERIAL_SURFACES = [
  'components/layout/app-shell.tsx',
  'lib/nav/registry.ts',
  'lib/nav-areas.ts',
  'lib/layout/page-chrome.ts',
  'package.json',
  'vercel.json',
  'scripts/check-shell-weight.mjs',
  'scripts/check-build-budget.mjs',
  'scripts/check-og-trace.mjs',
  'scripts/check-cache-budget.mjs',
  'scripts/check-build-fanout.mjs',
  'scripts/check-notfound-routes.mjs',
]

const PATH_IN_TEXT =
  /(?:^|[\s"'`=(])((?:app|components|lib|scripts|docs|supabase|content|test|\.github)\/[A-Za-z0-9_./[\]-]+\.[A-Za-z0-9]+)/g

export const AGENT_PROMPT = `You are a Frequency cloud agent on hellofrequencylab/frequency-web.

ONE LIST. Status lives only in docs/BUILD-BACKLOG.json. Never open a new plan/TODO/roadmap/audit markdown. pnpm check:one-list freezes that set.

YOUR PACKET. Run \`pnpm packets --lane <LANE>\` (or \`pnpm packets --json\`) and pick ONE open row from that lane. Re-test the row's premise before writing code (ADR-1082). If the premise expired, close or re-point the row; do not build the old story.

DO NOT.
- Merge to main while required CI is red. main merge is a production deploy.
- Force-push. Auto-squash is the default (docs/WORKFLOW.md).
- Ask the owner to click Merge. That is a process bug. Arm GitHub auto-merge yourself.
- Use \`gh pr create\`. Open or update the PR with ManagePullRequest. Base branch is main.
- Absorb another agent's PR. Stay off ${OFF_LIMITS_BRANCHES.join(', ')} and its PRs.
- Pick parked work: 16→7 nav (LIVE-241), mobile, white-label Sites, Etsy, App Platform.
- Call apply_migration or supabase db push. Prod schema is execute_sql for the DDL, then an explicit insert into supabase_migrations.schema_migrations at the FILE's own 14-digit version (docs/DATABASE.md). Never stamp wall-clock versions.
- Send Resend if this session has no key.
- Touch SERIAL surfaces (app-shell, nav registry, postbuild gates) while another lane is in flight on them. \`pnpm packets\` names the collision files.

LOOP.
1. Branch from current main. One backlog row per PR. Keep under the 40-file hard gate (15 is guidance).
2. Implement until the row's probe would pass. Run that probe and the tests the change touches.
3. Commit, push, ManagePullRequest (ready, not draft). Immediately arm squash auto-merge with \`gh pr merge --auto --squash <n>\`. That is the one \`gh\` write this loop uses. Subscribe to the PR/CI. Required checks: checks, analyze, lint, test, Vercel, db-tests. pr-compare is advisory.
4. Do not merge red; \`--auto\` will not. After GitHub merges, read the production build log: postbuild is the artifact truth (six gates). CI never builds.
5. If the PR added supabase/migrations/*.sql, apply with execute_sql then ledger insert; run pnpm check:migrations --require-ledger when credentials exist.
6. Validate the row's probe on main. Close the row in BUILD-BACKLOG.json in the SAME PR that makes the probe pass, and prune it from meta.slate.waves.

PRODUCT-FIRST (ADR-1403 / ADR-1445). Calendar section first: LIVE-414 then LIVE-415 then LIVE-416–419. LIVE-410 and LIVE-376 are closed. LIVE-234 is P0 money proof, owner-gated (account / OWN-078) — do not demote it and do not pick it. LIVE-408 needs an owner ruling. Journey sales (LIVE-392+) is claimed by ${FOREIGN_LANE_CLAIMS.journey}. Do not start Editor, Sites, Etsy, App Platform, or LIVE-242.

TWO-AGENT SPLIT (2026-09-19, meta.slate.metaScanCleanup). If you are the product agent: take derived lane \`events\` (calendar C0–C5). Do not take lane \`scan\`. If you are the scan follow-through agent: \`pnpm packets --lane scan\` and start SCAN-643 (layout cookies/headers void ISR). SCAN-636, SCAN-637, SCAN-638, SCAN-640, and SCAN-642 are done. Leave LIVE-414 through LIVE-419. Do not take LIVE-234. LIVE-412 is on the scan lane (shell split after SCAN-641), not a free shell packet.
`

export function loadBacklog(root = '.') {
  const path = join(root, FILE)
  if (!existsSync(path)) throw new Error(`${FILE} is missing`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function waveIndex(doc) {
  const waves = doc.meta?.slate?.waves ?? []
  const map = new Map()
  waves.forEach((w, i) => {
    for (const id of w.ids ?? []) {
      if (!map.has(id)) map.set(id, { index: i, name: w.name ?? `wave-${i}` })
    }
  })
  return map
}

function haystack(entry) {
  return [entry.id, entry.title, entry.detail, entry.source?.file, entry.source?.ref]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
}

export function classifyLane(entry) {
  const id = entry.id ?? ''
  const h = haystack(entry)
  // Meta-scan follow-through (2026-09-19). Must beat hygiene/shell so SCAN-638 and LIVE-412
  // stay on one agent and the product agent cannot pick LIVE-412 as a shell packet.
  if (/^SCAN-/.test(id) || id === 'LIVE-412') return 'scan'
  if (/^HYG-/.test(id)) return 'hygiene'
  if (/^PROG-E/.test(id)) return 'editor'
  if (/^OWN-/.test(id) || entry.lane === 'owner') return 'owner'
  if (
    /LIVE-392|LIVE-393|LIVE-394|LIVE-395|LIVE-396/.test(id) ||
    /journey sales|journey_plan_id|outcomesblock|journeyfaq/.test(h)
  ) {
    return 'journey'
  }
  if (
    /LIVE-241|LIVE-254|HYG-033/.test(id) ||
    /app-shell|calmspine|member rail|tab bar|nav registry/.test(h)
  ) {
    return 'shell'
  }
  if (/LIVE-186|LIVE-213|LIVE-373|pr-compare|visual baseline|viewportonly/.test(id + h)) {
    return 'visual'
  }
  if (/sitemap|robots|llms\.txt|jsonld|seo/.test(h) && /LIVE-|HYG-/.test(id)) return 'seo'
  // Calendar C0–C5 (ADR-1445) before leftover attach-to-Space / money rows.
  if (/^LIVE-41[4-9]$/.test(id) || /LIVE-376|host_space_id|event spark|attach their event/.test(id + h)) {
    return 'events'
  }
  if (
    /LIVE-410|LIVE-234|LIVE-367|space_memberships|connect readiness|checkout|stripe|payout|donation|tip-button|minEntitlement/.test(
      id + h,
    )
  ) {
    return 'money'
  }
  if (entry.lane === 'program') return 'program'
  if (entry.lane === 'hygiene') return 'hygiene'
  return 'live'
}

export function extractPaths(entry) {
  const found = new Set()
  if (entry.source?.file) found.add(entry.source.file)
  for (const p of entry.verify?.paths ?? []) found.add(p)
  const blob = `${entry.verify?.cmd ?? ''}\n${entry.detail ?? ''}`
  let m
  PATH_IN_TEXT.lastIndex = 0
  while ((m = PATH_IN_TEXT.exec(blob))) found.add(m[1])
  return [...found]
}

export function isWorkable(entry, { includeOwner = false, includeBlocked = false, includeProgram = false } = {}) {
  if (!entry || PARKED_IDS.has(entry.id)) return false
  if (entry.status === 'parked') return false
  if (entry.status !== 'open' && entry.status !== 'blocked') return false
  if (entry.lane === 'owner' && !includeOwner) return false
  if (entry.lane === 'deferred' && !includeOwner) return false
  // Programme rows are umbrellas proven by children. Agents pick the LIVE/HYG child.
  if (entry.lane === 'program' && !includeProgram) return false
  const action = entry.ownerAction
  if (!includeBlocked && action && ['ruling', 'account', 'waiting', 'config', 'content'].includes(action)) {
    return false
  }
  return true
}

function sortPackets(a, b) {
  const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
  if (pr) return pr
  const wv = a.waveIndex - b.waveIndex
  if (wv) return wv
  return a.id.localeCompare(b.id)
}

export function buildPackets(doc, opts = {}) {
  const waves = waveIndex(doc)
  const entries = Array.isArray(doc.entries) ? doc.entries : []
  const packets = []
  for (const e of entries) {
    if (!isWorkable(e, opts)) continue
    const lane = classifyLane(e)
    if (lane === 'owner' && !opts.includeOwner) continue
    const w = waves.get(e.id) ?? { index: 99, name: 'unslated' }
    packets.push({
      id: e.id,
      title: e.title,
      backlogLane: e.lane,
      derivedLane: lane,
      priority: e.priority ?? null,
      size: e.size ?? null,
      status: e.status,
      ownerAction: e.ownerAction ?? null,
      waveIndex: w.index,
      wave: w.name,
      claimedBy: FOREIGN_LANE_CLAIMS[lane] ?? null,
      paths: extractPaths(e),
      serialRisk: extractPaths(e).some((p) => SERIAL_SURFACES.includes(p)) || lane === 'shell',
    })
  }
  packets.sort(sortPackets)
  return packets
}

export function nextPerLane(packets) {
  const seen = new Set()
  const next = []
  for (const p of packets) {
    if (seen.has(p.derivedLane)) continue
    seen.add(p.derivedLane)
    next.push(p)
  }
  return next
}

export function collisionReport(packets) {
  const byFile = new Map()
  for (const p of packets) {
    for (const file of p.paths) {
      if (!byFile.has(file)) byFile.set(file, [])
      byFile.get(file).push(p.id)
    }
  }
  const shared = [...byFile.entries()]
    .filter(([, ids]) => new Set(ids).size > 1)
    .map(([file, ids]) => ({ file, ids: [...new Set(ids)] }))
  return { serialSurfaces: SERIAL_SURFACES, offLimitsBranches: OFF_LIMITS_BRANCHES, sharedFiles: shared }
}

export function listRepoMigrations(root = '.') {
  const dir = join(root, MIG_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

export function pendingMigrations(ledgerPayload, { min } = {}) {
  const { rows: repo, malformed } = repoRows()
  if (ledgerPayload == null) {
    return {
      compared: false,
      repoCount: repo.length,
      malformed,
      note: 'No ledger payload. Tree only. Fetch schema_migrations and pass --ledger, or arm SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF on pnpm check:migrations.',
    }
  }
  const ledger = parseLedger(ledgerPayload)
  const result = compare(repo, ledger, min != null ? { min } : undefined)
  const pending = [...(result.unpairedRepo ?? []), ...(result.repoOnly ?? [])]
  return {
    compared: true,
    repoCount: repo.length,
    ledgerCount: ledger.length,
    ok: result.inParity,
    pendingVersions: [...new Set(pending.map((r) => r.version))],
    report: result,
  }
}

function parseArgs(argv) {
  const args = {
    json: false,
    prompt: false,
    lane: null,
    ledger: null,
    includeOwner: false,
    includeBlocked: false,
    includeProgram: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') args.json = true
    else if (a === '--prompt') args.prompt = true
    else if (a === '--include-owner') args.includeOwner = true
    else if (a === '--include-blocked') args.includeBlocked = true
    else if (a === '--include-program') args.includeProgram = true
    else if (a === '--lane') args.lane = argv[++i]
    else if (a === '--ledger') args.ledger = argv[++i]
  }
  return args
}

function printHuman(next, collisions, migrations) {
  console.log('Agent packets (derived from docs/BUILD-BACKLOG.json, ADR-1412)')
  console.log(`Off-limits branches: ${OFF_LIMITS_BRANCHES.join(', ')}`)
  console.log('')
  console.log('Next packet per lane (open, agent-workable, not owner-gated):')
  if (!next.length) console.log('  (none)')
  for (const p of next) {
    const claim = p.claimedBy ? `  CLAIMED by ${p.claimedBy}` : ''
    const serial = p.serialRisk ? '  SERIAL' : '  parallel-ok'
    console.log(`  ${p.derivedLane.padEnd(10)} ${p.id.padEnd(10)} ${p.priority ?? '??'}  ${p.wave.split('·')[0].trim()}${serial}${claim}`)
    console.log(`             ${p.title}`)
    if (p.paths.length) console.log(`             files: ${p.paths.slice(0, 6).join(', ')}${p.paths.length > 6 ? '…' : ''}`)
  }
  console.log('')
  console.log('Shared files named by more than one open packet:')
  if (!collisions.sharedFiles.length) console.log('  (none in extracted paths)')
  for (const s of collisions.sharedFiles.slice(0, 20)) {
    console.log(`  ${s.file}  ←  ${s.ids.join(', ')}`)
  }
  console.log('')
  if (!migrations.compared) {
    console.log(`Migrations: ${migrations.repoCount} repo files. ${migrations.note}`)
  } else if (migrations.ok) {
    console.log(`Migrations: repo⇄ledger match (${migrations.repoCount} files).`)
  } else {
    console.log('Migrations: repo⇄ledger DIVERGE. Run pnpm check:migrations --require-ledger.')
  }
  console.log('')
  console.log('Prompt: pnpm packets --prompt')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.prompt) {
    process.stdout.write(AGENT_PROMPT)
    return
  }
  const doc = loadBacklog()
  let packets = buildPackets(doc, args)
  if (args.lane) packets = packets.filter((p) => p.derivedLane === args.lane)
  const next = nextPerLane(packets)
  const collisions = collisionReport(packets)
  let ledgerPayload = null
  if (args.ledger) ledgerPayload = JSON.parse(readFileSync(args.ledger, 'utf8'))
  const migrations = pendingMigrations(ledgerPayload)
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          next,
          packets,
          collisions,
          migrations,
          promptHint: 'pnpm packets --prompt',
        },
        null,
        2,
      ),
    )
    return
  }
  printHuman(next, collisions, migrations)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (err) {
    console.error(`agent-packets failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
