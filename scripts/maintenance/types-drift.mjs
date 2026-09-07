#!/usr/bin/env node
// Does lib/database.types.ts still describe the LIVE database? (HYG-052)
//
// WHY THIS EXISTS. `lib/database.types.ts` is the code's picture of the schema — every typed read
// in the repo is checked against it, and `no-restricted-syntax` disables are justified by it. But
// nothing regenerated it, and nothing compared it to the database. So the file could drift from the
// thing it claims to describe, and every gate downstream would keep passing: they check that the
// CODE agrees with the FILE, never that the FILE agrees with the DATABASE.
//
// 🔴 IT HAD ALREADY DRIFTED when this was first run, 2026-09-07, which is the argument for the step
// rather than a hypothetical. Four real objects existed in the database and not in the committed
// file — `award_gems_atomic` had gained a second overload taking `_day_key` and `_timezone`,
// `claim_outbox_jobs` had gained a `dedupe_key` column, and `merge_profile_meta` and
// `remove_profile_meta_keys` had gained argument forms. Migrations had been applied and the types
// were never regenerated beside them.
//
// WHY THE SWEEP AND NOT ci.yml, the same reason as its two siblings: CI has no database
// credentials, so this could only ever pass vacuously there (ADR-970). It is also a finding no pull
// request causes — applying a migration is what moves it.
//
// READ-ONLY. It reports the drift and names the repair; it never writes the types file. Regenerating
// is a real change that has to be typechecked and reviewed like any other.
//
// Usage:
//   node scripts/maintenance/types-drift.mjs types.json [--types-file lib/database.types.ts]
//   node scripts/maintenance/types-drift.mjs --print-path      # the API path the workflow fetches
//
// Exit codes: 0 in step (drift is reported, not failed — see the header of maintenance.yml)
//             2 usage/read error · 79 indeterminate (the payload could not be read)

import { existsSync, readFileSync } from 'node:fs'

const TYPES_FILE = 'lib/database.types.ts'

/** The Management API path that returns the generated TypeScript for a project. */
export const TYPES_PATH = (ref) => `/v1/projects/${ref}/types/typescript`

/** Pull the generated source out of the API payload, whatever shape it arrived in.
 *  The endpoint returns `{ types: "..." }`; a bare string is accepted so a caller that already
 *  unwrapped it is not punished for it. */
export function readPayload(raw) {
  if (typeof raw === 'string' && !raw.trim().startsWith('{')) return raw
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const types = parsed?.types
  if (typeof types !== 'string' || !types.length) return null
  return types
}

/** Compare two generated-types sources by CONTENT, not by byte order.
 *
 *  ⚠️ ORDER IS NOT DRIFT, and treating it as drift is how this step would have become noise nobody
 *  reads. The generator emits tables and functions in an order that is stable per run but not
 *  guaranteed across versions of it: on the first real run `cron_run_markers` moved ~390 lines with
 *  no schema change behind it. Comparing sorted non-blank lines answers the question actually being
 *  asked — is there a database object the file does not describe, or vice versa — and ignores the
 *  question nobody asked. */
export function diffTypes(committed, live) {
  const lines = (s) =>
    s
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length)
  const tally = (arr) => {
    const m = new Map()
    for (const l of arr) m.set(l, (m.get(l) ?? 0) + 1)
    return m
  }
  const [a, b] = [tally(lines(committed)), tally(lines(live))]
  const onlyLive = []
  const onlyCommitted = []
  for (const [l, n] of b) {
    const d = n - (a.get(l) ?? 0)
    for (let i = 0; i < d; i++) onlyLive.push(l)
  }
  for (const [l, n] of a) {
    const d = n - (b.get(l) ?? 0)
    for (let i = 0; i < d; i++) onlyCommitted.push(l)
  }
  return { onlyLive, onlyCommitted, drifted: onlyLive.length > 0 || onlyCommitted.length > 0 }
}

/** Split a generated source into its named objects: `Tables.profiles`, `Functions.award_gems_atomic`.
 *
 *  A four-space key is a SECTION (Tables, Views, Functions, Enums) and a six-space key is an object
 *  inside it. The section is part of the key on purpose — a table and a function may share a name,
 *  and merging them would report drift in one as drift in the other. */
