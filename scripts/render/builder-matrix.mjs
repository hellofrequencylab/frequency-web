#!/usr/bin/env node
// pnpm audit:builder-matrix (BLD-901): the full builder matrix, role x variant x theme x surface x device (1600, 1200,
// 900, 390). Builds the site CSS, draws every role variant in every theme's own token sheet, then measures each at every
// width the surfaces give those devices: horizontal overflow, zero height and text contrast, with coverage over the
// declared cells. Exits 1 on any overflow, zero-height section or coverage under 1.00. Contrast findings are listed;
// CONTRAST_FAIL=1 makes them fail too. Output: .builder-matrix/ (HTML per theme, cells.json, matrix.json).
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const out = resolve(process.env.RENDER_OUT || '.builder-matrix')
mkdirSync(out, { recursive: true })
const run = (cmd, args, env = {}) => { const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } }); if (r.status) process.exit(r.status) }
run('node', ['scripts/render/build-css.mjs', `${out}/app.css`])
run('pnpm', ['exec', 'vitest', 'run', '-c', 'scripts/render/vitest.render.config.ts', 'scripts/render/builder-matrix.render.tsx'], { RENDER_OUT: out })
run('node', ['scripts/render/builder-matrix-shots.mjs', out, '--json', `${out}/matrix.json`])
