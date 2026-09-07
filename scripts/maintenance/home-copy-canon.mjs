// =============================================================================
// LIVE-148 — run the naming + voice canons against the PUBLISHED front-door copy.
//
// THE GAP THIS CLOSES. `/` renders a page-editor document out of `pages.published_data`,
// and by owner ruling of 2026-08-24 the coded template (lib/page-editor/templates/home.ts)
// is UNREACHABLE and must not be reconciled against it. That ruling is right — editing the
// home page in the editor is the authoring experience anyone would want — but it left the
// single most important piece of copy on the site in a database row that no test, no diff,
// no review and none of the CI gates can see. `check:canon` and `check:vocab` are
// filesystem scanners, so the front door was the one member-facing surface exempt from the
// canons, and every conclusion drawn about `/` by reading this repository was a conclusion
// about a fallback nobody renders.
//
// WHY IT LIVES HERE AND NOT IN ci.yml. ci.yml's own comment settles it: a check that needs
// deployment state belongs in the maintenance sweep, because a red build on something no
// pull request can fix is how a gate becomes something people route around (ADR-970, and
// the cron-freshness precedent). CI has no data plane. This reads production.
//
// 🔴 THE BLOCKER THIS ROW CARRIED FOR THREE DAYS WAS FALSE, which is worth recording
// because it is the cheapest kind of mistake to make. The row said the fix "needs a secret
// this repo does not have" — a data-plane key to read the `pages` table. It does not.
// maintenance.yml ALREADY POSTs arbitrary SQL to the Management API at
// /v1/projects/$REF/database/query with the existing SUPABASE_ACCESS_TOKEN, twice, and a
// 2026-08-31 run log prints a real result from it ("24 live rows against 24 code
// defaults"). The credential was there the whole time; only the reading of it was wrong.
//
// THE RULES ARE IMPORTED, NEVER RESTATED. `RULES` comes from scripts/check-canon.mjs, so
// there is exactly one home for the canon and this guard cannot drift from it. A copy of
// the regexes here would be a second source of truth, which is the failure the one-list
// discipline exists to prevent.
//
// AUDIENCE. Every rule applies. `/` is the front door: brand copy and member-facing copy at
// once, so the `member`-scoped rules (em dash, "cohort") are in scope here even though they
// are correctly relaxed on operator surfaces.
//
// ADVISORY, and deliberately so. It reports; it does not fail the sweep. An operator can
// publish at any moment and a maintenance run that goes red for a word choice would train
// everyone to ignore it. The finding lands in the step summary where a human reads it.
//
// USAGE
//   node scripts/maintenance/home-copy-canon.mjs --print-query   # emit the SQL
//   node scripts/maintenance/home-copy-canon.mjs home.json       # read the API result
// =============================================================================

import { readFileSync } from 'node:fs'
import { RULES } from '../check-canon.mjs'

/** The slug whose published document is the front door. */
export const SLUG = 'home'

/**
 * The published document lives in `pages.published_data` (jsonb). Exactly one row carries
 * slug='home' with a published document; the query is written to tolerate more than one
 * appearing later (a per-Space home) by returning them all, and the reporter names each.
 *
 * `published_data` is returned as text so the Management API's JSON envelope stays flat and
 * a large document cannot be reshaped by nested-jsonb encoding on the way out.
 */
export function query() {
  return [
    'select slug,',
    '       coalesce(published_data::text, %NULL%) as doc',
    '  from public.pages',
    ` where slug = '${SLUG}'`,
    '   and published_data is not null',
    ' order by slug;',
  ]
    .join('\n')
    .replace('%NULL%', "'null'")
}

/**
 * Pull every human-readable string out of a page-editor document.
 *
 * Deliberately structural rather than key-name-based: block props are open-ended, so an
 * allowlist of keys would silently stop covering a block type somebody adds later, and this
 * guard would then read as coverage while measuring less and less. Instead it walks
 * everything and filters by what a string LOOKS like.
 *
 * Excluded, with reasons:
 *   - anything under an `id`-ish key, which is machinery, not copy
 *   - values that are plainly not prose: urls, asset refs, hex colours, slugs, css-ish
 *     tokens, and bare identifiers with no whitespace
 * A string with a space and a letter is treated as copy. False positives here are cheap
 * (the report names the path, a human dismisses it); false negatives are the failure mode
 * this row exists to fix.
 */
