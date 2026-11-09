#!/usr/bin/env node
// pnpm walkthrough:builder [log.json] (BLD-902): reads the observer's log of the five owner sessions and prints the
// verdict: who published without help, which controls were searched for in ⌘K by more than two owners, and which Layer 2
// controls three of five owners used (these move into Layer 1). Exit 1 until the log passes. The log shape is
// docs/builder-walkthrough/session.example.json; the default log is docs/builder-walkthrough/sessions.json.
import fs from 'node:fs'
import { readWalkthrough, walkthroughVerdict } from '../lib/builder/walkthrough.ts'

const file = process.argv[2] ?? 'docs/builder-walkthrough/sessions.json'
if (!fs.existsSync(file)) { console.error(`no walk-through log at ${file}: the five owner sessions have not been logged yet`); process.exit(1) }
const sessions = readWalkthrough(JSON.parse(fs.readFileSync(file, 'utf8')))
if (!sessions) { console.error(`${file} is not a list of sessions (see docs/builder-walkthrough/session.example.json)`); process.exit(1) }
const v = walkthroughVerdict(sessions)
console.log(`walk-through: ${v.sessions} session(s); ${v.passes ? 'PASSES' : 'does not pass yet'}`)
for (const m of v.missing) console.log(`  missing: ${m}`)
for (const p of v.promote) console.log(`  promote to Layer 1: ${p.id} (${p.owners.length} owners)`)
for (const s of sessions) for (const n of s.notes) console.log(`  [${s.owner}] ${n}`)
process.exit(v.passes ? 0 : 1)
