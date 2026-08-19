#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// A CEILING ON WHAT THE BUILD HANDS BACK TO VERCEL AS ITS CACHE (ADR-1064, ADR-1086).
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
//   1. FAIL-SAFE. If the PACKED sum would exceed the ceiling, drop the COMPILER caches by name —
//      the growing, cheap-to-rebuild half — so Vercel stores a cache it will ACCEPT. The result is
//      a cold compile on the next build instead of a cold compile AND a cold install AND a silently
//      discarded cache. A partial loss, chosen, in place of a total loss, unnoticed.
//
//   2. THE GATE THAT NOTICES. A fail-safe with no gate is an invisible regression (AGENTS.md), so
//      the floor has its own budget and it FAILS THE BUILD. The trim can absorb Turbopack growing;
//      nothing can absorb node_modules growing, because that is the term that decides whether the
//      cache is usable at all. If the install passes NODE_MODULES_BUDGET_GIB the cache is on its way
//      to being structurally worthless, and that is a decision a human must make on purpose.
//
// It is written to run as `postbuild`, on Vercel's real build, AFTER `next build` has written the
// cache and BEFORE Vercel packs it — the same reason `check:build-budget` runs there. CI never
// builds, so a source-level gate could not see any of this. That ordering is not assumed, it is
// READ OFF A REAL PRODUCTION LOG (dpl_2KiiaUjD5jCPwUZdVWJtsKb4ADor, 2026-08-18): postbuild at
// 19:13:34, "Build Completed" 19:13:37, "Creating build cache..." 19:14:02. The trim would land 28
// seconds before the pack.
//
// ── WHAT A REAL BUILD SAYS, so the next reader does not have to take the numbers on trust ──────
// Three consecutive production builds on 2026-08-18 (18:46, 19:01, 19:09), from Vercel's own
// "Folder sizes on disk" report and its cache-upload line:
//
//     node_modules            947 MB   (identical on all three)
//     uploaded build cache   1.26 / 1.28 / 1.29 GB   — under the 1.50 GB ceiling
//     "Restored build cache from previous deployment (…)"  — present on every one
//
// 🔴 AND THEN A REAL BUILD DISPROVED THE FIRST VERSION OF THIS FILE. It was wired into `postbuild`
// on 2026-08-18 on the reasoning that neither arm could fire, and the preview build of that very
// change printed:
//
//     ⚠️  check:cache-budget — TRIMMED the build cache before Vercel could reject it.
//        What the build was about to hand back measured 2.40 GiB, over the 1.38 GiB trim point.
//        drops the cheap half instead: .next/cache/turbopack (1520 MiB).
//     ✅ check:cache-budget — Vercel will store 0.91 GiB (node_modules 933 MiB + .next/cache 0 MiB)
//
// The FLOOR arm was right: 933 MiB, 27% clear of its budget. TWO OTHER THINGS WERE WRONG, and both
// are fixed below (LIVE-048, ADR-1086). They are independent, and fixing only one of them would
// have left a gate that still kills builds:
//
//   DEFECT 1, THE UNITS. `measure()` sums RAW BYTES ON DISK; Vercel's 1.50 GB ceiling applies to the
//   PACKED archive. The old comment claiming the two "have run ~3% apart" was the whole bug: on this
//   build raw was 2.40 GiB while the packed upload of an equivalent tree was 1.26–1.29 GB, about
//   2:1. Turbopack's cache is highly compressible and it is the term that dominates. So the trim
//   would have deleted a 1.5 GiB compiler cache on EVERY build to prevent an overflow that was not
//   happening. The threshold is now carried in Vercel's units through PACKED_PER_RAW below.
//
//   DEFECT 2, AND IT IS THE ONE THAT KILLED BUILDS. The trim dropped `.next/cache` subdirectories
//   BIGGEST-FIRST, deliberately, so that growth in a directory nobody had thought of would still be
//   caught. That generality is exactly what let it delete the half the build cannot proceed without.
//   `.next/cache` is not only the compiler cache: it also holds the INCREMENTAL FETCH CACHE, and
//   page-data collection prerenders hundreds of routes that each read Supabase. Warm, those reads
//   are local. Cold, every one goes to the network three workers deep and the build never finishes.
//   MEASURED, on the two builds that followed the one trim this file ever ran:
//
//     branch build, EMPTY .next/cache   compiled in 2.3 min, then hung in "Collecting page data
//                                       using 3 workers" and hit BUILD_EXCEEDED_MAXIMUM_TIME at 46
//                                       minutes. The next one hung the same way and also failed.
//     same buildCommand, HEALTHY cache  Build Completed in 59 SECONDS.
//
//   59 seconds against two dead builds, and the control that separates them is exactly this cache:
//   `claude/build-pin` carried the identical `vercel.json` change on a branch cut from main and
//   finished in 59s, so nothing about the source was responsible. The trim now names the compiler
//   caches (COMPILER_CACHE_DIRS) and can reach nothing else; a directory it does not recognise is
//   REPORTED and kept, which is the honest version of the generality the old loop was reaching for.
//
// 🔒 STILL NOT WIRED, AND NOT BECAUSE THIS FILE IS UNFINISHED. LIVE-035 owns the wiring, and the
// rule it is keeping is AGENTS.md's: a build-blocking gate that has never seen a real artifact is
// the 2026-08-11 incident with the roles reversed. This file DID pass its own checks, ran clean
// locally, and was still wrong by a factor of two. So it goes into `postbuild` in the SAME change as
// the preview build that prints it green, and the first thing that build's output is for is
// RE-DERIVING PACKED_PER_RAW: every run prints the raw figure it measured, and the log prints
// `Uploading build cache [N GB]` a minute later. Those two numbers, from ONE build, are the paired
// reading this constant currently does not have.
//
// ⚠️ RUNNING THIS IN A LONG-LIVED DEV CONTAINER OVER-REPORTS, and by a lot. `pnpm` leaves
// unreferenced store entries in `node_modules/.pnpm` when a dependency version changes, and
// `pnpm install --frozen-lockfile` does not remove them. In the container this was wired from,
// node_modules measured 1.44 GiB — over the floor, exit 1 — of which 0.49 GiB was orphans absent
// from `pnpm-lock.yaml`: two copies of `next`, two of `@supabase/cli-linux-x64` at 154 MB each, two
// of `@next/swc-linux-x64-gnu`. Subtract them and it is 0.96 GiB, which is Vercel's 947 MB. A
// Vercel build installs from the lockfile into an empty tree and never has them. If this fails
// locally, check for orphans before believing it.
// ─────────────────────────────────────────────────────────────────────────────
import { lstatSync, readdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'

// ── WARN-ONLY: the stage between "fixed" and "enforcing" ────────────────────────────────────
// LIVE-035's problem was never whether this gate is correct on paper. It is that the ONE thing it
// could not have — a reading from a real production artifact — is also the only thing that settles
// PACKED_PER_RAW, and the only way to get it was to run on a real build. Wiring it as a blocking
// gate to obtain that reading is the 2026-08-11 incident with the roles reversed, and this file has
// already killed two builds proving it.
//
// So it runs in postbuild in this mode first. `--warn-only` is not a softer version of the gate,
// it is a DIFFERENT job:
//   • it MEASURES and PRINTS, which is the whole point — the raw figure printed next to the same
//     build's "Uploading build cache [N GB]" line is what re-derives the constant;
//   • it NEVER TRIMS, so the defect that hung two builds for 46 minutes cannot recur even if the
//     named-cache logic is wrong in some way nobody has thought of;
//   • it NEVER EXITS NON-ZERO, including on the node_modules floor and including on its own crash.
//
// That last clause is deliberate and it is the reason this is safe to wire today: there is no
// input, no bug and no unreadable directory that lets this line fail a production deploy. What it
// buys in exchange for enforcing nothing is a number, printed on a real artifact, in a log we read.
//
// ⚠️ IT IS NOT A PLACE TO LEAVE THINGS. A gate that only warns is a gate everyone learns to scroll
// past (ADR-970, and check:adoption spent two days red on main proving it again on 2026-08-18).
// Promote it to blocking in the SAME change as the green build whose numbers confirm the constant.
// Until then LIVE-029 is still open and nothing prevents a cache overflow.
//
// A swallowed crash still gets a gate that notices it fired: the handler below prints a 🔴 line
// naming this file, so a broken measurement reads as broken rather than as absent.
const WARN_ONLY = process.argv.includes('--warn-only')

if (WARN_ONLY) {
  process.on('uncaughtException', (err) => {
    console.log(
      `\n🔴 check:cache-budget (warn-only) CRASHED and is being ignored so it cannot fail this ` +
        `build: ${err && err.stack ? err.stack : err}\n` +
        `   No measurement was taken, so this build contributes nothing to settling PACKED_PER_RAW. ` +
        `Fix the script before promoting it to blocking (LIVE-035).\n`,
    )
    process.exit(0)
  })
}

const ROOT = process.cwd()
const GIB = 1024 ** 3
const MIB = 1024 ** 2
// Vercel prints its cache figures in decimal GB ("exceeds limit of 1.50 GB", "Uploading build
// cache [1.33 GB]"), so every packed number below is decimal. The floor budget stays in GiB
// because it is OUR budget over OUR measurement, and mixing the two silently is how this file
// got its threshold wrong the first time.
const GB = 1000 ** 3

// ── THE CEILING ─────────────────────────────────────────────────────────────────────────────
// NOT ours. Vercel's, quoted from the build log verbatim: "Build cache size 1.53 GB exceeds limit
// of 1.50 GB." There is no project setting, no vercel.json key and no plan toggle that raises it —
// the only cache control Vercel exposes is turning the cache off for a deployment. So this number
// is a fact to build under, not a budget to argue with. It applies to the PACKED archive.
const VERCEL_CEILING_GB = 1.5

// ── THE CALIBRATION CONSTANT: raw bytes on disk to the packed archive Vercel weighs ──────────
// This file can only measure raw bytes. Measuring the packed size would mean packing the cache, on
// a build, to find out whether the cache is too big, which costs more than the problem. So the raw
// figure is converted with a ratio, and the ratio is the one number here that has to come from real
// builds rather than from reading.
//
// WHAT IT IS DERIVED FROM, stated so it can be re-checked rather than trusted (all 2026-08-18):
//
//     RAW,    this script, preview build GyKdz12oPgfc5roSqmv6F8Nq3nyK   2.40 GiB = 2.58 GB
//     PACKED, "Uploading build cache", three production builds          1.26 / 1.28 / 1.29 GB
//     PACKED, "Uploading build cache", claude/build-pin                 1.33 GB
//
//     1.26–1.33 GB packed over 2.58 GB raw  =>  0.49–0.52.  Rounded: 0.50.
//
// ✅ SETTLED 2026-08-19 BY A SINGLE BUILD THAT PRINTED BOTH HALVES. That is what the warn-only
// stage above was for, and it worked on its first run: preview build 3jeNVZxuUy7thPjXpazjMC6yHwVo
// (PR #2178) measured and uploaded in the same build, so the pair is no longer inferred across
// two trees.
//
//     RAW,    this script, warn-only    2.34 GiB = 2.513 GB  (node_modules 933 MiB + turbopack 1459 MiB)
//     PACKED, "Uploading build cache"   1.32 GB
//
//     1.32 / 2.513  =>  0.5254.
//
// 🔴 THE OLD 0.50 WAS WRONG IN THE UNSAFE DIRECTION, by 5.1%. It UNDER-estimated the packed size,
// so the gate believed it had more headroom than it did and would have trimmed LATER than intended
// — the opposite of the 2026-08-18 defect, which trimmed early, and the more dangerous one: a cache
// that reaches Vercel over the ceiling is discarded WHOLE, node_modules included.
//
// Rounded UP to 0.53 rather than to the measured 0.5254, on purpose. Over-estimating the packed
// size makes the gate fire early, which costs a cold compile; under-estimating loses the entire
// cache. Those errors are not symmetric, so the rounding is not either.
//
// STILL A WHOLE-ARCHIVE RATIO, and that limit has not changed: node_modules and the Turbopack cache
// do not compress alike, and nothing available here separates them. A tree whose MIX shifts a long
// way from 933 MiB node_modules + ~1.4 GiB turbopack can still drift. Every run prints the raw
// figure it measured, so re-derive from the pair on any build where the mix looks different. Do not
// tune it to make a run green.
//
// ⚠️ HEADROOM IS TIGHTER THAN THE OLDER READINGS SUGGESTED: 1.32 GB against the 1.50 GB ceiling is
// 12% clear, where the 2026-08-18 production reads of 1.26 GB looked like 16%. That is the number
// LIVE-029 is about.
const PACKED_PER_RAW = 0.53
const PACKED_PER_RAW_MEASURED = '2026-08-19'

// Trim below the ceiling, not at it. The reserve covers the estimate's own error and the little
// that `next start`-shaped caches may add after this runs. It is deliberately not large: with the
// trim restricted to compiler caches, firing early costs a cold compile, and firing late costs the
// whole cache including node_modules.
const RESERVE_GB = 0.1
const TRIM_AT_PACKED_GB = VERCEL_CEILING_GB - RESERVE_GB

// ── THE FLOOR BUDGET — this is the half that fails the build ─────────────────────────────────
// Measured 2026-08-17: node_modules is 948 MB restored / 1073 MB freshly installed (Vercel's own
// "Folder sizes on disk" report), and 933 MiB on the 2026-08-18 preview build, 27% clear. 1.25 GiB
// leaves ~28% headroom over the fresh figure: room for ordinary dependency growth, and far enough
// below the 1.50 GB ceiling that the Turbopack cache still has somewhere to live. Above this the
// trim would have to fire on every single build, which means the cache has stopped being a cache —
// the thing this gate exists to say out loud.
//
// A RATCHET IN SPIRIT: it may fall. Raising it needs a reason in the commit, because the cheapest
// way to make any budget green is to edit the budget, and that is how the 2026-08-11 artifact sat
// 1.5x over its container for months (ADR-1002).
//
// The biggest single line, measured: @supabase/cli-linux-x64 at 155 MB — a devDependency binary no
// build step touches. It stays because `test:rls` and .github/workflows/db-tests.yml run
// `supabase db start` through it; cutting it is a workflow change, not a config line, and 155 MB
// does not by itself decide this budget.
//
// It is a RAW budget, in GiB, and it is compared against the raw measurement directly. No
// calibration is involved: this arm is about whether the install has grown, which is a fact about
// the disk, not about the archive.
const NODE_MODULES_BUDGET_GIB = 1.25

// ── WHAT THE TRIM MAY TOUCH, BY NAME ─────────────────────────────────────────────────────────
// 🔴 THE LIST IS THE FIX. The old trim sorted `.next/cache` subdirectories by size and dropped the
// biggest, which on a real build meant deleting the incremental fetch cache and hanging two builds
// for 46 minutes each in "Collecting page data". Nothing here is size-sorted and nothing here is
// discovered: the trim iterates THIS list, so a directory that is not named cannot be removed, no
// matter how large it grows.
//
// Read out of Next's own source rather than guessed (node_modules/next/dist/build/webpack-config.js
// `cacheDirectory` and `swcCacheDir`, and the turbopack/rspack cache paths beside them):
//
//     .next/cache/turbopack   Turbopack FileSystem cache   rebuilt by compiling
//     .next/cache/rspack      rspack cache                 rebuilt by compiling
//     .next/cache/webpack     webpack cache                rebuilt by compiling
//     .next/cache/swc         swc transform cache          rebuilt by compiling
//
// Every one of these is a COMPILER cache: losing it costs CPU on the next build and nothing else.
// They are listed cheapest-to-lose first, which is the only ordering the trim uses.
const COMPILER_CACHE_DIRS = ['turbopack', 'rspack', 'webpack', 'swc']

// ── WHAT THE TRIM MUST NEVER TOUCH ───────────────────────────────────────────────────────────
// These are not compiler output. Losing them costs NETWORK on the next build, which is the failure
// mode that killed two builds:
//
//     .next/cache/fetch-cache   the incremental fetch cache. Page-data collection prerenders
//                               hundreds of Supabase-reading routes; cold, every read goes over the
//                               network three workers deep and the build does not finish
//                               (next/dist/server/lib/incremental-cache/file-system-cache.js).
//     .next/cache/images        next/image optimized output (next/dist/server/image-optimizer.js).
//                               Cheap to lose but it is not the compiler's, so it is not the
//                               trim's business either.
//
// This list is belt AND braces: the trim already only walks COMPILER_CACHE_DIRS, and the assertion
// below refuses to trim at all if the two lists ever overlap. A future edit that adds `fetch-cache`
// to the compiler list disables the trim and says so, instead of quietly repeating 2026-08-18.
const NEVER_TRIM_DIRS = ['fetch-cache', 'images']

const OVERLAP = COMPILER_CACHE_DIRS.filter((name) => NEVER_TRIM_DIRS.includes(name))

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
const gb = (b) => (b / GB).toFixed(2)
const mib = (b) => (b / MIB).toFixed(0)
/** Raw bytes on disk to the packed bytes Vercel weighs. The one conversion in this file. */
const packed = (rawBytes) => rawBytes * PACKED_PER_RAW

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

let rawTotal = nodeModules + nextCache + yarnCache
const dropped = []

// THE FAIL-SAFE. Drop the compiler caches, by name, in the order COMPILER_CACHE_DIRS lists them,
// until the PACKED estimate is one Vercel will accept.
//
// The trim stops when the estimate is under the trim point, or when the named compiler caches are
// gone, whichever comes first. If it runs out of things it is allowed to drop it says so and stops.
// It does not go looking for more: everything else under `.next/cache` is either the fetch cache,
// which the build needs, or a directory this file has never seen, which is a thing to read about
// before deleting on a production build. node_modules is never touched here either. It is the half
// worth keeping, and it is the gate's business rather than the trim's.
if (WARN_ONLY) {
  // Measuring only. The trim is the half that killed builds, so it does not run at all here --
  // not "runs and finds nothing", genuinely never reached.
  if (packed(rawTotal) > TRIM_AT_PACKED_GB * GB) {
    console.log(
      `\n⚠️  check:cache-budget (warn-only) — this cache WOULD have been trimmed: ` +
        `${gib(rawTotal)} GiB raw, about ${gb(packed(rawTotal))} GB packed, over the ` +
        `${TRIM_AT_PACKED_GB.toFixed(2)} GB trim point.\n` +
        `   Nothing was deleted. Read this build's "Uploading build cache [N GB]" line: if that ` +
        `figure is under ${VERCEL_CEILING_GB.toFixed(2)} GB then PACKED_PER_RAW is too HIGH and ` +
        `the trim point is firing early.\n`,
    )
  }
} else if (OVERLAP.length > 0) {
  console.log(
    `\n⚠️  check:cache-budget did not trim anything. ${OVERLAP.join(', ')} appears in both the ` +
      `compiler-cache list and the never-trim list.\n` +
      `   Those lists disagreeing is the one condition that makes this trim unsafe, so it stops. ` +
      `Fix the lists in this file.\n`,
  )
} else if (packed(rawTotal) > TRIM_AT_PACKED_GB * GB) {
  const before = rawTotal
  for (const name of COMPILER_CACHE_DIRS) {
    if (packed(rawTotal) <= TRIM_AT_PACKED_GB * GB) break
    if (NEVER_TRIM_DIRS.includes(name)) continue // unreachable while OVERLAP is empty, and free
    const found = cacheParts.find(([partName]) => partName === name)
    if (!found) continue
    rmSync(path.join(cacheDir, name), { recursive: true, force: true })
    dropped.push(found)
    rawTotal -= found[1]
  }
  nextCache = measure('.next/cache')
  rawTotal = nodeModules + nextCache + yarnCache

  const still = packed(rawTotal) > TRIM_AT_PACKED_GB * GB
  console.log(
    `\n⚠️  check:cache-budget trimmed the build cache before Vercel could reject it.\n` +
      `   What the build was about to hand back measured ${gib(before)} GiB raw, about ` +
      `${gb(packed(before))} GB packed, over the ${TRIM_AT_PACKED_GB.toFixed(2)} GB trim point.\n` +
      `   Vercel discards the WHOLE cache above ${VERCEL_CEILING_GB.toFixed(2)} GB, node_modules included, so this ` +
      `drops compiler caches instead:\n` +
      `   ${dropped.length > 0 ? dropped.map(([n, b]) => `.next/cache/${n} (${mib(b)} MiB)`).join(', ') : 'nothing, none of the named compiler caches were present'}.\n` +
      `   The fetch cache is kept. Next build: warm install, cold compile.\n` +
      (still
        ? `   🔴 STILL OVER after the trim: ${gb(packed(rawTotal))} GB packed. The compiler caches ` +
          `are not the term that grew.\n` +
          `   Nothing else here is safe to delete on a build, so read what .next/cache holds below ` +
          `and decide on purpose. See docs/DEPLOY-SAFETY.md §10.\n`
        : ''),
  )
}

if (nodeModules > NODE_MODULES_BUDGET_GIB * GIB) {
  console.error(
    `\n🔴 check:cache-budget — node_modules is ${gib(nodeModules)} GiB, over the ` +
      `${NODE_MODULES_BUDGET_GIB} GiB floor budget.\n\n` +
      `   This is the term that decides whether a build cache is possible at all. Vercel's cache\n` +
      `   is node_modules + .next/cache and it is discarded WHOLE above ${VERCEL_CEILING_GB} GB, so an\n` +
      `   install this size leaves no room for the compiler cache and the trim above has to fire\n` +
      `   on every build. Cut a dependency, or raise this on purpose, in the commit message,\n` +
      `   knowing the cache is what you are spending. See docs/DEPLOY-SAFETY.md §10.\n` +
      (WARN_ONLY ? `\n   (warn-only: reported, NOT failing this build. LIVE-035.)\n` : ''),
  )
  if (!WARN_ONLY) process.exit(1)
}

// The composition line is not decoration. Nobody could see inside a Vercel build cache before this
// ran, which is why LIVE-029 could only be diagnosed by subtracting two numbers in a log tail.
const kept = cacheParts.filter(([n]) => !dropped.some(([d]) => d === n))
const parts = kept.length > 0 ? kept.map(([n, b]) => `${n} ${mib(b)} MiB`).join(', ') : 'empty'
const unknown = kept
  .map(([n]) => n)
  .filter((n) => !COMPILER_CACHE_DIRS.includes(n) && !NEVER_TRIM_DIRS.includes(n))
// Say which side of the ceiling this lands on, both ways. A "✅ … under the ceiling" line printed
// over a number that is above the ceiling is the swallowed regression this file exists to stop.
const composition =
  `about ${gb(packed(rawTotal))} GB packed (${gib(rawTotal)} GiB raw: node_modules ` +
  `${mib(nodeModules)} MiB + .next/cache ${mib(nextCache)} MiB)`
if (WARN_ONLY) {
  console.log(
    `\nℹ️  check:cache-budget is running in WARN-ONLY mode: it measures and reports, it does not ` +
      `trim and it cannot fail this build (LIVE-035).`,
  )
}
console.log(
  packed(rawTotal) > VERCEL_CEILING_GB * GB
    ? `⚠️  check:cache-budget — Vercel is about to be handed ${composition}, OVER the ` +
      `${VERCEL_CEILING_GB} GB ceiling, and it discards the whole cache above that. ` +
      `The trim cannot help: what is left is not compiler output.`
    : `✅ check:cache-budget — Vercel will store ${composition}, under the ${VERCEL_CEILING_GB} GB ceiling.`,
)
console.log(`   .next/cache holds: ${parts}`)
// The calibration line exists so the next real build can settle the constant instead of inheriting
// it. Pair the raw figure above with the "Uploading build cache [N GB]" line the same build prints.
console.log(
  `   Packed figure is an estimate: raw x ${PACKED_PER_RAW} (measured ${PACKED_PER_RAW_MEASURED} from one ` +
    `build that printed both halves). Compare it with this build's "Uploading build cache" line; if the ` +
    `two have drifted apart, the cache MIX has changed and the ratio wants re-deriving.`,
)
if (unknown.length > 0) {
  console.log(
    `   ⚠️  Not recognised, kept rather than trimmed: ${unknown.join(', ')}. ` +
      `The trim only removes named compiler caches. If one of these is growing, name it in this file on purpose.`,
  )
}
