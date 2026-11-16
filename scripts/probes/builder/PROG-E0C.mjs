// PROG-E0C: the bundle-byte gate blocks a build. Three consequences, each measured by running the real thing:
//   1. package.json's postbuild runs scripts/check-editor-bundle-bytes.mjs bare, chained with &&, with nothing that
//      swallows its exit code (no `|| true`, no `--warn-only`, no `;`).
//   2. The script, run the way postbuild runs it (no flags, cwd at the tree), exits non-zero on a fixture artifact where
//      a public route names a chunk carrying the CRDT runtime, and exits 0 on the same artifact without that reference.
//   3. It does not pass when it could not look: no `.next`, and manifests whose chunk names resolve to nothing on disk,
//      both exit non-zero with a code that is not the leak code.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bad = []
const SCRIPT = path.resolve('scripts/check-editor-bundle-bytes.mjs')
if (!fs.existsSync(SCRIPT)) { console.error(`missing ${SCRIPT}`); process.exit(1) }

const postbuild = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts?.postbuild ?? ''
const steps = postbuild.split('&&').map((s) => s.trim())
const step = steps.filter((s) => s.includes('check-editor-bundle-bytes.mjs'))
if (step.length !== 1) bad.push(`postbuild must run the gate exactly once as its own && step, found ${step.length}`)
else if (step[0] !== 'node scripts/check-editor-bundle-bytes.mjs') bad.push(`postbuild must run the gate bare, got: ${step[0]}`)
if (/\|\||;/.test(postbuild)) bad.push('postbuild holds a `||` or `;`, which can swallow a gate\'s exit code')

const { FINGERPRINTS } = await import(SCRIPT)
const carrier = `var a=${JSON.stringify(FINGERPRINTS[0].needles[0])};` + 'x'.repeat(2048)

/** A synthetic tree with a `.next` in it. `publicChunks` is what the public route names; `rename` breaks every reference. */
function build(publicChunks, rename = (c) => c) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prog-e0c-')))
  const write = (rel, text) => { const f = path.join(dir, '.next', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text) }
  write('static/chunks/shell.js', 'console.log(1)')
  write('static/chunks/canvas.js', carrier)
  const manifest = (route, entry, client) => write(
    `server/app/${route}_client-reference-manifest.js`,
    `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify('/' + route)}]=${JSON.stringify({
      entryJSFiles: { [`[project]/app/${route}`]: entry.map((c) => `static/chunks/${rename(c)}`) },
      clientModules: Object.fromEntries(client.map((c, i) => [`m${i}`, { chunks: [`/_next/static/chunks/${rename(c)}`] }])),
    })};`,
  )
  manifest('(main)/pages/canvas/page', ['shell.js'], ['canvas.js'])
  manifest('(marketing)/page', publicChunks, [])
  return dir
}
const run = (cwd) => spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' })

const dirs = {
  clean: build(['shell.js']),
  leak: build(['shell.js', 'canvas.js']),
  blind: build(['shell.js'], (c) => `renamed-${c}`),
  empty: fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prog-e0c-'))),
}
try {
  const clean = run(dirs.clean)
  if (clean.status !== 0) bad.push(`a clean artifact must exit 0, got ${clean.status}: ${clean.stdout.split('\n')[0]}`)

  const leak = run(dirs.leak)
  if (leak.status !== 1) bad.push(`CRDT bytes on a public route must fail the build with exit 1, got ${leak.status}`)
  if (!leak.stdout.includes('/(marketing)/page  ->  canvas.js')) bad.push('the failure must name the route and the chunk')

  for (const [name, why] of [['blind', 'chunk names that resolve to nothing on disk'], ['empty', 'no .next']]) {
    const r = run(dirs[name])
    if (r.status === 0) bad.push(`${why}: the gate exited 0 without having looked`)
    if (r.status === 1) bad.push(`${why}: the gate reported a leak it did not find`)
  }
} finally {
  for (const d of Object.values(dirs)) fs.rmSync(d, { recursive: true, force: true })
}

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
