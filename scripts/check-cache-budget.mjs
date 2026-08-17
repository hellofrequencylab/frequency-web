#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// A CEILING ON WHAT THE BUILD HANDS BACK TO VERCEL AS ITS CACHE (ADR-1064).
//
// 🔴 THE FAILURE THIS EXISTS FOR. Not an outage — a tax nobody was billed for out loud. Builds
// ended with `Build cache size 1.53 GB exceeds limit of 1.50 GB. Invalidating cache. Next build
// will start with an empty cache.` on the LAST line of a green log. Nothing failed, nothing was
// red, and the cost — a cold `pnpm install` of all 804 packages plus a cold compile, on a build
// that had a perfectly good cache a second earlier — was invisible unless somebody read the tail
// of a passing build. That is the swallowed-regression shape DEPLOY-SAFETY rule 6 names.
//
// WHAT VERCEL ACTUALLY CACHES, and why this file measures exactly these three globs. It is not a
// guess and it is not `.next/cache` alone. `@vercel/next`'s `prepareCache` builds the cache from
// precisely:
//
//     node_modules/**            <- the install (measured 948 MB restored, 1073 MB fresh)
//     <distDir>/cache/**         <- Turbopack's FileSystem cache, `next/image`, the fetch cache
//     .yarn/cache/**             <- n/a here, this repo is pnpm
//
// (node_modules/@vercel/next/dist/index.js, `var prepareCache = async (...)`. Fetch the package and
// read it before you doubt this — it is 30 lines and it is the whole contract.)
//
// THE ARITHMETIC THAT MAKES THIS A PROBLEM. node_modules is a FLOOR of roughly 1.0 GB, ~65% of
// Vercel's 1.50 GB ceiling, and it is the HALF WORTH KEEPING: a warm install finishes in 1s where a
// cold one downloads 804 packages in ~15s. The Turbopack build cache is the GROWING half — measured
// locally at 119 MB after a compacted build and 928 MB after a single warm rebuild of the same tree.
// So the growing half periodically evicts the valuable half, and the build pays BOTH costs at once.
//
// WHAT THIS FILE DOES ABOUT IT. Two different things, and the difference is the point:
//
//   1. FAIL-SAFE. If the packed sum would exceed the ceiling, drop `.next/cache/turbopack` — the
//      growing, cheap-to-rebuild half — so Vercel stores a cache it will ACCEPT. The result is a
//      cold compile on the next build (~13s, measured in DEPLOY-SAFETY §9) instead of a cold
//      compile AND a cold install AND a silently discarded cache. A partial loss, chosen, in place
//      of a total loss, unnoticed.
//
//   2. THE GATE THAT NOTICES. A fail-safe with no gate is an invisible regression (AGENTS.md), so
//      the floor has its own budget and it FAILS THE BUILD. The trim can absorb Turbopack growing;
//      nothing can absorb node_modules growing, because that is the term that decides whether the
//      cache is usable at all. If the install passes NODE_MODULES_BUDGET_GIB the cache is on its way
//      to being structurally worthless, and that is a decision a human must make on purpose.
//
// It runs as `postbuild`, on Vercel's real build, AFTER `next build` has written the cache and
// BEFORE Vercel packs it — the same reason `check:build-budget` runs there. CI never builds, so a
// source-level gate could not see any of this.
// ─────────────────────────────────────────────────────────────────────────────
import { lstatSync, readdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const GIB = 1024 ** 3
const MIB = 1024 ** 2

// ── THE CEILING ─────────────────────────────────────────────────────────────────────────────
// NOT ours. Vercel's, quoted from the build log verbatim: "Build cache size 1.53 GB exceeds limit
// of 1.50 GB." There is no project setting, no vercel.json key and no plan toggle that raises it —
// the only cache control Vercel exposes is turning the cache off for a deployment. So this number
// is a fact to build under, not a budget to argue with.
const VERCEL_CEILING_GIB = 1.5
// Trim below the ceiling, not at it. Vercel's figure and ours are measured by different code over
// the same bytes and have run ~3% apart; the reserve is what stops a rounding difference turning a
// "just under" into a silent invalidation. It also covers the little that `next start`-shaped
// caches (`.next/cache/images`, the fetch cache) may add after this runs.
const RESERVE_GIB = 0.12
const TRIM_AT_GIB = VERCEL_CEILING_GIB - RESERVE_GIB

// ── THE FLOOR BUDGET — this is the half that fails the build ─────────────────────────────────
// Measured 2026-08-17: node_modules is 948 MB restored / 1073 MB freshly installed (Vercel's own
// "Folder sizes on disk" report). 1.25 GiB leaves ~28% headroom over the fresh figure: room for
// ordinary dependency growth, and far enough below the 1.50 GB ceiling that the Turbopack cache
// still has somewhere to live. Above this the trim would have to fire on every single build, which
// means the cache has stopped being a cache — the thing this gate exists to say out loud.
//
// A RATCHET IN SPIRIT: it may fall. Raising it needs a reason in the commit, because the cheapest
// way to make any budget green is to edit the budget, and that is how the 2026-08-11 artifact sat
// 1.5x over its container for months (ADR-1002).
//
// The biggest single line, measured: @supabase/cli-linux-x64 at 155 MB — a devDependency binary no
// build step touches. It stays because `test:rls` and .github/workflows/db-tests.yml run
// `supabase db start` through it; cutting it is a workflow change, not a config line, and 155 MB
// does not by itself decide this budget.
const NODE_MODULES_BUDGET_GIB = 1.25

/** Sum a directory tree the way a tar of it would: real files once, symlinks as links (~0). */
function measure(rel) {
  const abs = path.join(ROOT, rel)
  if (!existsSync(abs)) return 0
  let total = 0
  const stack = [abs]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue // an unreadable directory contributes nothing rather than crashing the build
    }
    for (const entry of entries) {
      const child = path.join(dir, entry.name)
      // Never follow symlinks. pnpm's node_modules is a symlink farm pointing into .pnpm/;
      // following them would count most of the tree several times over and the number would be
      // fiction. Vercel stores them as links too.
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        stack.push(child)
        continue
      }
      try {
        total += lstatSync(child).size
      } catch {
        /* raced with a delete; contributes nothing */
      }
    }
  }
  return total
}

