// HYG-240: the Next compile (Rust, mimalloc) keeps freed pages resident, and the container counts them. Measured on
// Vercel previews 2026-11-15 with the HYG-224 sampler: MIMALLOC_PURGE_DELAY=0 took the container peak from 7937 MB
// to 7636 MB (8 GB machine). Exits 1 when the build script does not set it.
import { readFileSync } from 'node:fs'
const build = JSON.parse(readFileSync('package.json', 'utf8')).scripts?.build ?? ''
const ok = /(^|\s)MIMALLOC_PURGE_DELAY=0\s+next build$/.test(build)
console.log(`${ok ? 'ok  ' : 'FAIL'} package.json build sets MIMALLOC_PURGE_DELAY=0 (${build})`)
process.exit(ok ? 0 : 1)
