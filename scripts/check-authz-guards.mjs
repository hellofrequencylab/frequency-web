#!/usr/bin/env node
// Authz-contract check (ADR-246 / ADR-275 · docs/ARCHITECTURE.md authorization model).
//
// The admin client (`createAdminClient`) authenticates with the service-role key and
// BYPASSES RLS — so anything that mutates through it is only as safe as the guard the
// author remembered to write. There is no full integration-test net here, so this is a
// coarse static one. It runs THREE scans:
//
//   1. ACTION scan (app/**) — in every `'use server'` file that uses the admin client, EVERY
//      exported action MUST itself establish the caller / check a capability / verify a signed
//      token. Per-export since HYG-020 (ADR-1135) — see "THE ACTION SCAN" below.
//   2. LIB scan (lib/**) — the confused-deputy / missing-gate class (A-PLUS finding B8,
//      ADR-274/ADR-275). A `lib/` MUTATION helper that writes through the admin client is
//      a deputy: an action authorizes a caller-supplied id, then the helper mutates. If
//      the helper neither self-guards NOR binds its write to an ownership/scope filter, a
//      confused-deputy IDOR is one careless caller away. Such a helper MUST either guard,
//      scope its write, or be CONSCIOUSLY marked as a caller-trusted internal helper.
//   3. ROUTE scan (app/**/route.ts|tsx) — every Route Handler MUST carry an explicit
//      authorization verdict. See "THE ROUTE SCAN" below for why this exists.
//
// ── THE ROUTE SCAN (LIVE-022) ───────────────────────────────────────────────────────────
// For its whole life this gate could not see a single Route Handler, and NOT because of a
// path glob: `walk('app')` has always descended into app/api and counted every route.ts in
// `appCount`. The blindness was a ROUTE-SHAPE assumption in the classifier. `isUnguarded-
// Action` opens with `if (!src.includes("'use server'")) return false` — and a Next Route
// Handler is not a `'use server'` module. It is a `route.ts|tsx` file exporting named HTTP
// methods (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS), per
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md. So all
// 72 route handlers — 55 of them under app/api, 15 of those reaching for the admin client —
// were READ, then dismissed on line one of the classifier. They were inside the walk and
// outside the check: the worst place to be, because the file count looked healthy.
//
// The route scan closes that. It uses the SAME idiom as the two scans above — a recognised
// gate token in the file, or a conscious, reasoned entry in a ledger — and adds nothing new
// in kind. Its ledger is scripts/authz-route-ledger.json, split out of this file only
// because a route's verdict needs a reason, a date and a digest, and a Map of strings has
// nowhere to put them.
//
// The digest is the part that matters. LIVE-022's complaint was not "these 15 routes are
// bad" — they were hand-audited clean on the day. It was "nothing catches a bad one
// tomorrow". Each ledger entry pins the normalised body of the route it vouches for, so
// tomorrow's edit to a route that is public BY ASSERTION fails this gate until a human
// re-reads it. Prose above the code does not trip it; the code does.
//
// ── WHAT THE ROUTE SCAN MEASURES, AND WHAT IT STILL CANNOT (LIVE-031) ───────────────────
// The route scan used to be FILE-level: `ROUTE_GATE.test(src)`. A gate token anywhere in the
// file earned the whole file a `gated` verdict — so a route exporting GET and POST with only
// GET gated read as green, and so did a route whose only "gate" was an incidental
// `auth.getUser()` three branches deep. LIVE-031 named that; this is the narrowing.
//
// A route now earns `gated` only if EVERY exported HTTP method passes THREE rules
// (`gateSoundness`, all of them structural — this is still not a prover):
//
//   R1 · PER-EXPORT   — each exported method (GET/POST/…) must reach a gate itself. The gate may
//        sit in a file-local helper the handler calls (app/u/scan/route.ts does exactly that) or
//        in the local `handler` a wrapper re-exports (`export const GET = withCronHeartbeat(…,
//        handler)`, 27 cron routes), so the analysis follows both, two levels deep.
//   R2 · DOMINANCE    — the gate must not sit inside an `if` / `else` / `switch` / `catch` branch.
//        A gate on one branch does not run on the others. Found two routes whose green came from
//        exactly that shape, and in BOTH the detected token was not the gate at all:
//        app/api/check-handle (a same-caller refinement inside `if (excludeUserId)`) and
//        app/auth/callback (an analytics read; the real credential check is exchangeCodeForSession).
//   R3 · PRECEDENCE   — no RLS-BYPASSING query before the gate: a `createAdminClient()` followed
//        by a `.from(` / `.rpc(` in the region above it. That is the "early return before the
//        gate" case with teeth. It is deliberately NOT "any return before the gate": ten of the
//        52 gated handlers return early (a 400 on a malformed body, a rate-limit 429, an empty
//        result for a blank query) and all ten are validation, so the blanket rule would have
//        been 100% noise — the ADR-970 shape where a gate nobody can keep green gets routed
//        around. What is dangerous is not returning early, it is answering from the service-role
//        client before you know who is asking.
//
// ── THE ACTION SCAN IS PER-EXPORT TOO (HYG-020, ADR-1135) ───────────────────────────────
// The action scan had the exact blindness LIVE-031 closed for routes: a `'use server'` file
// earned its verdict from a gate token ANYWHERE in the file, so an action module with five
// exports and one guard read green the way route handlers used to. Every export of a
// `'use server'` file is a public HTTP endpoint (Next builds an action endpoint per export),
// so the unit of verdict is the EXPORT, not the file.
//
// It REUSES the route scan's soundness model — `gateSoundness` with R1/R2/R3 unchanged —
// rather than growing a second one. Two things made the reuse honest instead of noisy:
//   • `bodyAfterParams` walks over a TS return-type annotation. The single largest source of
//     false positives (≈90 of the 112 a naive per-body scan reports) was helpers like
//     `requireMarketer(): Promise<{ id: string } | string>`: the old "first `{` after the
//     params" rule landed inside the TYPE, so the helper's body — and the gate in it — was
//     never read. Measured 2026-08-25: fixing this one boundary took the naive count from
//     112 to 23, all of them explained.
//   • ACTION_GATE adds the guard wrappers actions call that GUARD cannot see through
//     (`contactsOwnerId`), mirroring how ROUTE_GATE extends GUARD at the HTTP boundary.
// The escape is per-export: `// authz-ok: <reason>` in the comment block DIRECTLY ABOVE an
// export exempts that export only. An annotation not attached to any export keeps its
// historical file-level meaning (two files predate the per-export scan and use it that way).
// ADR-970 boundary respected: the shipped state carries THREE dispositions, not an allowlist
// of 118 — one real gate added (activeSeasonJourneys), two per-export annotations for the two
// genuinely cookie-/anonymity-gated exports (stopActingAsMember, stashPendingInduction).
//
// STILL NOT MEASURED, and it must be said rather than left for someone to assume:
//   • Whether the gate's RESULT is honoured. `const denied = rejectUnauthorizedCron(req)` with no
//     `if (denied) return denied` still reads as gated.
//   • A gate inside a callback (`rows.map(r => { … })`) counts as top-level. No route does this.
//   • A gate reached through an IMPORTED wrapper rather than a file-local one. The analysis fails
//     CLOSED there: an export whose body cannot be resolved is a violation, not a pass.
//   • Anything about the gate's own correctness — that is what lib/**'s own tests are for.
//
// Escape hatches keep it honest:
//   • ALLOWLIST_* below — files that are intentionally public (actions) or intentionally
//     caller-trusted internal/system helpers (lib). Each MUST carry a reason.
//   • An inline `// authz-ok: <reason>` comment. In the ACTION scan, one placed in the comment
//     block directly above an export exempts THAT EXPORT only; placed anywhere else it keeps
//     its historical file-level meaning. The lib scan is file-level as before.
//   • An inline `// authz-delegated: <reason>` comment (lib scan only) — "this helper
//     intentionally trusts its caller to authorize; the gate lives at the call site."
//   • scripts/authz-route-ledger.json (route scan) — a per-route verdict + reason + date.
// If you hit a false positive, prefer a real guard or a scoping filter; only annotate /
// allowlist a genuinely intentional case, WITH a reason. Run: `pnpm check:authz`.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = 'app'
const LIB_DIR = 'lib'
const API_DIR = 'app/api'
export const LEDGER_PATH = 'scripts/authz-route-ledger.json'

