#!/usr/bin/env node
// Authz-contract check (ADR-246 / ADR-275 · docs/ARCHITECTURE.md authorization model).
//
// The admin client (`createAdminClient`) authenticates with the service-role key and
// BYPASSES RLS — so anything that mutates through it is only as safe as the guard the
// author remembered to write. There is no full integration-test net here, so this is a
// coarse static one. It runs TWO scans:
//
//   1. ACTION scan (app/**) — every `'use server'` file that uses the admin client MUST
//      also establish the caller / check a capability / verify a signed token.
//   2. LIB scan (lib/**) — the confused-deputy / missing-gate class (A-PLUS finding B8,
//      ADR-274/ADR-275). A `lib/` MUTATION helper that writes through the admin client is
//      a deputy: an action authorizes a caller-supplied id, then the helper mutates. If
//      the helper neither self-guards NOR binds its write to an ownership/scope filter, a
//      confused-deputy IDOR is one careless caller away. Such a helper MUST either guard,
//      scope its write, or be CONSCIOUSLY marked as a caller-trusted internal helper.
//
// This is a coarse FILE-level heuristic, not a prover. Escape hatches keep it honest:
//   • ALLOWLIST_* below — files that are intentionally public (actions) or intentionally
//     caller-trusted internal/system helpers (lib). Each MUST carry a reason.
//   • An inline `// authz-ok: <reason>` comment anywhere in the file (both scans).
//   • An inline `// authz-delegated: <reason>` comment (lib scan only) — "this helper
//     intentionally trusts its caller to authorize; the gate lives at the call site."
// If you hit a false positive, prefer a real guard or a scoping filter; only annotate /
// allowlist a genuinely intentional case, WITH a reason. Run: `pnpm check:authz`.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = 'app'
const LIB_DIR = 'lib'

// Any token that establishes the caller, checks a role/capability/ownership, or verifies a
// signed token. Broad on purpose — the cost of a false negative (a missed real guard) is a
// noisy CI failure; the cost we actually care about is catching a mutation with NO check.
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
    '(writer|approver)Gate', // lib/beta/guard.ts — the Beta capability gates (enforced via `if (!gate.ok) return`)
  ].join('|'),
)

// A write through the query builder. `.rpc(` is included: a Postgres function can mutate
// (e.g. reset_season), and a read-only RPC helper is expected to carry an `// authz-delegated:`
// note or sit on the lib allowlist. insert/update/delete/upsert are unambiguous writes.
const MUTATION = /\.(insert|update|delete|upsert)\(|\.rpc\(/

// A filter that BINDS a write to a row/scope/ownership column. Its PRESENCE is what tells the
// confused-deputy scan that the helper isn't issuing a bare unscoped write — it is the static
// proxy for "the mutation is bound to a scope" (e.g. .eq('event_id', …) / .match({ owner_id })).
const SCOPING_FILTER = /\.(eq|match|in|filter|contains|overlaps|or)\(/

const ANNOTATION = '// authz-ok:'
const DELEGATED = '// authz-delegated:'

// Intentionally PUBLIC server actions (no caller — anonymous visitors use them). Each MUST
// carry a reason. Keep this list short; prefer a guard or an inline `// authz-ok:` note.
const ALLOWLIST_ACTIONS = new Map([
  ['app/(marketing)/beta/actions.ts', 'public double-opt-in beta lead capture (anonymous)'],
  ['app/(marketing)/start/actions.ts', 'public marketing lead-flow capture (anonymous)'],
])

// Intentionally caller-trusted / system-level `lib/` mutation helpers (the gate lives at the
// call site, or the helper is a platform-wide cron/ledger/audit write with no per-caller scope
// by design). Each MUST carry a reason. Prefer an inline `// authz-delegated:` note in the file
// itself for new cases; this map captures the helpers that predate the scan. Audited 2026-06-20.
const ALLOWLIST_LIB = new Map([
  ['lib/admin/audit.ts', 'append-only platform audit log; gated at every call site, writes are system records'],
  ['lib/finance/record.ts', 'entity-ledger front door; exactly-once on idempotency_key, written on the authoritative money event'],
  ['lib/engagement/events.ts', 'engagement-ledger front door; exactly-once on idempotency_key, system write'],
  ['lib/rewards/spark.ts', 'system bonus payout on the reward hot path; capped by a unique reward_grants constraint'],
  ['lib/traits/refresh.ts', 'nightly trait-refresh cron; processes every member, no per-caller scope by design'],
  ['lib/consent/retention.ts', 'nightly retention-purge cron; platform-wide GDPR sweep, no per-caller scope by design'],
  ['lib/nurture/enroll.ts', 'fire-safe system enroll from anonymous lead capture; idempotent on (sequence_id, contact_id)'],
  ['lib/events/dispatch.ts', 'event-dispatch composer; the host authorization lives in the calling action (caller-trusted)'],
  ['lib/analytics/marketing-intel.ts', 'read-only mkt_* RPC layer (no write); admin-gated at the page'],
  ['lib/profile-zaps.ts', 'read-only profile_zap_total RPC (a sum() aggregate, no write); behind app-code authz'],
])

/** Recursively collect .ts/.tsx files under a dir (skips test files and node_modules). */
function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p)
  }
  return out
}

