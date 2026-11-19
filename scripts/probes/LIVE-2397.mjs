#!/usr/bin/env node
// LIVE-2397: three small truths on public words. Every help guide opens the product (Dispatches was the one of 88
// with no door). The posting guide calls a Space's wall Community, its name in the product. /llms.txt never doubles a
// full stop when a door's hero line already ends its sentence.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
const links = readFileSync('lib/help/site-links.ts', 'utf8')
const keys = new Set([...links.matchAll(/^\s+'?([a-z-]+)'?: \[/gm)].map((m) => m[1]))
const missing = []
for (const dir of readdirSync('content/help', { withFileTypes: true }).filter((d) => d.isDirectory())) {
  for (const f of readdirSync(`content/help/${dir.name}`).filter((n) => n.endsWith('.md'))) {
    const head = readFileSync(`content/help/${dir.name}/${f}`, 'utf8').split('---')[1] ?? ''
    if (!/status: published/.test(head)) continue
    const fk = /featureKeys: \[([^\]]*)\]/.exec(head)?.[1].split(',').map((s) => s.trim()).filter(Boolean) ?? []
    if (fk.length > 0 && !fk.some((k) => keys.has(k))) missing.push(`${dir.name}/${f}`)
  }
}
assert.deepEqual(missing, [], 'a published guide has no door into the product')
const posts = readFileSync('content/help/sharing/posts.md', 'utf8')
assert.ok(!posts.includes("[Discussion]") && posts.includes('[Community](/help/groups/talk-on-a-space)'), 'the posting guide names the Community tab')
const llms = readFileSync('app/llms.txt/route.ts', 'utf8')
assert.ok(llms.includes('${sentence(c.hero.h1)}. ${sentence(c.hero.eyebrow)}. ') && !llms.includes('${c.hero.h1}. '), '/llms.txt doubles a full stop after a door hero line')
console.log('LIVE-2397: every guide has a door, the wall is called Community, and llms.txt reads clean')
