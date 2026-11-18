#!/usr/bin/env node
// SEC-025: production responses do not advertise the framework. Live, a dynamic page answered with
// `x-powered-by: Next.js` (2026-11-18, /classifieds/<id>); Next sends it unless poweredByHeader is off.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8')
const cfg = src.slice(src.indexOf('const nextConfig: NextConfig = {'))
if (!/\n\s*poweredByHeader: false,/.test(cfg)) {
  console.error('SEC-025 FAIL: next.config.ts does not set poweredByHeader: false, so dynamic responses send x-powered-by: Next.js')
  process.exit(1)
}
console.log('SEC-025 ok: poweredByHeader is off')