const gib = (b) => (b / GIB).toFixed(2)
const mib = (b) => (b / MIB).toFixed(0)

const nodeModules = measure('node_modules')
let nextCache = measure('.next/cache')
const yarnCache = measure('.yarn/cache')

// Name the parts of .next/cache, so a future growth has an address rather than a total.
const cacheParts = []
const cacheDir = path.join(ROOT, '.next', 'cache')
if (existsSync(cacheDir)) {
  for (const entry of readdirSync(cacheDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    cacheParts.push([entry.name, measure(path.join('.next', 'cache', entry.name))])
  }
  cacheParts.sort((a, b) => b[1] - a[1])
}

let total = nodeModules + nextCache + yarnCache
const dropped = []

// THE FAIL-SAFE. Drop compiler caches, biggest first, until Vercel will accept what is left.
//
// Biggest-first rather than a hardcoded `turbopack`, deliberately. `.next/cache` holds the
// Turbopack FileSystem cache AND the build-time fetch cache AND `next/image`, and which of them is
// growing is not something the repo can see from outside a Vercel build — the printout below is
// what answers it. A trim keyed on one name would quietly free nothing the day the answer changes,
// which is the silent-exclude failure DEPLOY-SAFETY rule 6 already caught once in next.config.ts.
//
// Everything under `.next/cache` is safe to delete: it is a build accelerator, it is not part of
// the deployed artifact (Vercel deploys `.vercel/output`), and Next rebuilds it. node_modules is
// never touched here — it is the half worth keeping, and it is the gate's business, not the trim's.
if (total > TRIM_AT_GIB * GIB) {
  const before = total
  for (const [name, size] of cacheParts) {
    if (total <= TRIM_AT_GIB * GIB) break
    rmSync(path.join(cacheDir, name), { recursive: true, force: true })
    dropped.push([name, size])
    total -= size
  }
  nextCache = measure('.next/cache')
  total = nodeModules + nextCache + yarnCache
  console.log(
    `\n⚠️  check:cache-budget — TRIMMED the build cache before Vercel could reject it.\n` +
      `   What the build was about to hand back measured ${gib(before)} GiB, over the ` +
      `${TRIM_AT_GIB.toFixed(2)} GiB trim point.\n` +
      `   Vercel discards the WHOLE cache above ${VERCEL_CEILING_GIB.toFixed(2)} GB — node_modules included — so this\n` +
      `   drops the cheap half instead: ${dropped.map(([n, b]) => `.next/cache/${n} (${mib(b)} MiB)`).join(', ')}.\n` +
      `   Next build: warm install (~1s, vs ~15s cold for 804 packages), cold compile (~13s).\n` +
      `   A chosen partial loss in place of an unnoticed total one.\n`,
  )
}

if (nodeModules > NODE_MODULES_BUDGET_GIB * GIB) {
  console.error(
    `\n🔴 check:cache-budget — node_modules is ${gib(nodeModules)} GiB, over the ` +
      `${NODE_MODULES_BUDGET_GIB} GiB floor budget.\n\n` +
      `   This is the term that decides whether a build cache is possible at all. Vercel's cache\n` +
      `   is node_modules + .next/cache and it is discarded WHOLE above ${VERCEL_CEILING_GIB} GB, so an\n` +
      `   install this size leaves no room for the compiler cache and the trim above has to fire\n` +
      `   on every build. Cut a dependency — or raise this on purpose, in the commit message,\n` +
      `   knowing the cache is what you are spending. See docs/DEPLOY-SAFETY.md §10.\n`,
  )
  process.exit(1)
}

// The composition line is not decoration. Nobody could see inside a Vercel build cache before this
// ran, which is why LIVE-029 could only be diagnosed by subtracting two numbers in a log tail.
const kept = cacheParts.filter(([n]) => !dropped.some(([d]) => d === n))
const parts = kept.length > 0 ? kept.map(([n, b]) => `${n} ${mib(b)} MiB`).join(', ') : 'empty'
console.log(
  `✅ check:cache-budget — Vercel will store ${gib(total)} GiB ` +
    `(node_modules ${mib(nodeModules)} MiB + .next/cache ${mib(nextCache)} MiB), under the ` +
    `${VERCEL_CEILING_GIB} GB ceiling.`,
)
console.log(`   .next/cache holds: ${parts}`)
