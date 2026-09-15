import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, type Dirent } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE CHECKOUT `metadata.kind` CONTRACT — the seam between the money CREATORS and the money
// RECORDERS, pinned so it cannot drift apart again.
//
// 🔴 WHY THIS FILE EXISTS. Every one of the six money loops is one Stripe Checkout Session away
// from a database row, and the ONLY thing carrying the buyer's intent across that boundary is a
// string: `metadata.kind`. The creator stamps it, the webhook's recorders match on it. Nothing in
// the type system connects the two ends — they are separate files, separate PRs, separate people —
// so the contract is exactly as strong as somebody remembering it.
//
// It has already failed once, in production, and the webhook still carries the scar tissue
// (app/api/webhooks/stripe/route.ts, the `checkout.session.completed` branch). The member
// entitlement guard used to be a DENYLIST: "grant a membership unless the kind is one of these
// three". A one-time Shop/Market checkout carried kind:'commerce_order', matched none of the three,
// fell through, and `setTier(buyer, 'crew', 'active')` granted a PAID MEMBERSHIP TIER permanently
// off an $8 purchase — with no subscription that could ever cancel it. And because membership_tier
// picks the payout take-rate rung, one shopper's purchase moved a SELLER'S rung too. The same hole
// swallowed the $4.99 Supporter contribution.
//
// The fix was to invert it into an ALLOWLIST: `s.mode === 'subscription' && !s.metadata?.kind`.
// That reads "grant only to the one creator that emits NO kind", which makes every future checkout
// kind excluded BY DEFAULT instead of needing to be remembered. That property is the whole point,
// and it rests on an invariant no compiler checks: EVERY OTHER CREATOR MUST EMIT A NON-EMPTY
// `kind`. A new creator that forgets one does not fail to build, does not fail a type check, and
// does not fail a unit test. It silently hands out paid memberships.
//
// So this file walks the SOURCE for `checkout.sessions.create` rather than reading a list, because
// a list is one more thing to remember and the incident was a memory failure. A creator added
// tomorrow is measured tomorrow, whether or not anyone thought of this file.
//
// WHAT IT PINS, and what breaks without each one:
//   1. Every creator except the single member-subscription creator emits a non-empty `kind`.
//      Without it: the 2026 hole re-opens and a purchase grants a paid tier.
//   2. Every emitted `kind` has a recorder guarding on that same literal, and every recorder kind
//      has a creator. Without it: money is taken and NOTHING records it (an orphan creator), or a
//      recorder guards a string nobody stamps and is dead code that reads as coverage.
//   3. Every `mode:'subscription'` creator also stamps `subscription_data.metadata` with the SAME
//      kind. Without it: `routeSpaceSubscription` fires on `customer.subscription.created/updated`,
//      which carries the SUBSCRIPTION's metadata and never the session's — so the subscription
//      arrives with no kind, no space_id, no tier_id, cannot be attributed, and a paying member
//      records nothing while their card is charged every month.
//   4. The member entitlement guard is still the positive allowlist, and the branch contains no
//      `kind !==` denylist test. Without it: see the whole first half of this comment.
//
// It is a SOURCE-SHAPE guard, in the spirit of scripts/check-studio.test.ts and
// lib/notifications/wired.test.ts: it reads the tree, it refuses to measure a tree it could not
// read (the non-triviality floor), and it carries planted-fixture negative controls proving each
// detector still fires. A guard that has never been seen to fail is not coverage.
//
// ⚠️ COMMENTS ARE STRIPPED BEFORE EVERY ASSERTION. A negative pin cannot live in the same text as
// the prohibition it enforces — the paragraphs above name `kind !==` and quote the old denylist,
// and a detector reading raw source would match its own explanation and pass (or fail) on prose.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const REPO = path.join(__dirname, '..', '..')
// `components/` is walked beside `app/` and `lib/`: a server action can live next to the form that
// calls it, and a creator this file never looks at is a creator this file cannot protect.
const SCAN_ROOTS = ['app', 'components', 'lib'] as const

/** The ONE creator allowed to emit no `kind`: the member Crew subscription, which the webhook's
 *  allowlist grants a membership tier to. If this ever needs a second entry, the allowlist in
 *  app/api/webhooks/stripe/route.ts cannot stay a one-creator test and must be re-derived first. */
const MEMBER_SUBSCRIPTION_CREATOR = 'lib/billing/checkout.ts'

/** The kinds whose ENTITLEMENT is written by `customer.subscription.*`, not by the checkout session
 *  (lib/billing/space-subscriptions.ts `subscriptionKind`). Named here because losing
 *  `subscription_data.metadata` on one of these is the silent-total-loss case: the money moves and
 *  the platform never learns whose it was. Assertion 3 covers every subscription-mode creator, so
 *  this list is the explicit floor beneath a generic rule, not the rule itself. */
const SUBSCRIPTION_ROUTED_KINDS = ['space_plan', 'space_membership'] as const

