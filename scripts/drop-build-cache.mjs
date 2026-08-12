// ─────────────────────────────────────────────────────────────────────────────
// DROP THE RESTORED TURBOPACK BUILD CACHE (ADR-1001).
//
// Runs from `prebuild`, which fires AFTER the CI provider has restored .next/cache and BEFORE
// `next build` starts. That window is the only place this can work.
//
// WHY. ADR-1001 pinned `experimental.turbopackFileSystemCacheForBuild: false`, so nothing reads
// .next/cache/turbopack during a build any more. But turning off the READER does not stop the
// provider: Vercel still restores the ~1.2GB cache into the container at the start and re-uploads
// it at the end. That is pure cost now — it fills the disk that "Deploying outputs" needs, which
// is the ENOSPC that took production down on 2026-08-12, and it does not buy a single warm module.
//
// So delete it. After one build the stored cache is small, and it stays small.
//
// SAFE TO RUN ANYWHERE. It only ever removes .next/cache/turbopack:
//   - `next dev` caches to .next/dev/cache/turbopack, a DIFFERENT path, so local iteration is
//     untouched.
//   - The directory usually does not exist (a fresh clone, a cold container). `force: true`
//     makes that a no-op rather than an error.
//   - It never touches source, node_modules, or build output.
//
// Node's own fs is used rather than `rm -rf` so the script behaves the same on every platform
// and cannot be surprised by a shell.
// ─────────────────────────────────────────────────────────────────────────────

import { rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const target = join(process.cwd(), '.next', 'cache', 'turbopack')

let existed = false
try {
  existed = statSync(target).isDirectory()
} catch {
  // Not there. Nothing to do, and that is the common case.
}

rmSync(target, { recursive: true, force: true })

// Say so in the build log. When this line is absent the cache was never restored; when it is
// present it is the receipt that the disk was reclaimed before the build asked for it.
if (existed) console.log('[build] removed restored .next/cache/turbopack (ADR-1001)')
