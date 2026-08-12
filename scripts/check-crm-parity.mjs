#!/usr/bin/env node
// CRM / comms parity drift guard (ADR-817, docs/CRM-COMMS-CONTRACT.md).
//
// The unified ticketed comms suite (ADR-812) is delivered on THREE surfaces that must stay identical:
//   • the platform Resonance CRM  — app/(main)/admin/crm/conversations/actions.ts
//   • every per-Space tenant CRM  — app/(main)/spaces/[slug]/crm/conversations-actions.ts
//   • the leader inbox            — app/(main)/lead/inbox/actions.ts
//
// "Standardized so an edit applies to both the main CRM and every tenant Space" is only true while each
// surface CALLS the ONE shared implementation rather than re-inlining its own copy. This guard makes that
// mechanical: it fails the build (like check:menu for the admin menu) if a surface stops importing a
// shared primitive, or if the shared logic gets copy-pasted back into a surface. Mirrors the MENU-CONTRACT
// posture — the shared module is the single source of truth; the surfaces are thin, gated adapters.
//
// Exit code: NON-ZERO on any violation (a surface that dropped a shared import, or a re-inlined copy).
// Usage: `node scripts/check-crm-parity.mjs` (or `pnpm check:crm-parity`).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── The three conversation reply/AI surfaces that must stay in lock-step. Adding a NEW CRM surface means
// adding it here (and wiring it to the shared modules) — that is the contract. ──
const SURFACES = [
  'app/(main)/admin/crm/conversations/actions.ts',
  'app/(main)/spaces/[slug]/crm/conversations-actions.ts',
  'app/(main)/lead/inbox/actions.ts',
]

// ── The shared modules every surface must route through (the single source of truth for each concern). A
// surface must import each named symbol from its module, or it has forked its own copy. ──
const SHARED_IMPORTS = [
  { module: '@/lib/comms/vera-conversation', symbols: ['veraDraftReply', 'veraSummarize', 'veraSuggestTriage'], concern: 'Vera AI (draft / summarize / triage)' },
  { module: '@/lib/comms/email-template', symbols: ['renderReplyEmail'], concern: 'branded email body (header/footer)' },
  // anyOf: a surface signs as a PERSON (resolveSignature, the per-sender editable signature) or as the
  // BRAND (brandSignature, e.g. a Space reply whose From is the brand) — either way the signature comes
  // from the ONE shared module; importing neither is the fork this guard exists to catch.
  { module: '@/lib/comms/signature', symbols: ['resolveSignature', 'brandSignature'], anyOf: true, concern: 'shared signature (per-sender or brand)' },
  { module: '@/lib/comms/outbound-batch', symbols: ['queueOutboundMessage'], concern: 'batched outbound send' },
  // New-outreach compose (ADR-821): the two operator consoles that can START a conversation must open
  // it through the ONE shared primitive. The leader inbox is reply-only, so it is exempt (`surfaces`).
  {
    module: '@/lib/comms/conversation-compose', symbols: ['startConversationMessage'],
    concern: 'new-outreach compose (open conversation + first outbound)',
    surfaces: ['app/(main)/admin/crm/conversations/actions.ts', 'app/(main)/spaces/[slug]/crm/conversations-actions.ts'],
  },
]

// ── Logic that must live in EXACTLY ONE file (re-inlining it elsewhere = drift). Each sentinel is a stable
// substring of the shared implementation; `owner` is the only file allowed to contain it. ──
const SINGLE_SOURCE = [
  { sentinel: 'You draft a reply to a member on behalf of a Frequency team member', owner: 'lib/comms/vera-conversation.ts', what: 'Vera draft prompt' },
  { sentinel: 'You summarize a support/CRM conversation', owner: 'lib/comms/vera-conversation.ts', what: 'Vera summary prompt' },
  { sentinel: "You classify a conversation's priority", owner: 'lib/comms/vera-conversation.ts', what: 'Vera triage prompt' },
  { sentinel: 'sentinel:conversation-compose-pipeline', owner: 'lib/comms/conversation-compose.ts', what: 'conversation-compose pipeline (ADR-821)' },
]

const SEARCH_DIRS = ['app', 'lib', 'components']
const CODE_EXT = ['.ts', '.tsx']

const read = (p) => { try { return readFileSync(join(ROOT, p), 'utf8') } catch { return null } }

/** Every code file under the search dirs (skips build/vendor dirs). */
function walkCodeFiles() {
  const out = []
  const walk = (abs) => {
    let entries
    try { entries = readdirSync(abs) } catch { return }
    for (const e of entries) {
      if (e === 'node_modules' || e === '.next' || e === '.git' || e === 'dist') continue
      const p = join(abs, e)
      let s
      try { s = statSync(p) } catch { continue }
      if (s.isDirectory()) walk(p)
      else if (CODE_EXT.some((x) => e.endsWith(x))) out.push(p)
    }
  }
  for (const d of SEARCH_DIRS) walk(join(ROOT, d))
  return out
}