const WEBHOOK = 'app/api/webhooks/stripe/route.ts'

/** A `metadata.kind` tested against something, receiver included so a failure message names the
 *  whole expression rather than a bare `.kind !== 'x'` nobody can locate. */
const KIND_COMPARISON = /[\w$?.]*\.kind\s*(?:===|!==|==|!=)\s*[^\s)&|]+/g

// ── Source reading ───────────────────────────────────────────────────────────────────────────

/** Drop `/* … *\/` and `// …` so a comment that MENTIONS a kind is never counted as stamping or
 *  guarding one. See the ⚠️ note above: this file's own header would otherwise be a violation. */
export function stripComments(src: string): string {
  // BLANKED, not deleted: every comment becomes the same number of spaces (newlines kept), so file
  // offsets and line numbers still match the file on disk. A failure message that names
  // `lib/billing/tickets.ts:461` when the call is on 486 sends the reader to the wrong place, and a
  // guard nobody can follow to the defect is most of the way to a guard nobody keeps.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

/** Every non-test `.ts`/`.tsx` under `abs`, depth-first. `withFileTypes` so there is no
 *  stat-then-open race. Tests are excluded on purpose: a fake session in a test file stamps kinds
 *  that no creator emits and would drown the real contract in noise. */
function tsFilesUnder(abs: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    let entries: Dirent[]
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  walk(abs)
  return out
}

type SourceFile = { rel: string; code: string }

function corpus(root: string = REPO): SourceFile[] {
  const out: SourceFile[] = []
  for (const dir of SCAN_ROOTS) {
    for (const full of tsFilesUnder(path.join(root, dir))) {
      out.push({ rel: path.relative(root, full).split(path.sep).join('/'), code: stripComments(readFileSync(full, 'utf8')) })
    }
  }
  return out
}

// ── A very small literal-expression reader ───────────────────────────────────────────────────
// Enough to read an object literal's top-level keys and follow a `const` one hop. Deliberately NOT
// a parser: anything it cannot resolve is reported as UNRESOLVED and FAILS the test, rather than
// being skipped. Default-deny is the only safe posture for a detector guarding money.

/** Scan `src` from the opening bracket at `open`, returning the index of its match, or -1.
 *  String and template literals are skipped so a `'}'` inside a name cannot unbalance the scan. */
function matchBracket(src: string, open: number): number {
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
  const close = pairs[src[open]]
  if (!close) return -1
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i)
      continue
    }
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Index of the closing quote of the string starting at `i`. */
function skipString(src: string, i: number): number {
  const quote = src[i]
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') {
      j++
      continue
    }
    if (src[j] === quote) return j
  }
  return src.length
}

/** Split an object-literal BODY (braces already removed) into its top-level `key → value text`
 *  entries. Shorthand (`metadata,`) maps the key to itself; a spread is recorded under `...`. */
function topLevelEntries(body: string): Map<string, string> {
  const out = new Map<string, string>()
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(body, i)
      continue
    }
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue
    if (part.startsWith('...')) {
      out.set('...', `${out.get('...') ?? ''}\n${part}`)
      continue
    }
    const colon = indexOfTopLevel(part, ':')
    if (colon === -1) out.set(part.replace(/^\.\.\./, '').trim(), part)
    else out.set(part.slice(0, colon).trim().replace(/^['"]|['"]$/g, ''), part.slice(colon + 1).trim())
  }
  return out
}

/** Index of `ch` at bracket depth 0 in `text`, or -1. */
function indexOfTopLevel(text: string, ch: string): number {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(text, i)
      continue
    }
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth--
    else if (c === ch && depth === 0) return i
  }
  return -1
}

/**
 * The initializer text of `const <name> = …` in `src`, or null.
 *
 * The terminator is the first newline at bracket depth 0 whose NEXT non-empty line is indented no
 * further than the declaration itself. That handles both shapes this repo actually writes: a
 * multi-line object literal (which ends on its own dedented `}`) and a multi-line ternary
 * (lib/billing/space-plan-checkout.ts builds `subscriptionData` that way, so a rule that stopped at
 * the first depth-0 newline would read the type annotation and nothing else).
 */
function constInitializer(src: string, name: string): string | null {
  const decl = new RegExp(`(?:^|\\n)(\\s*)(?:const|let)\\s+${name}\\b`).exec(src)
  if (!decl) return null
  const indent = decl[1].replace(/\n/g, '').length
  const eq = indexOfTopLevelAssign(src, decl.index + decl[0].length)
  if (eq === -1) return null
  let depth = 0
  for (let i = eq + 1; i < src.length; i++) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i)
      continue
    }
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth--
    else if (c === '\n' && depth === 0) {
      const rest = src.slice(i + 1)
      const nextLine = /^[ \t]*\S.*$/m.exec(rest)
      if (!nextLine) return src.slice(eq + 1, i).trim()
      const nextIndent = (/^[ \t]*/.exec(nextLine[0]) as RegExpExecArray)[0].length
      if (nextIndent <= indent) return src.slice(eq + 1, i).trim()
    }
  }
  return src.slice(eq + 1).trim()
}