export function byObject(source) {
  const out = new Map()
  let section = null
  let key = null
  for (const raw of source.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim().length) continue
    const sec = line.match(/^ {4}([A-Za-z_][A-Za-z0-9_]*):/)
    if (sec) {
      section = sec[1]
      key = null
      continue
    }
    const obj = line.match(/^ {6}([A-Za-z_][A-Za-z0-9_]*):/)
    if (obj) key = `${section ?? '?'}.${obj[1]}`
    // ⚠️ A DEDENT ENDS THE OBJECT. Without this the LAST object in a section swallowed the
    // section's own closing braces (`    }`, `  }`, `}`), so adding a new table after it reported a
    // spurious change in the table above — a fixture caught exactly that. An object's own closing
    // brace sits at six spaces and is correctly kept; anything shallower belongs to the structure.
    else if (line.search(/\S/) < 6) key = null
    if (key) (out.get(key) ?? out.set(key, []).get(key)).push(line)
  }
  return out
}

/** Which named objects actually differ between the two sources.
 *
 *  🔴 THE FIRST DRAFT ATTRIBUTED ORPHAN LINES BY CONTENT and named all 600 objects in the file,
 *  because the orphans included lines like `}`, `Args: {` and `Returns: Json` that sit under
 *  hundreds of them. A report that names everything names nothing. Comparing object by object is
 *  what makes the output say "award_gems_atomic, claim_outbox_jobs" and stop. */
export function driftedObjects(committed, live) {
  const [a, b] = [byObject(committed), byObject(live)]
  const changed = []
  const onlyLive = []
  const onlyCommitted = []
  for (const [k, lines] of b) {
    if (!a.has(k)) onlyLive.push(k)
    else if (a.get(k).join('\n') !== lines.join('\n')) changed.push(k)
  }
  for (const k of a.keys()) if (!b.has(k)) onlyCommitted.push(k)
  return { changed: changed.sort(), onlyLive: onlyLive.sort(), onlyCommitted: onlyCommitted.sort() }
}

export function report({ committed, live }) {
  const d = diffTypes(committed, live)
  if (!d.drifted) return { code: 0, text: `✅ ${TYPES_FILE} matches the live schema.`, drifted: false }
  const o = driftedObjects(committed, live)
  const objects = [...o.onlyLive, ...o.onlyCommitted, ...o.changed]
  const name = (label, list) => (list.length ? [`  ${label}: ${list.join(', ')}`] : [])
  const lines = [
    `⚠️ ${TYPES_FILE} does not describe the live database.`,
    '',
    `  ${d.onlyLive.length} line(s) live-only · ${d.onlyCommitted.length} line(s) file-only`,
    ...name('in the DATABASE, missing from the file', o.onlyLive),
    ...name('in the FILE, missing from the database', o.onlyCommitted),
    ...name('described differently', o.changed),
    '',
    '  REPAIR: regenerate and commit it beside a typecheck —',
    '    supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" > lib/database.types.ts',
    '    pnpm exec tsc --noEmit',
    '  A regeneration is a real change: it can surface errors in code that leaned on the stale',
    '  picture, and those errors are the point rather than an obstacle.',
  ]
  return { code: 0, text: lines.join('\n'), drifted: true, objects }
}

function main(argv) {
  if (argv.includes('--print-path')) {
    console.log(TYPES_PATH(process.env.SUPABASE_PROJECT_REF ?? '$SUPABASE_PROJECT_REF'))
    return 0
  }
  const file = argv.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error('usage: types-drift.mjs <types.json> [--types-file <path>] | --print-path')
    return 2
  }
  const i = argv.indexOf('--types-file')
  const typesFile = i >= 0 ? argv[i + 1] : TYPES_FILE
  if (!existsSync(file) || !existsSync(typesFile)) {
    console.error(`types-drift: cannot read ${!existsSync(file) ? file : typesFile}`)
    return 79
  }
  const live = readPayload(readFileSync(file, 'utf8'))
  if (!live) {
    // 🔴 A payload that could not be read is INDETERMINATE, never "no drift". The whole point of
    // ADR-970 is that a check which cannot look must not report a verdict.
    console.error('types-drift: the payload carried no `types` string — cannot compare (79).')
    return 79
  }
  const r = report({ committed: readFileSync(typesFile, 'utf8'), live })
  console.log(r.text)
  return r.code
}

if (process.argv[1] && process.argv[1].endsWith('types-drift.mjs')) process.exit(main(process.argv.slice(2)))
