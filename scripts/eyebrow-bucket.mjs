#!/usr/bin/env node
// eyebrow-bucket — the SLICING INSTRUMENT for the `handrolled-eyebrow` ratchet class (HYG-055).
//
// ADR-1256 gave the eyebrow class a slice rule, and ADR-1124 gave the reason this file has to
// exist at all: an exhaustiveness claim whose query lives only in the agent that ran it is a
// claim about an intent, not about a set. Slice 1's membership is re-derivable here, by anyone,
// at any later commit.
//
// THE RULE, in one sentence: cut by the CLASS LIST's own shape, never by directory.
//
//   BADGE      — the class list carries chrome of its own (a background, a border, a radius, its
//                own padding). A pill badge and a dense table cell live here. 0.18em would blow
//                the pill out, so these are NOT the eyebrow role and never join a slice.
//   ROLE-SIZE  — chrome-free and already at `text-meta`, which IS 0.75rem, which IS
//                `--text-eyebrow`. The role written out longhand: same size, a literal tracking
//                and a literal weight. Converting moves tracking and weight only, both toward
//                the role's own values, so one reading of one site is a reading of the bucket.
//   SMALL      — chrome-free at `text-2xs` / `text-3xs`, a SMALLER register than the role. These
//                cannot be swept until the owner rules whether the small register steps up to
//                0.75rem or keeps a register of its own; a sweep that assumes an answer would
//                book a design decision as a cleanup.
//   OTHER      — chrome-free at some other size (mostly `text-body-sm`, the register ADR-1075
//                retired, and interpolated class lists no set query can decide).
//
// A SLICE is one `tracking-*` value inside ROLE-SIZE, further cut to the files NOT import-
// reachable from a surface `test/e2e/visual.spec.ts` photographs (visual baselines are recaptured
// on a runner, by the owner, so a slice that moves one cannot self-certify). Slice 1 was
// `--tracking wide --weight font-semibold`: 73 sites in 52 files, of which the 39 unwatched ones
// shipped, taking the class 589 → 550.
//
// 2026-09-08 (ADR-1283): the "cannot self-certify" half of that sentence expired. ADR-1269 read
// `.github/workflows/e2e-manual.yml` and it is a `workflow_dispatch` an agent can run, so the
// recapture is a step in the PR that moves the pixels, not a reason to leave a site behind. The
// 49 watched sites the three slices had left (34 wide / 8 wider / 7 widest) shipped, and every
// `--tracking` query below now reads 0. What remains in ROLE-SIZE is interpolated or carries
// another weight, and no slice claims it.
//
// Usage:
//   node scripts/eyebrow-bucket.mjs                       # the four buckets, with counts
//   node scripts/eyebrow-bucket.mjs --tracking wide       # one slice's sites
//   node scripts/eyebrow-bucket.mjs --tracking wide --expect 0

import { loadCorpus, loadConfig, inScope } from './check-adoption.mjs'

/** Chrome of the element's own: what separates a badge from a label. */
const CHROME = /^(?:bg-|border|rounded-|px-|py-|p-\d|ring-|shadow-|divide-)/

/** Tokens a converted site may keep: layout, and a semantic colour. `eyebrow` sets type only. */
const LAYOUT = /^(?:mb-|mt-|ml-|mr-|mx-|my-|block$|inline-block$|flex$|inline-flex$|items-|gap-|whitespace-|shrink-|leading-)/
const COLOUR = /^text-(?:subtle|muted|text|primary|primary-strong|success|warning|danger)$/

/** The four longhand tokens the composite `eyebrow` utility replaces, minus the tracking. */
const LONGHAND = ['text-meta', 'uppercase']

/**
 * Every hand-rolled eyebrow site, as `{ path, line, className, bucket }`.
 *
 * Deliberately measured through `check-adoption`'s OWN corpus loader and OWN patterns rather than
 * a fresh scan: a bucket count that is not comparable to the baseline it claims to move is the
 * shape-not-truth failure this repo names in four ADRs.
 */
export function sites(corpus, config) {
  const entry = config.entries.find((e) => e.key === 'handrolled-eyebrow')
  const out = []
  for (const f of corpus) {
    if (!inScope(f.path, entry)) continue
    for (const pattern of entry.patterns) {
      const re = new RegExp(pattern, 'g')
      let m
      while ((m = re.exec(f.text)) !== null) {
        // Walk out to the enclosing quote so the whole class list is in view, not just the match.
        let start = m.index
        while (start > 0 && !['"', "'", '`'].includes(f.text[start - 1])) start--
        let end = m.index + m[0].length
        while (end < f.text.length && !['"', "'", '`'].includes(f.text[end])) end++
        const className = f.text.slice(start, end).replace(/\s+/g, ' ').trim()
        const tokens = className.split(/\s+/).filter(Boolean)
        const bucket = tokens.some((t) => CHROME.test(t))
          ? 'badge'
          : tokens.includes('text-meta')
            ? 'role-size'
            : tokens.includes('text-2xs') || tokens.includes('text-3xs')
              ? 'small'
              : 'other'
        out.push({ path: f.path, line: f.text.slice(0, m.index).split('\n').length, className, bucket })
        if (re.lastIndex === m.index) re.lastIndex += 1
      }
    }
  }
  return out
}

/** True when a ROLE-SIZE site is set-decidable for one tracking × weight, i.e. slice-eligible. */
export function slice(all, tracking, weight) {
  return all.filter((s) => {
    if (s.bucket !== 'role-size') return false
    // An interpolated or conditional class list is not set-decidable and needs a human.
    if (s.className.includes('${') || s.className.includes('?')) return false
    const tokens = s.className.split(/\s+/).filter(Boolean)
    const want = [...LONGHAND, `tracking-${tracking}`, weight]
    if (!want.every((w) => tokens.includes(w))) return false
    return tokens.every((t) => want.includes(t) || LAYOUT.test(t) || COLOUR.test(t))
  })
}

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig()
  const all = sites(loadCorpus(config), config)
  const tracking = arg('tracking')
  const expect = arg('expect') === undefined ? undefined : Number(arg('expect'))

  if (!tracking) {
    const counts = { badge: 0, 'role-size': 0, small: 0, other: 0 }
    for (const s of all) counts[s.bucket] += 1
    console.log(`handrolled-eyebrow: ${all.length} site(s)`)
    console.log(`  badge      ${String(counts.badge).padStart(4)}  chrome of its own — never a slice`)
    console.log(`  role-size  ${String(counts['role-size']).padStart(4)}  chrome-free at text-meta — the sweepable half`)
    console.log(`  small      ${String(counts.small).padStart(4)}  chrome-free at text-2xs/3xs — needs the register ruling`)
    console.log(`  other      ${String(counts.other).padStart(4)}  chrome-free, another size or interpolated`)
    process.exit(0)
  }

  const hits = slice(all, tracking, arg('weight') ?? 'font-semibold')
  const files = new Set(hits.map((h) => h.path))
  console.log(`slice tracking-${tracking}: ${hits.length} site(s) in ${files.size} file(s)`)
  for (const h of hits) console.log(`    ${h.path}:${h.line}`)
  if (expect !== undefined && hits.length !== expect) {
    console.error(`\n✗ expected ${expect} site(s), found ${hits.length}`)
    process.exit(1)
  }
}