/**
 * Pure classifier for the ACTION scan: is this `'use server'` admin-client file un-guarded?
 * @returns {boolean} true if the file is a violation.
 */
export function isUnguardedAction(file, src) {
  if (!src.includes("'use server'")) return false
  if (!src.includes('createAdminClient')) return false // only the RLS-bypassing path
  if (GUARD.test(src)) return false
  if (src.includes(ANNOTATION)) return false
  if (ALLOWLIST_ACTIONS.has(file)) return false
  return true
}

/**
 * Pure classifier for the LIB scan: is this a `lib/` mutation helper that writes through the
 * admin client with NO guard, NO scoping filter, and NO conscious delegation marker?
 * This is the confused-deputy / missing-gate class (B8).
 * @returns {boolean} true if the file is a violation.
 */
export function isUnguardedLibMutation(file, src) {
  if (!src.includes('createAdminClient')) return false // only the RLS-bypassing path
  if (!MUTATION.test(src)) return false // only mutation helpers, not pure readers
  if (GUARD.test(src)) return false // self-guards
  if (SCOPING_FILTER.test(src)) return false // binds its write to a scope/ownership column
  if (src.includes(ANNOTATION)) return false
  if (src.includes(DELEGATED)) return false // consciously caller-trusted
  if (ALLOWLIST_LIB.has(file)) return false
  return true
}

/** Scan a list of files with a classifier, returning the violating paths. */
export function scanFiles(files, classify) {
  const violations = []
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    if (classify(file, src)) violations.push(file)
  }
  return violations
}

/** Run both scans against the real tree. Returns { actions, libMutations }. */
export function runChecks() {
  return {
    actions: scanFiles(walk(APP_DIR), isUnguardedAction),
    libMutations: scanFiles(walk(LIB_DIR), isUnguardedLibMutation),
  }
}

function main() {
  const { actions, libMutations } = runChecks()
  let failed = false

  if (actions.length > 0) {
    failed = true
    console.error('\n✗ Authz-contract check failed — admin-client server action(s) with no guard:\n')
    for (const v of actions) console.error('  • ' + v)
    console.error(
      '\nEach file above uses createAdminClient() (bypasses RLS) in a \'use server\' module but\n' +
        'establishes no caller / capability / token check. Fix by adding a guard (assertOwner,\n' +
        'requireAdmin, getCallerProfile + own-row scope, verify…Token, …). If the action is\n' +
        'genuinely public, add `// authz-ok: <reason>` to the file or allowlist it in\n' +
        'scripts/check-authz-guards.mjs with a reason. See docs/ARCHITECTURE.md (authz model).\n',
    )
  }

  if (libMutations.length > 0) {
    failed = true
    console.error('\n✗ Authz-contract check failed — lib/ admin-client mutation helper(s) with no gate (confused-deputy class, B8):\n')
    for (const v of libMutations) console.error('  • ' + v)
    console.error(
      '\nEach file above MUTATES through createAdminClient() (bypasses RLS) inside lib/ but neither\n' +
        'self-guards (requireAdmin / assertOwner / getCallerProfile + own-row scope / verify…Token)\n' +
        'NOR binds its write to a scope/ownership column (.eq(\'space_id\'|\'event_id\'|\'owner_id\', …),\n' +
        '.match({ … })). That is the confused-deputy shape (ADR-274): a caller-trusted deputy issuing\n' +
        'an unscoped privileged write. Fix by scoping the write to the resource owner, or — if the\n' +
        'helper INTENTIONALLY trusts its caller (the gate lives at the call site) or is a platform-wide\n' +
        'cron/ledger/audit write — add `// authz-delegated: <reason>` to the file or allowlist it in\n' +
        'scripts/check-authz-guards.mjs with a reason. See docs/DECISIONS.md ADR-274/ADR-275.\n',
    )
  }

  if (failed) process.exit(1)
  console.log(
    '✓ Authz-contract check passed — every admin-client server action has a guard, and every\n' +
      '  lib/ admin-client mutation helper self-guards, scopes its write, or is consciously delegated.',
  )
}

// Only run the CLI when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
