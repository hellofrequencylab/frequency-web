// PROG-E0B: the bundle-byte instrument reads a built artifact and tells a leak from a clean build. This probe builds two
// small `.next` trees on disk and runs the instrument's own reader and verdict over them: a public route that names a chunk
// carrying yjs must be reported by route and chunk, and the same tree without that reference must pass with the editor
// route's bytes counted. It also holds the wiring: runnable on demand, in postbuild as advisory only (never --strict), and
// each fingerprint a real literal in the installed package.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bad = []
const SCRIPT = 'scripts/check-editor-bundle-bytes.mjs'
if (!fs.existsSync(SCRIPT)) { console.error(`missing ${SCRIPT}`); process.exit(1) }
const { FINGERPRINTS, readArtifact, verdict } = await import(path.resolve(SCRIPT))

const marker = FINGERPRINTS[0].needles[0]
const carrier = `var a=${JSON.stringify(marker)};` + 'x'.repeat(2048)
function build(publicChunks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prog-e0b-'))
  const write = (rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text) }
  write('static/chunks/shell.js', 'console.log(1)')
  write('static/chunks/canvas.js', carrier)
  const manifest = (route, entry, client) => write(
    `server/app/${route}_client-reference-manifest.js`,
    `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify('/' + route)}]=${JSON.stringify({
      entryJSFiles: { [`[project]/app/${route}`]: entry.map((c) => `static/chunks/${c}`) },
      clientModules: Object.fromEntries(client.map((c, i) => [`m${i}`, { chunks: [`/_next/static/chunks/${c}`] }])),
    })};`,
  )
  manifest('(main)/pages/canvas/page', ['shell.js'], ['canvas.js'])
  manifest('(marketing)/page', publicChunks, [])
  return dir
}

const dirs = [build(['shell.js']), build(['shell.js', 'canvas.js'])]
try {
  const clean = verdict(readArtifact(dirs[0]))
  if (clean.state !== 'clean') bad.push(`a build with yjs only on the editor route must pass, got ${clean.state}: ${clean.reason}`)
  if (clean.editorBytes !== carrier.length) bad.push(`the editor route's bytes must be counted (${carrier.length}), got ${clean.editorBytes}`)

  const leak = verdict(readArtifact(dirs[1]))
  if (leak.state !== 'leak') bad.push(`a public route that names a yjs chunk must be a leak, got ${leak.state}`)
  if (!leak.leaks.some((l) => l.route === '/(marketing)/page' && l.chunk === 'canvas.js')) bad.push('the leak must name the route and the chunk')
} finally {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
}

for (const f of FINGERPRINTS) {
  const src = fs.existsSync(f.source) ? fs.readFileSync(f.source, 'utf8') : ''
  if (!f.needles.some((n) => src.includes(n))) bad.push(`fingerprint for ${f.pkg} is not in ${f.source}, so the instrument is blind to it`)
}

const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts
if (!/check-editor-bundle-bytes\.mjs/.test(scripts['check:editor-bundle-bytes'] ?? '')) bad.push('pnpm check:editor-bundle-bytes must run the instrument')
const step = /check-editor-bundle-bytes\.mjs([^&;)]*)/.exec(scripts.postbuild ?? '')
if (!step) bad.push('the instrument must run in postbuild, the only place a real artifact exists')
else if (/--strict/.test(step[1]) || !/\|\|\s*true/.test(step[1])) bad.push('postbuild must run it advisory (no --strict, and unable to fail the build) until it has read one real artifact')
if (!fs.existsSync('scripts/check-editor-bundle-bytes.test.ts')) bad.push('the fixture test must exist')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