// Any token that establishes the caller, checks a role/capability/ownership, or verifies a
// signed token. Broad on purpose — the cost of a false negative (a missed real guard) is a
// noisy CI failure; the cost we actually care about is catching a mutation with NO check.
const GUARD = new RegExp(
  [
    'require(Admin|AdminFloor|LeadFloor|Janitor|StaffCap|Auth|Member|Host|Founder)',
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
    '(writer|approver)Gate', // lib/outbound/guard.ts — the two outbound capability gates (enforced via `if (!gate.ok) return`)
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
  // ⚠️ Every key here is a STANDING AMNESTY from the authz gate. See staleAllowlistEntries() below:
  // an entry whose file no longer exists fails this guard, because otherwise it lies in wait for
  // whoever next creates a file at that path.
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
])

// ── ROUTE SCAN vocabulary ───────────────────────────────────────────────────────────────
// A Route Handler establishes its caller differently from a server action, so the route scan
// recognises GUARD *plus* the gates that only ever appear at an HTTP boundary. Kept SEPARATE
// from GUARD on purpose: widening GUARD would also loosen the action and lib scans, and none
// of these tokens means anything there.
//
// Every entry is a call that FAILS CLOSED on its own. `rejectUnauthorizedCron` 401s a missing
// CRON_SECRET in production (lib/cron-auth.ts). `verify…Signature` / `webhooks.constructEvent`
// reject an absent or bad HMAC. `contactsOwnerId` / `connectionsOwnerId` wrap getCallerProfile
// and return null when signed out — GUARD already matches getCallerProfile, but a route calls
// the wrapper, and a file-level regex cannot see through one.
export const ROUTE_GATE = new RegExp(
  [
    GUARD.source,
    'rejectUnauthorizedCron',
    'verify\\w*Signature',
    'webhooks\\.constructEvent', // Stripe SDK signature verification
    '(contacts|connections)OwnerId',
  ].join('|'),
)

// ── ACTION SCAN vocabulary (HYG-020) ────────────────────────────────────────────────────
// GUARD *plus* the guard WRAPPERS server actions call whose gating body lives in lib/ — the
// same reason ROUTE_GATE extends GUARD: `contactsOwnerId` wraps getCallerProfile and returns
// null when signed out, but an action calls the wrapper, and neither a file-level regex nor
// the file-local helper resolution can see through an IMPORT. Kept separate from GUARD so the
// lib scan is not loosened. Every entry must FAIL CLOSED on its own.
export const ACTION_GATE = new RegExp([GUARD.source, 'contactsOwnerId'].join('|'))

/** Verdicts a ledger entry may claim. Anything else is a typo or an invented category, and
 *  an unrecognised verdict must FAIL rather than quietly count as coverage. */
/**
 * 🔴 AN ALLOWLIST ENTRY FOR A FILE THAT NO LONGER EXISTS IS A TRAP, NOT DEAD WEIGHT.
 *
 * `classifyActionFile` exempts a file with a bare `ALLOWLIST_ACTIONS.has(file)` and
 * `classifyLibMutation` does the same with `ALLOWLIST_LIB`. Neither asks whether the file is still
 * there. So a stale key sits dormant until somebody creates a file at that exact path — and then it
 * ships an ungated, RLS-bypassing server action with the gate printing green, because the amnesty
 * was granted years earlier to a different file.
 *
 * This is exactly what was found on 2026-09-01: `app/(marketing)/beta/actions.ts` was deleted with
 * the beta surfaces (#2317) and its allowlist line stayed. `app/(marketing)/` is precisely where a
 * new anonymous lead-capture action would be written next.
 *
 * The same class as the two dangling ledger pointers fixed the same day, with a sharper edge: those
 * misdirected a reader, this one would have silently exempted code.
 */
export function staleAllowlistEntries() {
  const stale = []
  for (const [name, map] of [
    ['ALLOWLIST_ACTIONS', ALLOWLIST_ACTIONS],
    ['ALLOWLIST_LIB', ALLOWLIST_LIB],
  ]) {
    for (const file of map.keys()) {
      if (!existsSync(file)) stale.push({ list: name, file })
    }
  }
  return stale
}

export const ROUTE_VERDICTS = new Set(['public', 'token-credential', 'model-gated', 'delegated', 'self-scoped'])

