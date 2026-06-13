#!/usr/bin/env node
// Authz-contract check (ADR-246 · docs/ARCHITECTURE.md authorization model).
//
// The admin client (`createAdminClient`) authenticates with the service-role key and
// BYPASSES RLS — so a server action that mutates through it is only as safe as the guard
// the author remembered to write. There is no test framework yet, so this is the net:
// every `'use server'` file that uses the admin client MUST also establish the caller /
// check a capability / verify a signed token.
//
// This is a coarse FILE-level heuristic, not a prover. Two escape hatches keep it honest:
//   1. ALLOWLIST below — files that are intentionally public (e.g. lead capture).
//   2. An inline `// authz-ok: <reason>` comment anywhere in the file.
// If you hit a false positive, prefer adding a real guard; if the action is truly public,
// allowlist it WITH a reason or annotate it. Run: `node scripts/check-authz-guards.mjs`.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const APP_DIR = 'app'

// Any token that establishes the caller, checks a role/capability/ownership, or verifies a
// signed token. Broad on purpose — the cost of a false negative (a missed real guard) is a
// noisy CI failure; the cost we actually care about is catching an action with NO check.
const GUARD = new RegExp(
  [
    'require(Admin|AdminFloor|Janitor|StaffCap|Auth|Member|Host|Founder)',
    'assert(Own\\w*|Founder)', // assertOwner, assertOwnPath, …
    'authorize[A-Z]\\w*',
    'get(Caller|My)Profile(Id)?\\b',
    'getCachedUser',
    'get\\w*Capabilities',
    'getJanitor',
    'getStaffMember',
    'getMyWebRole',
    'surfaceAccess',
    'verify\\w*Token',
    'auth\\.getUser',
  ].join('|'),
)

// Intentionally PUBLIC server actions (no caller — anonymous visitors use them). Each MUST
// carry a reason. Keep this list short; prefer a guard or an inline `// authz-ok:` note.
const ALLOWLIST = new Map([
  ['app/(marketing)/beta/actions.ts', 'public double-opt-in beta lead capture (anonymous)'],
  ['app/(marketing)/start/actions.ts', 'public marketing lead-flow capture (anonymous)'],
])

const ANNOTATION = '// authz-ok:'

/** Recursively collect .ts/.tsx files under a dir. */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(entry.name)) out.push(p)
  }
  return out
}

const violations = []
for (const file of walk(APP_DIR)) {
  const src = readFileSync(file, 'utf8')
  if (!src.includes("'use server'")) continue
  if (!src.includes('createAdminClient')) continue // only the RLS-bypassing path
  if (GUARD.test(src)) continue
  if (src.includes(ANNOTATION)) continue
  if (ALLOWLIST.has(file)) continue
  violations.push(file)
}

if (violations.length > 0) {
  console.error('\n✗ Authz-contract check failed — admin-client server action(s) with no guard:\n')
  for (const v of violations) console.error('  • ' + v)
  console.error(
    '\nEach file above uses createAdminClient() (bypasses RLS) in a \'use server\' module but\n' +
      'establishes no caller / capability / token check. Fix by adding a guard (assertOwner,\n' +
      'requireAdmin, getCallerProfile + own-row scope, verify…Token, …). If the action is\n' +
      'genuinely public, add `// authz-ok: <reason>` to the file or allowlist it in\n' +
      'scripts/check-authz-guards.mjs with a reason. See docs/ARCHITECTURE.md (authz model).\n',
  )
  process.exit(1)
}

console.log('✓ Authz-contract check passed — every admin-client server action has a guard.')
