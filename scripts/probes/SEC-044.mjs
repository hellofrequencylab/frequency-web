#!/usr/bin/env node
// SEC-044: every YouTube player Frequency builds (course lesson videos, lib/video-embed.ts; Spotlight
// media embeds, lib/spotlight/embeds.ts) loads from youtube-nocookie.com, YouTube's privacy-enhanced
// player, which sets no tracking cookie until the visitor plays the video. Before, both built
// www.youtube.com/embed srcs, which drop YouTube cookies on page load, before any cookie consent.
// Both CSP frame-src lists must allow the nocookie host. Runs the two pinned test files.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const bad = []
for (const f of ['lib/video-embed.ts', 'lib/spotlight/embeds.ts']) {
  const src = fs.readFileSync(f, 'utf8')
  if (/https:\/\/www\.youtube\.com\/embed/.test(src)) bad.push(`${f} still builds a www.youtube.com/embed src`)
  if (!/https:\/\/www\.youtube-nocookie\.com\/embed/.test(src)) bad.push(`${f} builds no youtube-nocookie src`)
}
for (const f of ['next.config.ts', 'lib/security/csp-nonce.ts']) {
  const frame = fs.readFileSync(f, 'utf8').match(/"frame-src ([^"]+)"/)?.[1] ?? ''
  if (!frame.split(/\s+/).includes('https://www.youtube-nocookie.com')) bad.push(`${f} frame-src does not allow https://www.youtube-nocookie.com`)
}
if (bad.length) { console.error('SEC-044 FAIL:\n  ' + bad.join('\n  ')); process.exit(1) }
const r = spawnSync('pnpm', ['-s', 'vitest', 'run', 'lib/video-embed.test.ts', 'lib/spotlight/embeds.test.ts'], { stdio: 'inherit' })
if (r.status !== 0) { console.error('SEC-044 FAIL: the embed tests fail'); process.exit(1) }
console.log('SEC-044 ok: lesson and Spotlight YouTube players use youtube-nocookie.com and both CSP lists allow it')