/** Is this file a Next Route Handler? `route.ts|tsx` is the file convention (Next 16); the
 *  route's own colocated tests are not handlers. */
export function isRouteFile(path) {
  return /(^|\/)route\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)
}

// ── PATH-LEVEL ROUTE ANALYSIS (LIVE-031) ────────────────────────────────────────────────
// Structural, not semantic: mask what is not code, find each exported handler's body, and ask
// where the gate sits inside it. See the R1/R2/R3 block in the header for what each rule buys
// and, more importantly, for what none of them can see.

/** The named exports Next 16 treats as HTTP handlers
 *  (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md). */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

/** Blocks a gate can sit inside that do NOT dominate the handler: the other branch skips it. */
const CONDITIONAL_BLOCKS = new Set(['if', 'else', 'switch', 'catch'])

/** Identifiers whose `.from(` is not a database read. `Array.from` in a pre-gate line must not
 *  read as a service-role query, or R3 becomes the boy who cried wolf. */
const NOT_A_QUERY_RECEIVER = new Set(['Array', 'Object', 'Buffer', 'Map', 'Set', 'Date', 'Number', 'String', 'Promise', 'JSON'])

/**
 * Blank out comments, regex literals, and the INSIDE of every string/template literal,
 * preserving offsets and line breaks. Everything below counts braces, so a `{` in a comment
 * or an HTML string (both routes that render a page have them) would otherwise shift every
 * body boundary.
 *
 * Two lexing realities learned from the corpus (HYG-020):
 *   • REGEX literals must be recognised, or a quote/backtick inside one (`/[#*_\`[\]]/g` in
 *     nearby/actions.ts) opens a phantom string that masks every export below it out of
 *     existence. Regex-vs-division is decided from the previous significant char, the way a
 *     lexer does.
 *   • Template INTERPOLATIONS must be lexed as code, or a nested template inside `${…}` (the
 *     HTML-email routes do this) ends the outer template at the NESTED backtick and spills
 *     markup into "code". The `${` and `}` delimiters are masked; the code between them is
 *     emitted verbatim (its braces are balanced, so offsets and brace counts stay true).
 */