/** Index of the `=` that opens a declaration's initializer, skipping a `: Type` annotation. */
function indexOfTopLevelAssign(src: string, from: number): number {
  let depth = 0
  for (let i = from; i < src.length; i++) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i)
      continue
    }
    if (c === '{' || c === '(' || c === '[' || c === '<') depth++
    else if (c === '}' || c === ')' || c === ']' || c === '>') depth--
    else if (c === '=' && depth === 0 && src[i + 1] !== '=' && src[i - 1] !== '=' && src[i - 1] !== '!') return i
    else if (c === '\n' && depth < 0) return -1
  }
  return -1
}

/** Every top-level `{ … }` object literal inside `text` (a ternary yields two). */
function objectLiteralsIn(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(text, i)
      continue
    }
    if (c === '{') {
      const end = matchBracket(text, i)
      if (end === -1) break
      out.push(text.slice(i + 1, end))
      i = end
    }
  }
  return out
}

const IDENT = /^[A-Za-z_$][\w$]*$/

/** Repo-wide `export const NAME = 'literal'` map, so a creator stamping `kind: BUNDLE_KIND` is
 *  resolved to the string a recorder actually matches instead of being taken on trust. */
function exportedStringConstants(files: SourceFile[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const f of files) {
    for (const m of f.code.matchAll(/export const ([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*'([^']*)'/g)) {
      out.set(m[1], m[2])
    }
  }
  return out
}

type Resolution = { value: string } | { unresolved: string }

/** A string expression's literal value: `'ticket'`, a local `const`, or an imported constant. */
function resolveString(expr: string, src: string, consts: Map<string, string>): Resolution {
  const text = expr.trim().replace(/\s+as\s+const$/, '')
  const lit = /^'([^']*)'$/.exec(text) ?? /^"([^"]*)"$/.exec(text)
  if (lit) return { value: lit[1] }
  if (IDENT.test(text)) {
    const local = constInitializer(src, text)
    if (local) {
      const inner = /^'([^']*)'/.exec(local.replace(/\s+as\s+const$/, ''))
      if (inner) return { value: inner[1] }
    }
    const exported = consts.get(text)
    if (exported !== undefined) return { value: exported }
  }
  return { unresolved: text }
}

/** The `kind` a `metadata:` expression stamps. Follows one `const` hop and reads every object
 *  literal the expression can evaluate to, so a ternary must agree with itself. */
function kindOfMetadataExpr(expr: string, src: string, consts: Map<string, string>): Resolution | null {
  let text = expr.trim()
  if (IDENT.test(text)) {
    const init = constInitializer(src, text)
    if (!init) return { unresolved: `${text} (no declaration found)` }
    text = init
  }
  const objects = objectLiteralsIn(text)
  // No object literal anywhere in the expression — a helper call, a variable this file cannot
  // follow. That is UNRESOLVED, not "stamps no kind": the two look identical from here and only one
  // of them is safe, so the reader must be told it could not see rather than told what it saw.
  if (objects.length === 0) return { unresolved: `${expr.trim()} (no object literal to read)` }
  const kinds = new Set<string>()
  const unresolved: string[] = []
  for (const body of objects) {
    const entries = topLevelEntries(body)
    const kindExpr = entries.get('kind')
    if (kindExpr === undefined) {
      // A spread may carry it (`...identityMeta`). Follow one hop before giving up.
      const spread = entries.get('...')
      const inner = spread ? kindFromSpread(spread, src, consts) : null
      if (inner && 'value' in inner) {
        kinds.add(inner.value)
        continue
      }
      return null
    }
    const resolved = resolveString(kindExpr, src, consts)
    if ('value' in resolved) kinds.add(resolved.value)
    else unresolved.push(resolved.unresolved)
  }
  if (unresolved.length > 0) return { unresolved: unresolved.join(', ') }
  if (kinds.size !== 1) return { unresolved: `disagreeing kinds ${[...kinds].join(' / ')}` }
  return { value: [...kinds][0] }
}

