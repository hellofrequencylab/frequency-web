#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// KEEP A HANDLE ON THE COMPILER CACHE THIS BUILD STARTED FROM (HYG-140, ADR-1656).
//
// Runs as `prebuild`, before `next build` writes anything. It links the restored Turbopack cache
// into `.next/cache/turbopack-restored`, so that `check:cache-budget` in `postbuild` can put that
// generation back when the one this build wrote no longer fits, instead of deleting the compiler
// cache and making the next build compile cold. The decision, and the reason for it, live in
// scripts/check-cache-budget.mjs next to HELD_DIR. This file only takes the snapshot.
//
// WHY A HARD-LINK SNAPSHOT IS SAFE AND FREE. `.next/cache/turbopack/<version>/` is one
// log-structured database: numbered `.sst` tables, `.meta` files that index them, `.blob` files for
// large values, plus `CURRENT`, `LOG` and `.del` bookkeeping. The numbered files are written once and
// never modified in place; a later build writes NEW numbered files and unlinks the ones a compaction
// replaced. Measured 2026-09-29 on a Next 16.3.6 Turbopack build: a hard-link snapshot's md5 sums
// were unchanged across three warm builds, one of which compacted and deleted tables, and a
// build started from the snapshot put back in place completed warm. So the numbered files are
// LINKED (zero bytes of disk, a few milliseconds), and every other file is COPIED, because
// `CURRENT` and `LOG` are rewritten in place and a link would carry the new build's bytes back.
//
// 🔴 IT NEVER FAILS A BUILD. Anything unexpected (a symlink or other special file inside the cache,
// a link the filesystem refuses) removes the partial snapshot and says so. With no snapshot the
// gate simply trims as it always has, so the worst case of this file is the old behaviour.
// ─────────────────────────────────────────────────────────────────────────────
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

// Must equal HELD_DIR in scripts/check-cache-budget.mjs (scripts/check-cache-budget-hold.test.ts
// fails if the two drift). It sits INSIDE .next/cache because `next build` empties the rest of
// .next before it starts, and the gate removes it before Vercel packs the cache.
const HELD_DIR = 'turbopack-restored'

// The write-once files of Turbopack's persistence database. Everything else is copied.
const LINKABLE = /\.(sst|meta|blob)$/

const ROOT = process.cwd()
const cache = path.join(ROOT, '.next', 'cache')
const live = path.join(cache, 'turbopack')
const held = path.join(cache, HELD_DIR)

let linked = 0
let copied = 0

function snapshot(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) {
      snapshot(src, dst)
    } else if (entry.isFile() && LINKABLE.test(entry.name)) {
      linkSync(src, dst)
      linked += 1
    } else if (entry.isFile()) {
      copyFileSync(src, dst)
      copied += 1
    } else {
      // A snapshot that silently skipped a file would put back a database with a hole in it.
      throw new Error(`${path.relative(ROOT, src)} is neither a file nor a directory`)
    }
  }
}

try {
  // A snapshot left behind by an interrupted local build describes some older cache. Never reuse it.
  rmSync(held, { recursive: true, force: true })
  if (!existsSync(live)) {
    console.log('ℹ️  snapshot-turbopack-cache: no Turbopack cache was restored, so this build compiles cold and has nothing to hold.')
  } else {
    snapshot(live, held)
    console.log(
      `♻️  snapshot-turbopack-cache: linked the restored Turbopack cache (${linked} tables linked, ${copied} ` +
        `bookkeeping files copied) so check:cache-budget can keep it if this build's cache outgrows the trim point (HYG-140).`,
    )
  }
} catch (err) {
  try {
    rmSync(held, { recursive: true, force: true })
  } catch {
    /* the gate removes it before upload either way */
  }
  console.log(
    `⚠️  snapshot-turbopack-cache: no snapshot this build (${err && err.message}). ` +
      `check:cache-budget will trim instead of hold if the cache is over its trim point.`,
  )
}
process.exit(0)
