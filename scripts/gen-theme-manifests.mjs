#!/usr/bin/env node
// Regenerates lib/themes/manifests/*.manifest.json (LIVE-1857). The generator lives in
// lib/themes/manifests.test.ts because the sources are TypeScript; this runs it in write mode.
import { spawnSync } from 'node:child_process'
const r = spawnSync('pnpm', ['vitest', 'run', 'lib/themes/manifests.test.ts'], { stdio: 'inherit', env: { ...process.env, UPDATE_THEME_MANIFESTS: '1' } })
process.exit(r.status ?? 1)