function kindFromSpread(spread: string, src: string, consts: Map<string, string>): Resolution | null {
  for (const m of spread.matchAll(/\.\.\.\(?([A-Za-z_$][\w$]*)/g)) {
    const r = kindOfMetadataExpr(m[1], src, consts)
    if (r && 'value' in r) return r
  }
  return null
}

// ── The creators ─────────────────────────────────────────────────────────────────────────────

/** What `subscription_data` carries. `present` is "there IS a metadata key on the subscription",
 *  kept separate from its `kind` because the member subscription legitimately stamps metadata with
 *  no kind — collapsing the two would report the one compliant creator as the violation. */
type SubscriptionMetadata = { present: boolean; kind: Resolution | null }

export type Creator = {
  file: string
  line: number
  mode: Resolution | null
  kind: Resolution | null
  subscriptionMetadata: SubscriptionMetadata | null
  hasSubscriptionData: boolean
}

/** Every `checkout.sessions.create({ … })` in the tree, with what it stamps. The enumeration is
 *  the call site itself — never a list — so a creator added later is measured by default. */
export function creators(root: string = REPO): Creator[] {
  const files = corpus(root)
  const consts = exportedStringConstants(files)
  const out: Creator[] = []
  for (const { rel, code } of files) {
    if (!code.includes('checkout.sessions.create')) continue
    for (const m of code.matchAll(/checkout\.sessions\.create\s*\(/g)) {
      const open = m.index + m[0].length - 1
      const close = matchBracket(code, open)
      if (close === -1) continue
      const args = code.slice(open + 1, close).trim()
      const objStart = args.indexOf('{')
      const line = code.slice(0, m.index).split('\n').length
      if (objStart !== 0) {
        out.push({ file: rel, line, mode: { unresolved: 'argument is not an object literal' }, kind: null, subscriptionMetadata: null, hasSubscriptionData: false })
        continue
      }
      const body = args.slice(1, matchBracket(args, 0))
      const entries = topLevelEntries(body)
      const modeExpr = entries.get('mode')
      const metaExpr = entries.get('metadata')
      const subExpr = entries.get('subscription_data')
      out.push({
        file: rel,
        line,
        mode: modeExpr === undefined ? null : resolveString(modeExpr, code, consts),
        kind: metaExpr === undefined ? null : kindOfMetadataExpr(metaExpr, code, consts),
        hasSubscriptionData: subExpr !== undefined,
        subscriptionMetadata: subExpr === undefined ? null : readSubscriptionMetadata(subExpr, code, consts),
      })
    }
  }
  return out.sort((a, b) => `${a.file}:${a.line}`.localeCompare(`${b.file}:${b.line}`))
}

/** Whether `subscription_data` carries a `metadata` key and, if so, the kind it stamps. Follows the
 *  same one `const` hop, and reads EVERY object literal the expression can evaluate to — space-plan
 *  builds its `subscription_data` from a trial-days ternary, so both arms have to agree. */
function readSubscriptionMetadata(expr: string, src: string, consts: Map<string, string>): SubscriptionMetadata {
  let text = expr.trim()
  if (IDENT.test(text)) {
    const init = constInitializer(src, text)
    if (!init) return { present: false, kind: { unresolved: `${text} (no declaration found)` } }
    text = init
  }
  const objects = objectLiteralsIn(text)
  if (objects.length === 0) return { present: false, kind: { unresolved: 'subscription_data is not an object literal' } }
  const kinds = new Set<string>()
  let sawMetadata = false
  for (const body of objects) {
    const metaExpr = topLevelEntries(body).get('metadata')
    if (metaExpr === undefined) return { present: false, kind: null }
    sawMetadata = true
    const k = kindOfMetadataExpr(metaExpr, src, consts)
    if (k === null) continue // metadata present, but it stamps no kind (the member subscription)
    if ('unresolved' in k) return { present: true, kind: k }
    kinds.add(k.value)
  }
  if (kinds.size > 1) return { present: sawMetadata, kind: { unresolved: `disagreeing kinds ${[...kinds].join(' / ')}` } }
  return { present: sawMetadata, kind: kinds.size === 1 ? { value: [...kinds][0] } : null }
}

// ── The recorders ────────────────────────────────────────────────────────────────────────────

export type RecorderGuard = { file: string; kind: string }

/**
 * Every place the tree TESTS a `metadata.kind` against a literal — the recorder half of the
 * contract. Two shapes, because both are in the tree today:
 *   a) `session.metadata?.kind !== 'ticket'` / `metadata?.kind === BUNDLE_KIND` (direct)
 *   b) `const k = metadata?.kind` … `k === 'space_plan' || k === 'space_membership'` (aliased,
 *      lib/billing/space-subscriptions.ts and the invoice skip in lib/billing/checkout.ts)
 * Missing shape (b) would read the Space reconcilers as having no guard at all and report two live
 * kinds as orphans, so the alias hop is part of the detector, not a nicety.
 */
export function recorderGuards(root: string = REPO): RecorderGuard[] {
  const files = corpus(root)
  const consts = exportedStringConstants(files)
  const out: RecorderGuard[] = []
  for (const { rel, code } of files) {
    if (!/metadata\??\.kind/.test(code)) continue
    for (const m of code.matchAll(/metadata\??\.kind\s*(?:===|!==)\s*([A-Za-z_$][\w$]*|'[^']*')/g)) {
      const r = resolveString(m[1], code, consts)
      if ('value' in r) out.push({ file: rel, kind: r.value })
    }
    for (const decl of code.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*[^=;\n]*metadata\??\.kind\b/g)) {
      const alias = decl[1]
      for (const m of code.matchAll(new RegExp(`\\b${alias}\\s*(?:===|!==)\\s*([A-Za-z_$][\\w$]*|'[^']*')`, 'g'))) {
        const r = resolveString(m[1], code, consts)
        if ('value' in r) out.push({ file: rel, kind: r.value })
      }
    }
  }
  return out
}

// ── The webhook's member-entitlement branch ──────────────────────────────────────────────────

/** The `checkout.session.completed` branch of the webhook, comments stripped. */
export function completedBranch(root: string = REPO): string {
  const code = stripComments(readFileSync(path.join(root, WEBHOOK), 'utf8'))
  const start = code.indexOf("case 'checkout.session.completed'")
  if (start === -1) return ''
  const next = code.indexOf("case 'checkout.session", start + 10)
  return code.slice(start, next === -1 ? code.length : next)
}

/**
 * The condition of the OUTERMOST `if` that encloses the `setTier(` call in that branch, whitespace
 * normalised. This is THE line the incident turned inside out.
 *
 * Outermost, not nearest: the grant sits inside a second `if (profileId)`, and reading the nearest
 * `if` would pin a null-check while the guard that actually decides who gets a paid tier went
 * unmeasured. Deleting the outer guard is then caught too — the null-check becomes the outermost
 * one and the condition no longer matches.
 */
export function entitlementCondition(root: string = REPO): string | null {
  const branch = completedBranch(root)
  for (const m of branch.matchAll(/\bif\s*\(/g)) {
    const open = m.index + m[0].length - 1
    const close = matchBracket(branch, open)
    if (close === -1) continue
    const rest = branch.slice(close + 1)
    const brace = rest.indexOf('{')
    // `if (cond) await setTier(...)` (no block) counts as its own one-statement body.
    const body =
      brace !== -1 && rest.slice(0, brace).trim() === ''
        ? rest.slice(brace + 1, matchBracket(rest, brace))
        : rest.slice(0, rest.indexOf('\n') === -1 ? rest.length : rest.indexOf('\n'))
    if (!body.includes('setTier(')) continue
    return branch.slice(open + 1, close).replace(/\s+/g, ' ').trim()
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE LIVE TREE
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('checkout metadata.kind contract · the live tree', () => {
  it('refuses to measure a corpus it could not read (the non-triviality floor)', () => {
    // 🔴 The failure mode every scanning guard has: an empty walk means empty loops, empty
    // violations, and a green tick that measured nothing. check-studio.test.ts learned this by
    // watching its own guard pass against an absent tree. The floors below are set BENEATH today's
    // readings (9 creators / 8 kinds, 2026-09-15) so normal growth never trips them, but a walk
    // that silently found nothing cannot masquerade as a pass.
    const files = corpus()
    expect(files.length, 'the app/ + components/ + lib/ walk returned almost nothing').toBeGreaterThanOrEqual(2500)
    const found = creators()
    expect(found.length, 'no checkout.sessions.create call sites were found at all').toBeGreaterThanOrEqual(8)
    expect(new Set(recorderGuards().map((g) => g.kind)).size).toBeGreaterThanOrEqual(6)
    expect(completedBranch()).toContain('setTier(')
  })

  it('every creator resolves — an unreadable creator is a FAILURE, never a skip', () => {
    // Default-deny. If the reader above cannot work out what a call site stamps, that call site is
    // unmeasured, and an unmeasured creator is exactly the one that grants a free membership. The
    // fix is to make the creator legible (stamp a literal, or a `const` in the same file), not to
    // teach this file a new syntax.
    const bad = creators().filter(
      (c) =>
        (c.mode && 'unresolved' in c.mode) ||
        (c.kind && 'unresolved' in c.kind) ||
        (c.subscriptionMetadata?.kind && 'unresolved' in c.subscriptionMetadata.kind),
    )
    const report = bad
      .map((c) => `  • ${c.file}:${c.line} — could not resolve mode/kind/subscription_data metadata`)
      .join('\n')
    expect(bad, `\n${report}\n`).toEqual([])
  })

  it('every creator except the member subscription stamps a non-empty kind', () => {
    // ASSERTION 1. The allowlist in the webhook grants a membership tier to a subscription-mode
    // session with NO kind. A creator that forgets its kind is therefore not a missing label — it
    // is a free paid membership, and (through the take-rate ladder) a moved seller payout rung.
    const offenders = creators()
      .filter((c) => c.file !== MEMBER_SUBSCRIPTION_CREATOR)
      .filter((c) => !c.kind || !('value' in c.kind) || c.kind.value.trim() === '')
    const report = offenders
      .map(
        (c) =>
          `  • ${c.file}:${c.line} stamps no metadata.kind.\n` +
          `      A session with mode:'subscription' and no kind is granted a PAID MEMBERSHIP TIER by\n` +
          `      app/api/webhooks/stripe/route.ts. Stamp a kind and add a recorder that guards on it.`,
      )
      .join('\n')
    expect(offenders.map((c) => `${c.file}:${c.line}`), `\n${report}\n`).toEqual([])
  })

  it('exactly one creator stamps no kind, and it is the member subscription', () => {
    // The other half of assertion 1: the allowlist's premise. It says "there is exactly ONE creator
    // of a member entitlement". A SECOND kind-less creator would be granted a membership too, and
    // the guard's comment would be quietly false.
    const kindless = creators().filter((c) => !c.kind || !('value' in c.kind) || c.kind.value.trim() === '')
    expect(
      kindless.map((c) => c.file),
      '\nThe webhook grants a membership to any subscription-mode session with no metadata.kind.\n' +
        'That is safe only while exactly one creator emits none. Re-derive the guard before adding a second.\n',
    ).toEqual([MEMBER_SUBSCRIPTION_CREATOR])
  })

  it('no orphan kinds: every creator kind has a recorder, and every recorder kind has a creator', () => {
    // ASSERTION 2, and it fails BOTH ways on purpose.
    //  · A creator with no recorder is money taken and nothing written — the exact state the six
    //    money loops are in today (every table reads 0), so an orphan here is indistinguishable
    //    from the bug the owner is about to spend real money proving.
    //  · A recorder with no creator is a guard on a string nobody stamps: dead code that reads as
    //    coverage, which is the failure ADR-970 names.
    const emitted = new Set(
      creators()
        .map((c) => (c.kind && 'value' in c.kind ? c.kind.value : null))
        .filter((k): k is string => !!k),
    )
    const guards = recorderGuards()
    const guarded = new Set(guards.map((g) => g.kind))
    const unrecorded = [...emitted].filter((k) => !guarded.has(k)).sort()
    const unstamped = [...guarded].filter((k) => !emitted.has(k)).sort()
    expect(
      { unrecorded, unstamped },
      '\nunrecorded: a checkout stamps this kind and NO recorder matches on it — the buyer pays and\n' +
        'nothing is written. unstamped: a recorder guards on a kind no creator stamps — a dead branch\n' +
        'that reads as coverage. Fix the seam, never the expectation.\n',
    ).toEqual({ unrecorded: [], unstamped: [] })
  })

  it("every subscription-mode creator stamps subscription_data.metadata with the same kind", () => {
    // ASSERTION 3 — the silent-total-loss case, and the one with no user-visible symptom.
    // `routeSpaceSubscription` runs on `customer.subscription.created/updated`. That event carries
    // the SUBSCRIPTION's metadata; it has never carried the session's. Drop
    // `subscription_data.metadata` and the subscription arrives with no kind, no space_id, no
    // tier_id, no member_id — unattributable — while Stripe keeps charging the card every month.
    // Checkout still succeeds, the redirect still says thank you, and nothing anywhere errors.
    const subs = creators().filter((c) => c.mode && 'value' in c.mode && c.mode.value === 'subscription')
    const offenders = subs.filter((c) => {
      const sub = c.subscriptionMetadata
      if (!c.hasSubscriptionData || !sub?.present) return true
      // The member subscription stamps metadata with no kind on EITHER plane; that is the one
      // compliant shape with an absent kind, so the rule is that the two planes agree.
      const session = c.kind
      if (!session || !('value' in session)) return sub.kind !== null && 'value' in sub.kind
      return !sub.kind || !('value' in sub.kind) || sub.kind.value !== session.value
    })
    const report = offenders
      .map(
        (c) =>
          `  • ${c.file}:${c.line} — mode:'subscription' without matching subscription_data.metadata.\n` +
          `      customer.subscription.* carries the SUBSCRIPTION's metadata, never the session's.`,
      )
      .join('\n')
    expect(offenders.map((c) => `${c.file}:${c.line}`), `\n${report}\n`).toEqual([])
    expect(subs.length, 'no subscription-mode creators were found — the detector read nothing').toBeGreaterThanOrEqual(4)
  })

  it('both subscription-routed kinds are stamped on the subscription, not only the session', () => {
    // The named floor beneath the generic rule above: these two are reconciled ONLY by
    // customer.subscription.*, so for them the session metadata is decoration.
    const stamped = creators()
      .map((c) => c.subscriptionMetadata?.kind)
      .filter((k): k is { value: string } => !!k && 'value' in k)
      .map((k) => k.value)
      .filter((k) => SUBSCRIPTION_ROUTED_KINDS.includes(k as (typeof SUBSCRIPTION_ROUTED_KINDS)[number]))
    expect(
      [...new Set(stamped)].sort(),
      '\nlib/billing/space-subscriptions.ts routes on subscription metadata. A kind it reconciles that\n' +
        'is not stamped on subscription_data.metadata can never be attributed to a space or a member.\n',
    ).toEqual([...SUBSCRIPTION_ROUTED_KINDS].sort())
  })

  it('the member entitlement guard is still the positive allowlist, not a denylist', () => {
    // ASSERTION 4. Read the condition that guards `setTier(` and pin its SHAPE, not its prose.
    // Comments are stripped first, which matters here more than anywhere: the branch's own comment
    // quotes the old denylist it replaced, so an assertion over raw source would match the
    // explanation of the bug and call it the bug.
    expect(
      entitlementCondition(),
      '\nThe membership grant must name the ONE creator that qualifies, positively, so a new checkout\n' +
        'kind is excluded by DEFAULT. A condition that instead lists kinds to skip grants a paid tier\n' +
        'to every kind nobody remembered — which is precisely what a $8 shop order once did.\n',
    ).toBe("s.mode === 'subscription' && !s.metadata?.kind")
  })

  it('the completed branch tests no kind against a literal at all', () => {
    // The generalisation of the line above: routing by kind belongs in the recorders, each of which
    // no-ops on a session that is not its own. Any kind literal appearing in this branch means the
    // webhook has started keeping its own list of kinds again — the shape that has to be remembered,
    // and therefore the shape that gets forgotten.
    const branch = completedBranch()
    const comparisons = [...branch.matchAll(KIND_COMPARISON)].map((m) => m[0].trim())
    expect(
      comparisons,
      "\nThe checkout.session.completed branch compares metadata.kind against a literal. Route by kind\n" +
        'inside the recorder that owns it (each already no-ops on a session that is not its kind).\n',
    ).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE NEGATIVE CONTROLS — a detector that has never been seen to fire is not coverage.
//
// Each block plants ONE break into a synthetic tree written in the exact syntax the live creators
// and recorders use, and asserts the matching detector names it. The fixture also carries the
// shapes that must NOT fire (the kind-less member subscription, a kind resolved through an
// imported constant, a comment that merely mentions a kind), because a detector that fires on
// everything is as useless as one that fires on nothing.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const fixtures: string[] = []
afterAll(() => {
  for (const d of fixtures) rmSync(d, { recursive: true, force: true })
})

type Break = 'none' | 'kindless-creator' | 'orphan-creator' | 'orphan-recorder' | 'dropped-sub-metadata' | 'denylist'

function makeTree(planted: Break): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'checkout-kind-'))
  fixtures.push(dir)
  const write = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), text)
  }

  // The member subscription: the ONE creator that stamps no kind. Must never be reported.
  write(
    'lib/billing/checkout.ts',
    [
      "export async function createCheckoutSession() {",
      "  const session = await stripe.checkout.sessions.create({",
      "    mode: 'subscription',",
      '    metadata: { profile_id: id, tier: t },',
      '    subscription_data: { metadata: { profile_id: id, tier: t } },',
      '  })',
      '  return session.url',
      '}',
    ].join('\n'),
  )

  // A payment-mode creator whose kind comes from an imported constant, resolved through the
  // repo-wide export map. Must never be reported.
  write('lib/billing/seats.ts', "export const BUNDLE_KIND = 'household_bundle'\n")
  write(
    'lib/billing/tips.ts',
    [
      "const metadata = { kind: 'tip', from_profile_id: a }",
      'export async function startTip() {',
      '  return stripe.checkout.sessions.create({',
      "    mode: 'payment',",
      '    payment_intent_data: { metadata },',
      '    metadata,',
      '  })',
      '}',
      "export function recordTipFromSession(session: S) {",
      "  if (session.metadata?.kind !== 'tip') return",
      '}',
    ].join('\n'),
  )

  // A subscription-mode creator routed by customer.subscription.*, with the kind on BOTH planes,
  // plus its aliased recorder (`const k = metadata?.kind`) — the shape the live Space reconcilers
  // use, and the one a direct-comparison-only detector would miss.
  const subMeta = planted === 'dropped-sub-metadata' ? '{ trial_period_days: 14 }' : '{ metadata, trial_period_days: 14 }'
  write(
    'lib/billing/space-plan-checkout.ts',
    [
      "const metadata = { kind: 'space_plan', space_id: s }",
      'export async function startPlan() {',
      '  return stripe.checkout.sessions.create({',
      "    mode: 'subscription',",
      '    metadata,',
      `    subscription_data: ${subMeta},`,
      '  })',
      '}',
    ].join('\n'),
  )
  write(
    'lib/billing/space-subscriptions.ts',
    [
      'export function subscriptionKind(metadata: M) {',
      '  const k = metadata?.kind',
      "  return k === 'space_plan' ? k : null",
      '}',
    ].join('\n'),
  )

  // A comment naming a kind is not a guard: proves stripComments runs before the detectors.
  write('lib/billing/notes.ts', "// session.metadata?.kind !== 'never_stamped_anywhere' is the shape to copy\nexport const NOTE = 1\n")

  if (planted === 'kindless-creator') {
    write(
      'lib/billing/rogue.ts',
      [
        'export async function startRogue() {',
        '  return stripe.checkout.sessions.create({',
        "    mode: 'subscription',",
        '    metadata: { profile_id: id },',
        '    subscription_data: { metadata: { profile_id: id } },',
        '  })',
        '}',
      ].join('\n'),
    )
  }
  if (planted === 'orphan-creator') {
    write(
      'lib/billing/rogue.ts',
      [
        'export async function startRogue() {',
        '  return stripe.checkout.sessions.create({',
        "    mode: 'payment',",
        "    metadata: { kind: 'retreat_deposit', profile_id: id },",
        '  })',
        '}',
      ].join('\n'),
    )
  }
  if (planted === 'orphan-recorder') {
    write('lib/billing/rogue.ts', "export function recordRogue(session: S) {\n  if (session.metadata?.kind !== 'retreat_deposit') return\n}\n")
  }

  const guard =
    planted === 'denylist'
      ? "if (s.metadata?.kind !== 'space_plan' && s.metadata?.kind !== 'household_bundle') {"
      : "if (s.mode === 'subscription' && !s.metadata?.kind) {"
  write(
    'app/api/webhooks/stripe/route.ts',
    [
      'export async function POST(req: Request) {',
      '  switch (event.type) {',
      "    case 'checkout.session.completed': {",
      '      const s = event.data.object as Stripe.Checkout.Session',
      `      ${guard}`,
      '        await setTier(profileId, tier, customerId, "active", event.created)',
      '      }',
      '      await recordPaidCheckout(s)',
      '      break',
      '    }',
      "    case 'checkout.session.expired': break",
      '  }',
      '}',
    ].join('\n'),
  )
  return dir
}

const kindsOf = (root: string) =>
  new Set(
    creators(root)
      .map((c) => (c.kind && 'value' in c.kind ? c.kind.value : null))
      .filter((k): k is string => !!k),
  )

describe('checkout metadata.kind contract · the detectors fire (negative controls)', () => {
  it('the clean fixture passes every assertion (so a failure below is the plant, not the fixture)', () => {
    const root = makeTree('none')
    const found = creators(root)
    expect(found.map((c) => c.file).sort()).toEqual([
      'lib/billing/checkout.ts',
      'lib/billing/space-plan-checkout.ts',
      'lib/billing/tips.ts',
    ])
    // Exactly one kind-less creator, and it is the member subscription.
    expect(found.filter((c) => !c.kind || !('value' in c.kind)).map((c) => c.file)).toEqual(['lib/billing/checkout.ts'])
    expect([...kindsOf(root)].sort()).toEqual(['space_plan', 'tip'])
    // The commented kind in notes.ts is NOT read as a guard — stripComments is doing its job.
    expect([...new Set(recorderGuards(root).map((g) => g.kind))].sort()).toEqual(['space_plan', 'tip'])
    expect(entitlementCondition(root)).toBe("s.mode === 'subscription' && !s.metadata?.kind")
    const subs = creators(root).filter((c) => c.mode && 'value' in c.mode && c.mode.value === 'subscription')
    expect(subs.every((c) => c.hasSubscriptionData)).toBe(true)
  })

  it('names a SECOND kind-less creator (the free-membership hole)', () => {
    const root = makeTree('kindless-creator')
    const kindless = creators(root).filter((c) => !c.kind || !('value' in c.kind)).map((c) => c.file)
    expect(kindless.sort()).toEqual(['lib/billing/checkout.ts', 'lib/billing/rogue.ts'])
  })

  it('names a creator whose kind no recorder guards on (money taken, nothing written)', () => {
    const root = makeTree('orphan-creator')
    const guarded = new Set(recorderGuards(root).map((g) => g.kind))
    expect([...kindsOf(root)].filter((k) => !guarded.has(k))).toEqual(['retreat_deposit'])
  })

  it('names a recorder guarding a kind nobody stamps (a dead branch reading as coverage)', () => {
    const root = makeTree('orphan-recorder')
    const emitted = kindsOf(root)
    expect([...new Set(recorderGuards(root).map((g) => g.kind))].filter((k) => !emitted.has(k))).toEqual(['retreat_deposit'])
  })

  it('names a subscription creator that dropped subscription_data.metadata', () => {
    const root = makeTree('dropped-sub-metadata')
    const offenders = creators(root)
      .filter((c) => c.mode && 'value' in c.mode && c.mode.value === 'subscription')
      .filter((c) => !c.hasSubscriptionData || !c.subscriptionMetadata?.present)
      .map((c) => c.file)
    expect(offenders).toEqual(['lib/billing/space-plan-checkout.ts'])
  })

  it('names the entitlement guard when it is rewritten as a denylist', () => {
    const root = makeTree('denylist')
    expect(entitlementCondition(root)).not.toBe("s.mode === 'subscription' && !s.metadata?.kind")
    expect([...completedBranch(root).matchAll(KIND_COMPARISON)].map((m) => m[0].trim())).toEqual([
      "s.metadata?.kind !== 'space_plan'",
      "s.metadata?.kind !== 'household_bundle'",
    ])
  })
})