/** Does `src` import ALL of `symbols` from `module` (or ANY, when `anyOf`)? (tolerant of multi-line
 *  import blocks). */
function importsAll(src, module, symbols, anyOf = false) {
  // Grab every `import { ... } from '<module>'` block (single or multi-line) and union their symbols.
  const re = new RegExp(`import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]${module.replace(/[/\-]/g, (m) => '\\' + m)}['"]`, 'gs')
  const imported = new Set()
  let m
  while ((m = re.exec(src)) !== null) {
    for (const raw of m[1].split(',')) {
      const name = raw.replace(/\s+as\s+\w+/, '').replace(/\btype\b/, '').trim()
      if (name) imported.add(name)
    }
  }
  return anyOf ? symbols.some((s) => imported.has(s)) : symbols.every((s) => imported.has(s))
}

/** Run every check. Returns { violations: string[] } — pure, so a test can assert on it. */
export function checkCrmParity() {
  const violations = []

  // 1) Each surface routes through every shared module.
  for (const surface of SURFACES) {
    const src = read(surface)
    if (src == null) {
      violations.push(`Surface not found (did a path change? update SURFACES): ${surface}`)
      continue
    }
    for (const { module, symbols, anyOf, concern, surfaces } of SHARED_IMPORTS) {
      if (surfaces && !surfaces.includes(surface)) continue // concern scoped to specific surfaces
      if (!importsAll(src, module, symbols, anyOf)) {
        violations.push(
          `${surface}\n    ↳ must import ${anyOf ? 'one of' : ''} { ${symbols.join(', ')} } from '${module}' (${concern}).\n` +
          `      A CRM surface that doesn't is re-implementing shared logic — route it through the shared module instead.`,
        )
      }
    }
  }

  // 2) Single-source logic isn't re-inlined anywhere else.
  const files = walkCodeFiles()
  for (const { sentinel, owner, what } of SINGLE_SOURCE) {
    const hits = files.filter((abs) => (readFileSync(abs, 'utf8')).includes(sentinel)).map((abs) => relative(ROOT, abs).replace(/\\/g, '/'))
    const ownerHit = hits.includes(owner)
    const strays = hits.filter((h) => h !== owner)
    if (!ownerHit) {
      violations.push(`${what}: expected in the shared module ${owner}, but not found there (did the prompt text change? update SINGLE_SOURCE).`)
    }
    if (strays.length) {
      violations.push(
        `${what}: found OUTSIDE the shared module (${owner}) — this is drift:\n` +
        strays.map((h) => `      • ${h}`).join('\n') +
        `\n      Delete the copy and call the shared function so an edit applies to every CRM surface at once.`,
      )
    }
  }

  return { violations }
}

// ── CLI ──
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])
if (isMain || process.argv[1]?.endsWith('check-crm-parity.mjs')) {
  const { violations } = checkCrmParity()
  console.log('CRM / comms parity guard (ADR-817)\n')

  // ── NON-TRIVIALITY FLOOR ──────────────────────────────────────────────────────────────────
  // 🔴 Without this, running from a tree where the surfaces do not exist printed
  // "✓ all N CRM surfaces route through the shared comms modules" and exited 0. Measured
  // 2026-08-12 by running this script with cwd set to an EMPTY DIRECTORY: it reported a clean
  // bill of health over nothing at all. A guard that cannot fail is not a guard, and this one
  // could not, because "no surface read" and "every surface correct" produced the same output.
  const missing = SURFACES.filter((s) => !existsSync(join(ROOT, s)))
  if (SURFACES.length === 0 || missing.length > 0) {
    console.error(
      `\n✗ check:crm-parity — refusing to pass over a corpus it could not read.\n` +
        `    surfaces declared: ${SURFACES.length}\n` +
        `    surfaces missing:  ${missing.length}\n` +
        `  Either a surface moved and this guard's list is stale, or it is running from the wrong\n` +
        `  directory. Both are real problems; neither is a pass.\n`,
    )
    process.exit(1)
  }

  if (violations.length === 0) {
    console.log(`  ✓ all ${SURFACES.length} CRM surfaces route through the shared comms modules; no re-inlined logic.`)
    console.log('  ✓ Vera + branded send + signature + batching are single-source — an edit applies site-wide.')
    process.exit(0)
  }
  console.log(`  ✗ ${violations.length} parity violation(s):\n`)
  for (const v of violations) console.log(`  ✗ ${v}\n`)
  console.log('See docs/CRM-COMMS-CONTRACT.md for how the surfaces must compose the shared comms modules.')
  process.exit(1)
}