export function proseStrings(node, path = '$', out = []) {
  if (typeof node === 'string') {
    if (isCopy(node, path)) out.push({ path, text: node })
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => proseStrings(v, `${path}[${i}]`, out))
    return out
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) proseStrings(v, `${path}.${k}`, out)
  }
  return out
}

const MACHINERY_KEY =
  /(^|\.)(id|_id|key|slug|type|href|url|src|icon|image|images|variant|align|focal|tone|size|width|density|layout|style|radius|token|assetRef|blockId|imgAspect|cardStyle|emphasis)$/i
const NOT_PROSE = [
  /^https?:\/\//i,
  // A path OR a file under one. The dot matters: an asset filename like
  // /images/site/22a51611-....jpg is a path with an extension, and a pattern that forbids
  // dots lets every uploaded image through as prose. The test caught exactly that.
  /^\/[\w\-./]*$/i,
  /^#[0-9a-f]{3,8}$/i, // a hex colour
  /^[a-z0-9_-]+$/i, // a bare identifier, no whitespace
  /^\d[\d\s.,%$-]*$/, // a bare number or figure
]

export function isCopy(value, path = '$') {
  const s = value.trim()
  if (s.length < 3) return false
  if (MACHINERY_KEY.test(path)) return false
  if (!/[a-z]/i.test(s)) return false
  if (NOT_PROSE.some((re) => re.test(s))) return false
  return true
}

/** Apply every canon rule to the extracted copy. Returns findings, newest rule order. */
export function findings(doc) {
  const strings = proseStrings(doc)
  const out = []
  for (const { path, text } of strings) {
    for (const rule of RULES) {
      if (rule.re.test(text)) {
        out.push({ rule: rule.name, hint: rule.hint, path, text: text.slice(0, 160) })
      }
    }
  }
  return { strings, out }
}

/**
 * Render the report. Exit code is ALWAYS 0 — see the advisory note in the header. The
 * caller records the code separately so a future decision to promote this to blocking is a
 * one-line change in the workflow rather than a rewrite here.
 */
export function report(rows) {
  const lines = []
  if (!rows.length) {
    lines.push('⚠️ No published `home` document found. Either nothing is published (the front door is')
    lines.push('   rendering its template fallback) or the query reached the wrong project. Both are')
    lines.push('   worth a look: this guard measuring an empty set would read as coverage.')
    return { text: lines.join('\n'), count: 0, scanned: 0 }
  }

  let scanned = 0
  let count = 0
  for (const row of rows) {
    let doc
    try {
      doc = JSON.parse(row.doc)
    } catch {
      lines.push(`🔴 \`${row.slug}\`: published_data did not parse as JSON.`)
      continue
    }
    const { strings, out } = findings(doc)
    scanned += strings.length
    count += out.length
    lines.push(`**\`${row.slug}\`** — ${strings.length} copy string(s) scanned, ${out.length} finding(s).`)
    if (out.length) {
      lines.push('')
      for (const f of out) {
        lines.push(`- **${f.rule}** — ${f.hint}`)
        lines.push(`  at \`${f.path}\`: "${f.text}"`)
      }
      lines.push('')
      lines.push('Fix these in the page editor at `/pages/home` and republish; the copy is not in this repo.')
    }
  }

  if (!count) {
    lines.push('')
    lines.push('✅ The published front-door copy satisfies the naming and voice canons.')
  }
  return { text: lines.join('\n'), count, scanned }
}

const argv = process.argv.slice(2)
if (argv[0] === '--print-query') {
  process.stdout.write(query())
} else if (argv[0]) {
  const raw = JSON.parse(readFileSync(argv[0], 'utf8'))
  // The Management API returns a bare array of rows; a failed statement returns an object
  // carrying `message`. Name that case rather than crashing on `.map` of undefined.
  if (!Array.isArray(raw)) {
    console.log(`🔴 The query did not return rows: ${raw?.message ?? JSON.stringify(raw).slice(0, 300)}`)
    process.exit(0)
  }
  const { text, count, scanned } = report(raw)
  console.log(text)
  console.log('')
  console.log(`(${scanned} string(s) scanned against ${RULES.length} canon rules, ${count} finding(s). Advisory.)`)
}
