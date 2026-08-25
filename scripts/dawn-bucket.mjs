#!/usr/bin/env node
// dawn-bucket — the SLICING INSTRUMENT for the DAWN Phase 3 button sweep (PROG-DAWN3).
//
// ADR-1119 ruled that an XL sweep is cut by SHAPE, not by directory: a slice is the set of raw
// <button> sites whose className is a NEAR-MISS for one `variant × size` of the Button primitive
// — every token the primitive emits for that pair is present, and every token the site carries is
// one the primitive's BASE already supplies. Membership is decided by set arithmetic, so one
// reading of one site is a reading of the whole slice.
//
// 🔴 THIS SCRIPT EXISTS BECAUSE SLICE 1'S QUERY DID NOT (ADR-1124). Slice 1 cut a real
// equivalence class and then asserted "the bucket reads 0" — but the query that produced the
// bucket lived only in the agent that ran it, so the claim could not be re-run by the next agent,
// the reviewer, or CI. It was wrong: two sites in
// app/(main)/admin/marketing/deliverability/requeue-button.tsx are set-members of `primary × sm`
// and were left behind, because they carry the primitive's OWN `lift-1` and the unwritten query
// treated an unrecognised token as a disqualifier. An exhaustiveness claim whose instrument is not
// in the repo is a claim about an intent, not about a set — the shape-not-truth failure this repo
// names in four ADRs. Every later slice re-runs this file instead.
//
// NEAR-MISS, NOT EQUALITY — and the difference is the point of the program. No raw <button> in the
// tree is set-EQUAL to the primitive, because BASE adds three things on purpose that a hand-rolled
// string never carries: `tap-target` (min-block-size, the 44px touch floor under a coarse
// pointer), `press` (the one sanctioned pressed look) and `lift-1` (two box-shadows). Converting a
// site GAINS those. The sweep therefore moves rendered pixels, deliberately.
//
// Usage:
//   node scripts/dawn-bucket.mjs                       # every variant × size, counts + sites
//   node scripts/dawn-bucket.mjs --size md             # one size
//   node scripts/dawn-bucket.mjs --size md --expect 0  # exit 1 unless the bucket is empty
//   node scripts/dawn-bucket.mjs --size sm --quiet     # count only

import { loadCorpus, loadConfig } from './check-adoption.mjs'

// Mirrors components/ui/button.tsx. Kept as data rather than parsed out of the primitive on
// purpose: if someone edits VARIANT/SIZE there, this file should stop agreeing and be updated in
// the same change, rather than silently re-defining every past slice's membership.
const VARIANT = {
  primary: ['bg-primary', 'text-on-primary', 'hover:bg-primary-hover'],
}
const SIZE = {
  sm: ['px-3', 'py-1.5', 'text-meta'],
  md: ['px-4', 'py-2', 'text-body-sm'],
}

// Tokens BASE supplies (or supplies a strictly stronger form of), so a site may carry them and
// still be a near-miss member. `lift-1` is here because the primitive emits it as part of the
// primary variant — a site that already carries it is CLOSER to the primitive, not further.
const ABSORBED = [
  /^rounded-/,                      // → rounded-control, the skinnable ROLE radius
  /^inline-flex$/, /^flex$/, /^items-center$/, /^justify-center$/, /^gap-[\d.]+$/,
  /^font-semibold$/,
  /^transition(-colors|-all|-\[.*\])?$/, /^motion-reduce:transition-none$/,
  /^disabled:opacity-\d+$/, /^disabled:cursor-not-allowed$/,
  /^tap-target$/, /^press$/, /^lift-1$/,
  /^whitespace-nowrap$/,
]

// The raw-button-bg ratchet's own scope, so a bucket count is comparable to the baseline it moves.
const inScope = (p) =>
  /^(app|components|lib)\//.test(p) &&
  p.endsWith('.tsx') &&
  !/\.(test|spec)\.tsx$/.test(p) &&
  p !== 'components/ui/button.tsx' &&
  p !== 'components/ui/icon-button.tsx'

// A className that is a SINGLE STATIC string. Anything built by cn()/a ternary is not
// set-decidable and is deliberately out of every bucket — it needs a human, not a sweep.
const CLASSNAME =
  /className=(?:"([^"]*)"|'([^']*)'|\{`([^`${}]*)`\}|\{'([^'{}]*)'\}|\{"([^"{}]*)"\})/
// `=>` is let through so an onClick arrow cannot truncate the scan — the same idiom the
// raw-button-bg pattern in scripts/adoption-baselines.json uses.
const OPEN_TAG = /<button\b((?:[^>=]|=>|=(?!>))*?)(\/?)>/g

/** Every near-miss site for one variant × size, as `{ path, line, className }`. */
export function bucket(corpus, variant, size) {
  const want = [...VARIANT[variant], ...SIZE[size]]
  const hits = []
  for (const f of corpus) {
    if (!inScope(f.path)) continue
    OPEN_TAG.lastIndex = 0
    let m
    while ((m = OPEN_TAG.exec(f.text)) !== null) {
      if (m[2] === '/') continue
      const cm = m[1].match(CLASSNAME)
      if (!cm) continue
      const cls = cm[1] ?? cm[2] ?? cm[3] ?? cm[4] ?? cm[5]
      const toks = cls.split(/\s+/).filter(Boolean)
      if (!want.every((w) => toks.includes(w))) continue
      if (!toks.every((t) => want.includes(t) || ABSORBED.some((r) => r.test(t)))) continue
      hits.push({
        path: f.path,
        line: f.text.slice(0, m.index).split('\n').length,
        className: cls,
      })
    }
  }
  return hits
}

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const has = (name) => process.argv.includes(`--${name}`)

if (import.meta.url === `file://${process.argv[1]}`) {
  const corpus = loadCorpus(loadConfig())
  const variants = arg('variant') ? [arg('variant')] : Object.keys(VARIANT)
  const sizes = arg('size') ? [arg('size')] : Object.keys(SIZE)
  const expect = arg('expect') === undefined ? undefined : Number(arg('expect'))
  let total = 0

  for (const v of variants) {
    for (const s of sizes) {
      if (!VARIANT[v] || !SIZE[s]) {
        console.error(`unknown variant/size: ${v} × ${s}`)
        process.exit(2)
      }
      const hits = bucket(corpus, v, s)
      total += hits.length
      const files = new Set(hits.map((h) => h.path))
      console.log(`${v} × ${s}: ${hits.length} site(s) in ${files.size} file(s)`)
      if (!has('quiet')) for (const h of hits) console.log(`    ${h.path}:${h.line}`)
    }
  }

  if (expect !== undefined && total !== expect) {
    console.error(`\n✗ expected ${expect} site(s), found ${total}`)
    process.exit(1)
  }
}