export function maskLiterals(src) {
  let out = ''
  let i = 0
  const n = src.length

  const isRegexPosition = () => {
    let j = out.length - 1
    while (j >= 0 && /\s/.test(out[j])) j--
    if (j < 0) return true
    if ('(,=:[!&|?{};+-*%~^<>'.includes(out[j])) return true
    const prevWord = /([A-Za-z_$][\w$]*)$/.exec(out.slice(Math.max(0, j - 11), j + 1))?.[1] ?? ''
    return ['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'instanceof', 'new', 'do', 'else', 'yield', 'await'].includes(prevWord)
  }

  const template = () => {
    out += ' ' // opening backtick
    i++
    while (i < n) {
      if (src[i] === '\\') { out += '  '; i += 2; continue }
      if (src[i] === '`') { out += ' '; i++; return }
      if (src[i] === '$' && src[i + 1] === '{') {
        out += '  '
        i += 2
        code(true) // the interpolation is CODE (it can nest templates, strings, regexes)
        if (src[i] === '}') { out += ' '; i++ } // mask the delimiter so braces stay balanced
        continue
      }
      out += src[i] === '\n' ? '\n' : ' '
      i++
    }
  }

  const code = (stopAtUnnestedBrace) => {
    let depth = 0
    while (i < n) {
      const two = src.slice(i, i + 2)
      if (two === '//') {
        while (i < n && src[i] !== '\n') { out += ' '; i++ }
        continue
      }
      if (two === '/*') {
        while (i < n && src.slice(i, i + 2) !== '*/') { out += src[i] === '\n' ? '\n' : ' '; i++ }
        out += '  '
        i += 2
        continue
      }
      const c = src[i]
      if (c === '/' && isRegexPosition()) {
        out += ' '
        i++
        let inClass = false
        while (i < n) {
          if (src[i] === '\\') { out += '  '; i += 2; continue }
          if (src[i] === '[') inClass = true
          else if (src[i] === ']') inClass = false
          else if (src[i] === '/' && !inClass) { out += ' '; i++; break }
          out += src[i] === '\n' ? '\n' : ' '
          i++
        }
        while (i < n && /[a-z]/i.test(src[i])) { out += ' '; i++ } // flags
        continue
      }
      if (c === '"' || c === "'") {
        out += ' '
        i++
        while (i < n) {
          if (src[i] === '\\') { out += '  '; i += 2; continue }
          if (src[i] === c) { out += ' '; i++; break }
          out += src[i] === '\n' ? '\n' : ' '
          i++
        }
        continue
      }
      if (c === '`') { template(); continue }
      if (stopAtUnnestedBrace) {
        if (c === '{') depth++
        else if (c === '}') {
          if (depth === 0) return
          depth--
        }
      }
      out += c
      i++
    }
  }

  code(false)
  return out
}

/** Index of the delimiter matching the one at `openIdx`, or -1. */
function matchPair(masked, openIdx, open, close) {
  let depth = 0
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === open) depth++
    else if (masked[i] === close) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Given the `(` that opens a parameter list, the `[open, close]` braces of the body that
 *  follows it. Going through the parameter list matters: `GET(_req, { params })` destructures,
 *  and starting at the first `{` after the name lands inside the PARAMETERS. A TS return-type
 *  annotation between the `)` and the body can itself carry braces —
 *  `requireMarketer(): Promise<{ id: string } | string>` — and the old "first `{` after the
 *  params" rule landed inside the TYPE, so the body (and the gate in it) was never read. That
 *  one boundary was ≈90 of the 112 false positives a naive per-export action scan reports
 *  (HYG-020), so the annotation is walked over: balanced `<>`/`()`/`[]` groups are skipped, an
 *  object-literal TYPE `{` (one that follows `:` `|` `&` `<` `(` `,` or `=`) is skipped as a
 *  group, and the first `{` in any other position — after an identifier, `>`, `)`, `]`, `}` or
 *  an `=>` — is the body. */
function bodyAfterParams(masked, parenIdx) {
  if (parenIdx === -1) return null
  const closeParen = matchPair(masked, parenIdx, '(', ')')
  if (closeParen === -1) return null
  let i = closeParen + 1
  while (i < masked.length && /\s/.test(masked[i])) i++
  if (masked[i] === ':') {
    i++
    while (i < masked.length) {
      const c = masked[i]
      if (c === '{') {
        let j = i - 1
        while (j > closeParen && /\s/.test(masked[j])) j--
        if (masked.slice(j - 1, j + 1) === '=>') break // arrow body after a return type
        if (/[:|&<(,=]/.test(masked[j])) {
          const cl = matchPair(masked, i, '{', '}')
          if (cl === -1) return null
          i = cl + 1
          continue
        }
        break // the body
      }
      if (c === '<' || c === '(' || c === '[') {
        const cl = matchPair(masked, i, c, { '<': '>', '(': ')', '[': ']' }[c])
        if (cl === -1) return null
        i = cl + 1
        continue
      }
      if (c === '=' && masked[i + 1] === '>') { i += 2; continue }
      i++
    }
  }
  const open = masked.indexOf('{', Math.max(i, closeParen))
  if (open === -1) return null
  const close = matchPair(masked, open, '{', '}')
  if (close === -1) return null
  return [open, close]
}

/** The body range of a function DECLARED in this file under `name`, or null. */
export function localFunctionBody(masked, name) {
  const re = new RegExp(
    `(?:^|[^.\\w$])(?:async\\s+)?function\\s+${name}\\s*(?:<[^>(]*>)?\\s*\\(` +
      `|(?:const|let|var)\\s+${name}\\s*(?::[^=\\n]*)?=\\s*(?:async\\s*)?(?:<[^>(]*>)?\\s*\\(`,
    'm',
  )
  const m = re.exec(masked)
  if (!m) return null
  return bodyAfterParams(masked, masked.indexOf('(', m.index + m[0].length - 1))
}

/**
 * Every exported HTTP handler in the file, with the body to analyse.
 * `range: null` means the export exists but its body could not be resolved — fails CLOSED.
 * @returns {{method: string, kind: string, range: [number, number]|null, rhs?: string}[]}
 */
export function handlerExports(masked) {
  const found = []
  for (const method of HTTP_METHODS) {
    const fn = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`).exec(masked)
    if (fn) {
      found.push({ method, kind: 'function', range: bodyAfterParams(masked, masked.indexOf('(', fn.index)) })
      continue
    }
    const c = new RegExp(`export\\s+const\\s+${method}\\s*(?::[^=\\n]*)?=\\s*([^\\n]*)`).exec(masked)
    if (!c) continue
    const rhs = c[1]
    if (rhs.includes('=>')) {
      found.push({ method, kind: 'arrow', range: bodyAfterParams(masked, masked.indexOf('(', c.index + c[0].indexOf('='))) })
      continue
    }
    // `export const GET = withCronHeartbeat('x', handler)` — the handler is a local identifier on
    // the right-hand side. Resolve the first one that names a function declared in this file.
    let resolved = null
    for (const id of [...rhs.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1])) {
      const range = localFunctionBody(masked, id)
      if (range) { resolved = { id, range }; break }
    }
    found.push(
      resolved
        ? { method, kind: `wrapped:${resolved.id}`, range: resolved.range }
        : { method, kind: 'unresolved', range: null, rhs: rhs.trim().slice(0, 80) },
    )
  }
  return found
}

/**
 * Every exported function in a `'use server'` file, same shape as handlerExports but the names
 * are DISCOVERED rather than drawn from a fixed list — Next builds one public action endpoint
 * per export, so each is analysed on its own (HYG-020). `range: null` fails CLOSED, as above.
 * (`export default` and `export { … }` lists do not occur in the action corpus; a named default
 * function is still caught by the first pattern's optional `default`.)
 * @returns {{method: string, kind: string, range: [number, number]|null, rhs?: string}[]}
 */
export function actionExports(masked) {
  const found = []
  for (const m of masked.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    found.push({ method: m[1], kind: 'function', range: bodyAfterParams(masked, masked.indexOf('(', m.index + m[0].length - 1)) })
  }
  for (const m of masked.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*([^\n]*)/g)) {
    const method = m[1]
    const rhs = m[2]
    if (rhs.includes('=>')) {
      found.push({ method, kind: 'arrow', range: bodyAfterParams(masked, masked.indexOf('(', m.index + m[0].indexOf('='))) })
      continue
    }
    // `export const x = withSomething(fn)` — resolve a local function named on the RHS.
    let resolved = null
    for (const id of [...rhs.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((mm) => mm[1])) {
      const range = localFunctionBody(masked, id)
      if (range) { resolved = { id, range }; break }
    }
    found.push(
      resolved
        ? { method, kind: `wrapped:${resolved.id}`, range: resolved.range }
        : { method, kind: 'unresolved', range: null, rhs: rhs.trim().slice(0, 80) },
    )
  }
  return found
}

/** What kind of block the `{` at `braceIdx` opens (`if` / `try` / `callback` / …). */
function blockKind(masked, floor, braceIdx) {
  let j = braceIdx - 1
  while (j > floor && /\s/.test(masked[j])) j--
  if (masked[j] === ')') {
    let depth = 0
    for (; j >= floor; j--) {
      if (masked[j] === ')') depth++
      else if (masked[j] === '(') { depth--; if (depth === 0) break }
    }
    let k = j - 1
    while (k > floor && /\s/.test(masked[k])) k--
    const word = /([A-Za-z_$][\w$]*)$/.exec(masked.slice(Math.max(floor, k - 24), k + 1))?.[1] ?? ''
    if (['if', 'for', 'while', 'switch', 'catch'].includes(word)) return word
    return 'call'
  }
  const before = masked.slice(Math.max(floor, braceIdx - 12), braceIdx)
  if (/\belse\s*$/.test(before)) return 'else'
  if (/\btry\s*$/.test(before)) return 'try'
  if (/\bdo\s*$/.test(before)) return 'do'
  if (/=>\s*$/.test(before)) return 'callback'
  return 'block'
}

/** The chain of blocks enclosing `idx` inside the body that starts at `start`. */
export function enclosingBlocks(masked, start, idx) {
  const stack = []
  for (let i = start + 1; i < idx; i++) {
    if (masked[i] === '{') stack.push(blockKind(masked, start, i))
    else if (masked[i] === '}') stack.pop()
  }
  return stack
}

/** A pre-gate `return` that cannot carry data out: bare, `null`, `undefined`, `false`, an empty
 *  array, or a `fail(…)` denial. (Strings are already blanked, so `fail('why')` reads as
 *  `fail(    )`.) Anything else is treated as data-bearing — conservatively. */
const DENIAL_RETURN = /^(?:|null|undefined|false|fail\s*\(.*|\[\s*\])\s*$/

/** R3: an RLS-bypassing QUERY (admin client, then a `.from(`/`.rpc(`) in `masked[start, end)`.
 *  Creating the client proves nothing — several gated routes hold one for use after the gate.
 *
 *  Sharpened for HYG-020, still one rule for both scans: the danger R3 names is ANSWERING (or
 *  writing) through the service-role client before the caller is known. The corpus's
 *  lookup-then-gate shape — resolve a slug to an id with a `.select`, `if (!row) return null`,
 *  then gate on capabilities OF THAT ID — is structurally forced (the gate needs the id) and
 *  leaks nothing, and 16 real actions use it. So a pre-gate query fires only when it CAN escape:
 *    • the pre-gate region can MUTATE (`.rpc(` may write; so do .insert/.update/.delete/.upsert), or
 *    • some pre-gate `return` is not denial-shaped (see DENIAL_RETURN) — the early-answer case. */
export function adminQueryBefore(masked, start, end) {
  const region = masked.slice(start, end)
  const admin = /createAdminClient\s*\(/.exec(region)
  if (!admin) return null
  const after = region.slice(admin.index)
  let query = null
  for (const m of after.matchAll(/(?:([A-Za-z_$][\w$]*)\s*)?\.(from|rpc|insert|update|delete|upsert)\s*\(/g)) {
    if (m[1] && NOT_A_QUERY_RECEIVER.has(m[1])) continue
    if (m[2] !== 'from') return `.${m[2]}(` // can mutate — always a violation pre-gate
    query = query ?? `.${m[2]}(`
  }
  if (!query) return null
  for (const m of region.matchAll(/\breturn\b[ \t]*([^;\n]*)/g)) {
    if (!DENIAL_RETURN.test(m[1].trim())) return query
  }
  return null
}

/**
 * Where does this body's gate sit? Recurses into file-local helpers it calls (R1), then judges
 * position (R2) and precedence (R3).
 * @returns {{gate: string, problem: {kind: string, detail: string}|null}|null} null = no gate reached.
 */
function analyseBody(masked, range, depth, seen, gate = ROUTE_GATE) {
  const [start, end] = range
  const body = masked.slice(start, end + 1)
  const gm = new RegExp(gate.source).exec(body)
  if (gm) {
    const at = start + gm.index
    const blocks = enclosingBlocks(masked, start, at).filter((k) => CONDITIONAL_BLOCKS.has(k))
    if (blocks.length > 0) {
      return { gate: gm[0], problem: { kind: 'conditional-gate', detail: `${gm[0]} runs only inside \`${blocks.join(' > ')}\`` } }
    }
    const query = adminQueryBefore(masked, start, at)
    if (query) {
      return { gate: gm[0], problem: { kind: 'pre-gate-admin-query', detail: `service-role ${query} runs before ${gm[0]}` } }
    }
    return { gate: gm[0], problem: null }
  }
  if (depth === 0) return null
  // No gate in this body: follow the file-local functions it calls, in source order.
  for (const m of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1]
    if (seen.has(name) || HTTP_METHODS.includes(name)) continue
    seen.add(name)
    const helper = localFunctionBody(masked, name)
    if (!helper) continue
    if (helper[0] >= start && helper[1] <= end) continue // nested here; already covered textually
    const inner = analyseBody(masked, helper, depth - 1, seen, gate)
    if (!inner) continue
    if (inner.problem) return inner
    // The gate is real but it is the CALL that has to dominate this handler.
    const at = start + m.index
    const blocks = enclosingBlocks(masked, start, at).filter((k) => CONDITIONAL_BLOCKS.has(k))
    if (blocks.length > 0) {
      return { gate: inner.gate, problem: { kind: 'conditional-gate', detail: `${name}() (which gates with ${inner.gate}) runs only inside \`${blocks.join(' > ')}\`` } }
    }
    const query = adminQueryBefore(masked, start, at)
    if (query) {
      return { gate: inner.gate, problem: { kind: 'pre-gate-admin-query', detail: `service-role ${query} runs before ${name}() gates with ${inner.gate}` } }
    }
    return { gate: inner.gate, problem: null }
  }
  return null
}

/**
 * Does this file earn the `gated` verdict on EVERY path through EVERY exported method?
 * ONE soundness model for both scans (HYG-020): the route scan uses the defaults; the action
 * scan passes `{ gate: ACTION_GATE, listExports: actionExports, requireGateToken: false }` —
 * actions have no ledger to fall through to, so a file with no gate token at all must still
 * name each ungated export rather than exit early.
 * @returns {{gated: boolean, problems: {method: string, kind: string, detail: string}[]}}
 */
export function gateSoundness(src, opts = {}) {
  const { gate = ROUTE_GATE, listExports = handlerExports, requireGateToken = true } = opts
  const masked = maskLiterals(src)
  // No recognised gate token anywhere: not a gated route at all. Say so without walking the
  // file, so the 20 ledgered routes are unaffected by any of this.
  if (requireGateToken && !new RegExp(gate.source).test(masked)) return { gated: false, problems: [] }

  const exports = listExports(masked)
  if (exports.length === 0) {
    return { gated: false, problems: [{ method: '(file)', kind: 'no-handler-export', detail: 'no exported function could be found to analyse' }] }
  }
  const problems = []
  for (const e of exports) {
    if (!e.range) {
      problems.push({ method: e.method, kind: 'unresolved-export', detail: `body of \`export const ${e.method} = ${e.rhs}\` could not be resolved` })
      continue
    }
    const found = analyseBody(masked, e.range, 2, new Set(), gate)
    if (!found) problems.push({ method: e.method, kind: 'ungated-export', detail: 'reaches no gate of its own' })
    else if (found.problem) problems.push({ method: e.method, kind: found.problem.kind, detail: found.problem.detail })
  }
  return { gated: problems.length === 0, problems }
}

/** Strip comments and blank lines, so the digest tracks the CODE a verdict was given about.
 *  Rewriting the prose above a handler should not force a re-audit; changing what it does must. */
export function normalizeForDigest(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<![:/])\/\/.*$/gm, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

/** The value pinned in the ledger: sha256 of the normalized body, first 16 hex chars. */
export function routeDigest(src) {
  return createHash('sha256').update(normalizeForDigest(src)).digest('hex').slice(0, 16)
}

/** Read + validate the ledger. A malformed or missing ledger THROWS: this gate's whole job is
 *  to know the verdict of every route, and "I could not read the ledger" is not "everything is
 *  fine". Same reason MIN_APP_FILES exists. */
export function loadLedger(path = LEDGER_PATH) {
  if (!existsSync(path)) throw new Error(`Authz route ledger missing at ${path} — cannot verify any route verdict.`)
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Error(`Authz route ledger at ${path} is not valid JSON: ${e.message}`)
  }
  const entries = parsed?.entries
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    throw new Error(`Authz route ledger at ${path} has no \`entries\` object.`)
  }
  for (const [file, entry] of Object.entries(entries)) {
    // Keys are exact paths, never patterns: one line vouching for a whole directory is the
    // blanket-green failure of ADR-970. (`[token]` is a Next dynamic segment, not a wildcard —
    // the structural rule is "it must name one real route file", which isRouteFile enforces.)
    if (/[*?]/.test(file) || !isRouteFile(file)) {
      throw new Error(
        `Authz route ledger key "${file}" is not a single route-handler path. One exact route.ts|tsx path per line, no wildcards.`,
      )
    }
    if (!entry || typeof entry !== 'object') throw new Error(`Authz route ledger entry "${file}" is not an object.`)
    if (!ROUTE_VERDICTS.has(entry.verdict)) {
      throw new Error(
        `Authz route ledger entry "${file}" has verdict "${entry.verdict}" — expected one of ${[...ROUTE_VERDICTS].join(', ')}.`,
      )
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 40) {
      throw new Error(`Authz route ledger entry "${file}" needs a substantive \`reason\` (a sentence, not a label).`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.checked ?? '')) {
      throw new Error(`Authz route ledger entry "${file}" needs a \`checked\` date (YYYY-MM-DD).`)
    }
    if (!/^[0-9a-f]{16}$/.test(entry.digest ?? '')) {
      throw new Error(`Authz route ledger entry "${file}" needs a 16-hex \`digest\` of the route body.`)
    }
  }
  return entries
}

/**
 * Pure classifier for the ROUTE scan. Returns how this handler earned its verdict — or why
 * it has none. `problem` non-null is a violation.
 * @returns {{file: string, source: 'gate'|'ledger'|'none', verdict: string|null, problem: string|null, redundantLedgerEntry?: boolean}}
 */
export function classifyRoute(file, src, ledger) {
  const entry = ledger[file]
  const gate = gateSoundness(src)
  if (gate.gated) {
    // A real gate beats the ledger. If an entry also exists it is now redundant — reported as a
    // notice, never a failure: nobody should be punished for replacing an assertion with a guard.
    return { file, source: 'gate', verdict: 'gated', problem: null, redundantLedgerEntry: Boolean(entry) }
  }
  // A gate that does not run on every path is not coverage, but a HUMAN who read the route still
  // is — so an unsound gate falls through to the ledger rather than straight to a failure. That
  // ordering is the point: the verdict comes from the reading, and the digest pins the reading.
  if (entry) {
    if (entry.digest !== routeDigest(src)) {
      return { file, source: 'ledger', verdict: entry.verdict, problem: 'stale-digest' }
    }
    return { file, source: 'ledger', verdict: entry.verdict, problem: null }
  }
  if (gate.problems.length > 0) {
    return { file, source: 'none', verdict: null, problem: 'unsound-gate', gateProblems: gate.problems }
  }
  return { file, source: 'none', verdict: null, problem: 'no-verdict' }
}

/** Scan route handlers against the ledger. `read` is injectable so a fixture tree can be scanned. */
export function scanRoutes(files, ledger, read = (f) => readFileSync(f, 'utf8')) {
  const results = files.map((f) => classifyRoute(f, read(f), ledger))
  const present = new Set(files)
  // An entry whose route no longer exists is drift, and it is dangerous drift: a future route
  // created at the same path would inherit a verdict it never earned.
  const orphans = Object.keys(ledger).filter((f) => !present.has(f))
  return {
    results,
    violations: results.filter((r) => r.problem),
    orphans,
    notices: results.filter((r) => r.redundantLedgerEntry),
  }
}

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
 * Where do this file's `// authz-ok:` annotations point? One in the comment block DIRECTLY
 * ABOVE an export attaches to that export; one anywhere else (a file header, an import block)
 * keeps its historical file-level meaning. Runs on the RAW source — maskLiterals blanks
 * comments, which is exactly where annotations live.
 * @returns {{fileLevel: boolean, exports: Set<string>}}
 */
export function actionAnnotations(src) {
  const lines = src.split('\n')
  let fileLevel = false
  const perExport = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(ANNOTATION)) continue
    let j = i + 1
    while (j < lines.length) {
      const t = lines[j].trim()
      if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) { j++; continue }
      break
    }
    const m = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*))/.exec(lines[j] ?? '')
    if (m) perExport.add(m[1] ?? m[2])
    else fileLevel = true
  }
  return { fileLevel, exports: perExport }
}

