// LIVE-1211: no build depends on a Google Fonts download. Every face is a committed file read by
// next/font/local, so a Google or gstatic outage cannot fail a deploy (DEPLOY-SAFETY rule 9).
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import assert from 'node:assert/strict'

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.name === 'node_modules' || e.name === '.next') continue
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = ['app', 'components', 'lib'].flatMap((d) => walk(d))
const google = files.filter((f) => readFileSync(f, 'utf8').includes("next/font/google") && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
assert.deepEqual(google, [], `still imports next/font/google: ${google.join(', ')}`)

let checked = 0
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  if (!s.includes('next/font/local')) continue
  for (const m of s.matchAll(/(?:src:\s*|path:\s*)['"]([^'"]+\.(?:woff2|ttf|otf))['"]/g)) {
    const target = resolve(dirname(f), m[1])
    assert.ok(existsSync(target), `${f} points at ${m[1]}, which is not in the repo`)
    checked++
  }
}
assert.ok(checked >= 30, `expected at least 30 committed font files in use, saw ${checked}`)
console.log(`${checked} font files, none fetched from Google`)
