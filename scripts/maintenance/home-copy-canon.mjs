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
// TWO ARMS SINCE 2026-09-15 (LIVE-252, ADR-1358). The canon arm asks whether the copy is on
// voice. The MODEL arm (`MODEL_CLAIMS` / `modelGaps` below) asks whether it still says what
// Frequency IS, because the first arm scored a clean zero on a front door that mentioned neither
// a Space nor a price. Both report; neither fails.
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

// ── THE MODEL ARM (LIVE-252, ADR-1358) ───────────────────────────────────────────────────────
//
// The canon rules above answer "is this copy ON VOICE?". They cannot answer the other question,
// which is the one the front door exists to answer: "does it say what Frequency IS?". On
// 2026-09-15 the published document scored ZERO canon findings while never once mentioning a
// Space or a price, so the whole commercial model was absent from the site's front door and every
// rule was green. 20270345004600 put the model in the document; this arm is what notices if it
// leaves again — an editor session, a republish from the template, or a well-meant trim.
//
// WHY IT IS A CLAIM LIST AND NOT A STRING MATCH. Each entry names the CONSEQUENCE (a reader can
// learn this fact from the front door) and matches it loosely enough that an operator may rewrite
// the sentence. A claim that demanded one exact sentence would turn an advisory reading into a
// copy freeze, which is the opposite of the editor's point.
//
// The source of the claims is docs/CORE-MODEL.md §1 (ADR-1294). "Placement is earned, never sold"
// is deliberately NOT here: PROG-R10 is open, so the front door does not yet make that promise and
// a gate asking for it would report a gap the product cannot honestly close.
export const MODEL_CLAIMS = [
  {
    name: 'people join free',
    re: /\b(people join free|joining is free|free forever)\b/i,
    why: 'CORE-MODEL §1 line one. A visitor must not have to reach /pricing to learn that being here costs nothing.',
  },
  {
    name: 'businesses host free',
    re: /\b(businesses host free|hosting on it is free|opening (a|one) Space is free|open a Space that stays free)\b/i,
    why: 'CORE-MODEL §1 line two, and the only line addressed to the reader who brings other people with them.',
  },
  {
    name: 'you pay when you start charging',
    re: /\byou pay when you (start charging|charge)\b/i,
    why: 'CORE-MODEL §1 line three. Without it the two free lines read as a trial.',
  },
  {
    name: 'the Space noun',
    re: /\bSpace\b/,
    why: 'One of the four nouns (CORE-MODEL §"The whole product"). The 2026-07-13 document named three of the four and this was the missing one.',
  },
  {
    name: 'the Event noun',
    re: /\bEvents?\b/,
    why: 'One of the four nouns. A Circle with no Event is a roster nobody meets.',
  },
]

/** Which model claims the document does NOT make. Separate from `findings()` on purpose: a canon
 *  violation is copy that is WRONG, a model gap is copy that is MISSING, and conflating them would
 *  make the clean-voice positive control in the test suite unable to stay clean. */
export function modelGaps(doc) {
  const text = proseStrings(doc)
    .map((s) => s.text)
    .join('\n')
  return MODEL_CLAIMS.filter((c) => !c.re.test(text))
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
  let gaps = 0
  for (const row of rows) {
    let doc
    try {
      doc = JSON.parse(row.doc)
    } catch {
      lines.push(`🔴 \`${row.slug}\`: published_data did not parse as JSON.`)
      continue
    }
    const { strings, out } = findings(doc)
    const missing = modelGaps(doc)
    scanned += strings.length
    count += out.length
    gaps += missing.length
    lines.push(
      `**\`${row.slug}\`** — ${strings.length} copy string(s) scanned, ${out.length} voice finding(s), ` +
        `${MODEL_CLAIMS.length - missing.length}/${MODEL_CLAIMS.length} model claim(s) present.`,
    )
    if (out.length) {
      lines.push('')
      for (const f of out) {
        lines.push(`- **${f.rule}** — ${f.hint}`)
        lines.push(`  at \`${f.path}\`: "${f.text}"`)
      }
      lines.push('')
      lines.push('Fix these in the page editor at `/pages/home` and republish; the copy is not in this repo.')
    }
    if (missing.length) {
      lines.push('')
      lines.push(`⚠️ The front door no longer states ${missing.length} of the core model's claims:`)
      for (const c of missing) lines.push(`- **${c.name}** — ${c.why}`)
      lines.push('')
      lines.push('This is what `/` is for (docs/CORE-MODEL.md §1). Put it back at `/pages/home`.')
    }
  }

  if (!count) {
    lines.push('')
    lines.push('✅ The published front-door copy satisfies the naming and voice canons.')
  }
  if (rows.length && !gaps) {
    lines.push('✅ It also states every claim of the core model.')
  }
  return { text: lines.join('\n'), count, scanned, gaps }
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
  const { text, count, scanned, gaps } = report(raw)
  console.log(text)
  console.log('')
  console.log(
    `(${scanned} string(s) scanned against ${RULES.length} canon rules and ${MODEL_CLAIMS.length} model claims, ` +
      `${count} voice finding(s), ${gaps} model gap(s). Advisory.)`,
  )
}