/**
 * Pure classifier for the ACTION scan (per-export since HYG-020): in a `'use server'` file
 * that uses the admin client, every export must itself reach a gate, under the SAME R1/R2/R3
 * soundness rules as the route scan. A guard on a sibling export covers nothing — each export
 * is its own public HTTP endpoint.
 * @returns {{file: string, problems: {method: string, kind: string, detail: string}[]}|null} null = clean.
 */
export function classifyActionFile(file, src) {
  if (!src.includes("'use server'")) return null
  if (!src.includes('createAdminClient')) return null // only the RLS-bypassing path
  if (ALLOWLIST_ACTIONS.has(file)) return null
  const ann = actionAnnotations(src)
  if (ann.fileLevel) return null
  const { gated, problems } = gateSoundness(src, { gate: ACTION_GATE, listExports: actionExports, requireGateToken: false })
  if (gated) return null
  const remaining = problems.filter((p) => !ann.exports.has(p.method))
  return remaining.length > 0 ? { file, problems: remaining } : null
}

/** Scan `'use server'` admin-client files per-export. `read` is injectable for fixtures.
 *  @returns {{violations: {file: string, problems: {method: string, kind: string, detail: string}[]}[], fileCount: number, exportCount: number}} */
export function scanActions(files, read = (f) => readFileSync(f, 'utf8')) {
  const violations = []
  let fileCount = 0
  let exportCount = 0
  for (const file of files) {
    const src = read(file)
    if (!src.includes("'use server'") || !src.includes('createAdminClient')) continue
    fileCount++
    exportCount += actionExports(maskLiterals(src)).length
    const v = classifyActionFile(file, src)
    if (v) violations.push(v)
  }
  return { violations, fileCount, exportCount }
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
/** A gate that scans nothing reports a clean bill of health, and this one did it silently: on an
 *  empty tree it printed "✓ Authz-contract check passed" with NO COUNT AT ALL, because `walk()`
 *  returns [] for a missing root without complaint. The floors sit well under the live corpus
 *  (1151 app / 1061 lib on 2026-08-10) and far above zero, so they fire on a broken read rather
 *  than on growth. Same pattern as MIN_ROWS in check-gate-parity.mjs. */
export const MIN_APP_FILES = 500
export const MIN_LIB_FILES = 400

/** Route floors, same principle, one level down. MIN_ROUTE_FILES catches "route.ts stopped
 *  matching"; MIN_API_ROUTE_FILES exists specifically so app/api can never go invisible again
 *  WITHOUT the total moving — the exact failure mode of LIVE-022, where the app walk looked
 *  perfectly healthy at 1151 files while every API route was being dismissed. Live on
 *  2026-08-17: 72 handlers, 55 of them under app/api. */
export const MIN_ROUTE_FILES = 50
export const MIN_API_ROUTE_FILES = 40

/** Action-scan floors, same principle again (HYG-020). Live on 2026-08-25: 137 `'use server'`
 *  admin-client files carrying 699 exports. If either collapses, the scan stopped seeing the
 *  corpus — the LIVE-022 failure mode, one scan over. */
export const MIN_ACTION_FILES = 100
export const MIN_ACTION_EXPORTS = 400

export function runChecks() {
  const appFiles = walk(APP_DIR)
  const libFiles = walk(LIB_DIR)
  const routeFiles = appFiles.filter(isRouteFile)
  const apiRouteFiles = routeFiles.filter((f) => f.startsWith(API_DIR + '/'))
  const routes = scanRoutes(routeFiles, loadLedger())
  return {
    actions: scanActions(appFiles),
    libMutations: scanFiles(libFiles, isUnguardedLibMutation),
    appCount: appFiles.length,
    libCount: libFiles.length,
    routeCount: routeFiles.length,
    apiRouteCount: apiRouteFiles.length,
    routes,
  }
}

/** The route-scan failure text. Factored out so the non-vacuity test can assert on the EXACT
 *  words a developer will see, rather than on a boolean that happens to be true. */
export function formatRouteFailure(routes) {
  const lines = []
  const missing = routes.violations.filter((v) => v.problem === 'no-verdict')
  const stale = routes.violations.filter((v) => v.problem === 'stale-digest')
  const unsound = routes.violations.filter((v) => v.problem === 'unsound-gate')

  if (unsound.length > 0) {
    lines.push('\n✗ Authz-contract check failed — route handler(s) whose gate does NOT run on every path:\n')
    for (const v of unsound) {
      for (const p of v.gateProblems ?? []) lines.push(`  • ${v.file}  ${p.method}: ${p.detail}  [${p.kind}]`)
    }
    lines.push(
      '\nEach route above calls a recognised gate, so the FILE-level scan this gate used to be would\n' +
        'have passed it (LIVE-031). It does not run on every path through every exported method:\n' +
        '  • ungated-export       — that method reaches no gate at all. Gate it.\n' +
        '  • conditional-gate     — the gate sits on one branch; the others answer without it. Hoist it.\n' +
        '  • pre-gate-admin-query — the handler queries through the RLS-bypassing admin client BEFORE\n' +
        '                           it establishes the caller. Move the gate above the query.\n' +
        '  • unresolved-export /  — the analysis could not find the handler body. It fails CLOSED on\n' +
        '    no-handler-export      purpose: "I could not read it" is not "it is fine".\n' +
        'If the route is genuinely fine as written — the token found is not really its gate, or the\n' +
        'pre-gate read is public by design — that is a HUMAN reading, so record it in ' +
        LEDGER_PATH +
        '\nwith a verdict, a reason, a checked date and the digest from\n' +
        '`node scripts/check-authz-guards.mjs --print-digest <path>`. An entry there is pinned to the\n' +
        'body, so the next edit forces a re-read; an incidental gate token was pinned to nothing.\n',
    )
  }

  if (missing.length > 0) {
    lines.push('\n✗ Authz-contract check failed — route handler(s) with NO authorization verdict:\n')
    for (const v of missing) lines.push('  • ' + v.file)
    lines.push(
      '\nA Next Route Handler is a public HTTP endpoint. Each file above calls no recognised gate\n' +
        '(requireAdmin / assertOwner / getCallerProfile / auth.getUser / rejectUnauthorizedCron /\n' +
        'verify…Signature / webhooks.constructEvent) and has no entry in ' +
        LEDGER_PATH +
        '.\n' +
        'Fix by adding a real gate to the handler. If it is genuinely anonymous / token-credentialed /\n' +
        'model-gated by design, add a ledger entry with a verdict, a reason, a checked date, and the\n' +
        'digest from `node scripts/check-authz-guards.mjs --print-digest <path>`. See docs/ARCHITECTURE.md\n' +
        '(authz model) and ADR-274/ADR-275.\n',
    )
  }

  if (stale.length > 0) {
    lines.push('\n✗ Authz-contract check failed — ledgered route(s) whose CODE changed since the verdict:\n')
    for (const v of stale) lines.push(`  • ${v.file}  (verdict: ${v.verdict})`)
    lines.push(
      '\nThese routes have no gate of their own — they are safe only because a human read them and said\n' +
        'so. The body has changed since. Re-read the handler, confirm the verdict still holds, then run\n' +
        '`node scripts/check-authz-guards.mjs --print-digest <path>` and paste the new digest with a\n' +
        'fresh `checked` date in ' +
        LEDGER_PATH +
        '. Re-recording without re-reading is\n' +
        'the one thing that makes that ledger a lie.\n',
    )
  }

  if (routes.orphans.length > 0) {
    lines.push('\n✗ Authz-contract check failed — ' + LEDGER_PATH + ' vouches for route(s) that do not exist:\n')
    for (const f of routes.orphans) lines.push('  • ' + f)
    lines.push(
      '\nDelete the stale entries. A verdict left behind after its route is gone would be inherited by\n' +
        'whatever is created at that path next — coverage nobody ever earned.\n',
    )
  }

  return lines.join('\n')
}

function main() {
  // `--print-digest <path>` — the ONLY way to get a ledger digest, so the value pasted into the
  // ledger always comes from the same normalizer the gate compares against.
  const digestFlag = process.argv.indexOf('--print-digest')
  if (digestFlag !== -1) {
    const target = process.argv[digestFlag + 1]
    if (!target || !existsSync(target)) {
      console.error(`✗ --print-digest needs a path to an existing route file (got: ${target ?? '<nothing>'})`)
      process.exit(1)
    }
    console.log(routeDigest(readFileSync(target, 'utf8')))
    return
  }

  const { actions, libMutations, appCount, libCount, routeCount, apiRouteCount, routes } = runChecks()
  let failed = false

  if (routeCount < MIN_ROUTE_FILES || apiRouteCount < MIN_API_ROUTE_FILES) {
    console.error(
      `\n✗ Authz-contract check saw ${routeCount} route handler(s), ${apiRouteCount} of them under ${API_DIR}/, ` +
        `expected at least ${MIN_ROUTE_FILES} and ${MIN_API_ROUTE_FILES}.\n` +
        '  Route handlers went invisible to this gate once already (LIVE-022) while the app file count\n' +
        '  looked perfectly healthy. A run that finds almost no routes must fail, not pass quietly.\n',
    )
    process.exit(1)
  }

  if (appCount < MIN_APP_FILES || libCount < MIN_LIB_FILES) {
    console.error(
      `\n✗ Authz-contract check scanned ${appCount} ${APP_DIR}/ and ${libCount} ${LIB_DIR}/ file(s), ` +
        `expected at least ${MIN_APP_FILES} and ${MIN_LIB_FILES}.\n` +
        '  The roots moved or the walk is broken. This gate guards RLS-bypassing server actions, ' +
        'so\n  a run that reads almost nothing must fail rather than report a clean bill of health.\n',
    )
    process.exit(1)
  }

  if (actions.fileCount < MIN_ACTION_FILES || actions.exportCount < MIN_ACTION_EXPORTS) {
    console.error(
      `\n✗ Authz-contract check saw ${actions.fileCount} 'use server' admin-client file(s) carrying ` +
        `${actions.exportCount} export(s),\n  expected at least ${MIN_ACTION_FILES} and ${MIN_ACTION_EXPORTS}. ` +
        'The scan stopped seeing the action corpus — the LIVE-022\n  failure mode, one scan over. ' +
        'A run that reads almost nothing must fail, not pass quietly.\n',
    )
    process.exit(1)
  }

  if (actions.violations.length > 0) {
    failed = true
    console.error("\n✗ Authz-contract check failed — 'use server' admin-client action export(s) with no guard of their own:\n")
    for (const v of actions.violations) {
      for (const p of v.problems) console.error(`  • ${v.file}  ${p.method}: ${p.detail}  [${p.kind}]`)
    }
    console.error(
      "\nEach export above lives in a 'use server' module that uses createAdminClient() (bypasses\n" +
        'RLS), and the EXPORT reaches no caller / capability / token check of its own — a guard on a\n' +
        'sibling export covers nothing, because Next builds one public action endpoint per export\n' +
        '(HYG-020; the same per-export rule the route scan applies, LIVE-031). Fix by gating the\n' +
        'export (assertOwner, requireAdmin, getCallerProfile + own-row scope, verify…Token, a\n' +
        'file-local require* helper, …). If the export is genuinely public or gated by something\n' +
        'this scan cannot see, put `// authz-ok: <reason>` in the comment block DIRECTLY ABOVE that\n' +
        'export — it exempts only that export. A wholly-public file belongs in ALLOWLIST_ACTIONS\n' +
        'with a reason. See docs/ARCHITECTURE.md (authz model).\n',
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

  if (routes.violations.length > 0 || routes.orphans.length > 0) {
    failed = true
    console.error(formatRouteFailure(routes))
  }

  const stale = staleAllowlistEntries()
  if (stale.length) {
    failed = true
    console.error(
      '\n✗ Authz-contract check failed — allowlist entr(ies) naming a file that no longer exists:\n',
    )
    for (const e of stale) console.error(`  • ${e.list}: ${e.file}`)
    console.error(
      '\n  Each line above is a standing amnesty from this gate, waiting for someone to create a file\n' +
        '  at that path and inherit it. Delete the entry.\n',
    )
  }

  if (failed) process.exit(1)

  const gated = routes.results.filter((r) => r.source === 'gate').length
  const ledgered = routes.results.filter((r) => r.source === 'ledger')
  const byVerdict = {}
  for (const r of ledgered) byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1
  const breakdown = Object.entries(byVerdict)
    .sort()
    .map(([v, n]) => `${n} ${v}`)
    .join(', ')

  for (const n of routes.notices) {
    console.log(`  note: ${n.file} now calls a real gate — its ${LEDGER_PATH} entry is redundant and can be removed.`)
  }

  console.log(
    `✓ Authz-contract check passed across ${appCount} ${APP_DIR}/ + ${libCount} ${LIB_DIR}/ file(s) — ` +
      `all ${actions.exportCount} exports of the\n  ${actions.fileCount} admin-client 'use server' file(s) ` +
      'reach a gate of their own (R1/R2/R3, per export since\n  HYG-020), and every lib/ admin-client ' +
      'mutation helper self-guards, scopes its write, or is\n  consciously delegated.',
  )
  console.log(
    `✓ Route scan: ${routeCount} route handler(s) (${apiRouteCount} under ${API_DIR}/) all carry a verdict — ` +
      `${gated} gate EVERY\n  exported method on every branch (R1/R2/R3 in this file's header), ` +
      `${ledgered.length} are asserted in ${LEDGER_PATH}\n  (${breakdown}).\n` +
      `  Those ${ledgered.length} are HUMAN-ASSERTED, not verified: they are safe because someone read them, and ` +
      'their\n  digests are pinned so an edit forces a re-read.',
  )
}

// Only run the CLI when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
