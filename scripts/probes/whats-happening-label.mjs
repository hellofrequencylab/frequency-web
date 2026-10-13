// LIVE-906 (ADR-1738): no member-facing string still says "What's On". The consequence is the
// words a member reads, so this scans string literals and JSX text, never comments, and lets the
// composer prompt "What's on your mind?" through (NAMING.md collision guard).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['app', 'components', 'lib', 'content']
const OLD = /what['’]s on\b(?!\s+(your|screen))/i
const hits = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) { walk(path); continue }
    if (!/\.(tsx?|mdx?)$/.test(name) || /\.test\./.test(name)) continue
    readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
      const code = /\.mdx?$/.test(name) ? line : line.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/\s\/\/.*$/, '')
      if (OLD.test(code)) hits.push(`${path}:${i + 1}: ${line.trim()}`)
    })
  }
}
ROOTS.forEach(walk)

if (hits.length) {
  console.error(`"What's On" still reaches members (${hits.length}):\n${hits.join('\n')}`)
  process.exit(1)
}
console.log(`No member-facing "What's On" left; the label reads "What's happening".`)
