/// <reference types="node" />
import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { EDITOR_ROUTES, FINGERPRINTS, chunkRefs, packagesIn, readArtifact, report, verdict } from './check-editor-bundle-bytes.mjs'

// THE BUNDLE-BYTE INSTRUMENT (PROG-E0B), proven on fixtures because this box cannot build.
//
// What these cases prove: the verdict in both directions, the manifest shapes it reads, that each
// fingerprint is a real literal in the installed package, and that the script as `postbuild` runs it
// cannot exit non-zero on a leak, a missing artifact, or its own crash.
// What they cannot prove: that a real Vercel artifact has the shape the fixtures have. That takes
// one production build log, and it is why the last test pins the instrument as advisory.

const SCRIPT = join(import.meta.dirname, 'check-editor-bundle-bytes.mjs')
const YJS = FINGERPRINTS[0].needles[0]
const CANVAS = '(main)/pages/canvas/page'

const temps: string[] = []
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true })
})

type Route = { entry?: string[]; client?: string[] }

/** A synthetic `.next`: client chunks under static/, one client-reference manifest per route. */
function artifact(chunks: Record<string, string>, routes: Record<string, Route>, root = 'static/chunks'): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'editor-bundle-bytes-')))
  temps.push(dir)
  const write = (rel: string, text: string) => {
    const file = join(dir, '.next', rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  for (const [name, text] of Object.entries(chunks)) write(`${root}/${name}`, text)
  for (const [route, r] of Object.entries(routes)) {
    const entry = {
      entryJSFiles: { [`[project]/app/${route}`]: (r.entry ?? []).map((c) => `${root}/${c}`) },
      clientModules: Object.fromEntries((r.client ?? []).map((c, i) => [`m${i}`, { id: i, name: '*', chunks: [`/_next/${root}/${c}`], async: false }])),
    }
    write(
      `server/app/${route}_client-reference-manifest.js`,
      `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify('/' + route)}]=${JSON.stringify(entry)};`,
    )
  }
  return dir
}

const CHUNKS = {
  'shell.js': 'console.log("Light or dark")',
  'canvas.js': `var a="${YJS} and will lead to issues!";` + 'x'.repeat(4000),
  'collab-lazy.js': 'globalThis["__ $YJS$ __"]=true;' + 'y'.repeat(1000),
}
const clean = () =>
  artifact(CHUNKS, {
    [CANVAS]: { entry: ['shell.js'], client: ['canvas.js'] },
    '(main)/feed/page': { entry: ['shell.js'] },
    '(marketing)/page': { entry: ['shell.js'] },
  })
const leaky = () =>
  artifact(CHUNKS, {
    [CANVAS]: { entry: ['shell.js'], client: ['canvas.js'] },
    '(marketing)/page': { entry: ['shell.js', 'canvas.js'] },
  })

const run = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })

describe('the verdict', () => {
  it('passes a build where only the editor route names a chunk that carries the runtime, and counts its bytes', () => {
    const v = verdict(readArtifact(join(clean(), '.next')))
    expect(v.state).toBe('clean')
    expect(v.routesRead).toBe(3)
    expect(v.editor).toEqual([{ route: `/${CANVAS}`, bytes: CHUNKS['canvas.js'].length, chunks: ['canvas.js'] }])
    expect(v.editorBytes).toBe(CHUNKS['canvas.js'].length)
    // The chunk no manifest names is lazy: counted, and not called a leak.
    expect(v.lazy).toEqual({ chunks: ['collab-lazy.js'], bytes: CHUNKS['collab-lazy.js'].length })
    expect(v.carrierBytes).toBe(CHUNKS['canvas.js'].length + CHUNKS['collab-lazy.js'].length)
  })

  it('reports a leak, by route and chunk, when a route outside the editor names a carrier', () => {
    const v = verdict(readArtifact(join(leaky(), '.next')))
    expect(v.state).toBe('leak')
    expect(v.leaks).toEqual([{ route: '/(marketing)/page', chunk: 'canvas.js', bytes: CHUNKS['canvas.js'].length, packages: ['yjs'] }])
    expect(report(v).join('\n')).toContain('/(marketing)/page  ->  canvas.js')
  })

  it('catches a leak that arrives through a client module rather than the entry files', () => {
    const dir = artifact(CHUNKS, { [CANVAS]: { client: ['canvas.js'] }, '(main)/spaces/[slug]/page': { entry: ['shell.js'], client: ['collab-lazy.js'] } })
    const v = verdict(readArtifact(join(dir, '.next')))
    expect(v.state).toBe('leak')
    expect(v.leaks.map((l) => l.chunk)).toEqual(['collab-lazy.js'])
  })

  it('reads chunks from static/immutable/chunks, where Vercel puts them', () => {
    const dir = artifact(CHUNKS, { [CANVAS]: { client: ['canvas.js'] }, '(marketing)/page': { entry: ['canvas.js'] } }, 'static/immutable/chunks')
    expect(verdict(readArtifact(join(dir, '.next'))).state).toBe('leak')
  })

  it('does not read the server copies, which carry the same literals on every route', () => {
    const dir = clean()
    mkdirSync(join(dir, '.next/server/chunks/ssr'), { recursive: true })
    writeFileSync(join(dir, '.next/server/chunks/ssr/shell.js'), CHUNKS['canvas.js'])
    const v = verdict(readArtifact(join(dir, '.next')))
    expect(v.state).toBe('clean')
    expect(v.carrierBytes).toBe(CHUNKS['canvas.js'].length + CHUNKS['collab-lazy.js'].length)
  })

  it('will not call a build clean when it could not look', () => {
    const noCarriers = verdict({ routes: [{ route: `/${CANVAS}`, chunks: ['a.js'] }], carriers: [] })
    expect(noCarriers.state).toBe('indeterminate')
    expect(verdict({ routes: [], carriers: [{ chunk: 'a.js', bytes: 1, packages: ['yjs'] }] }).state).toBe('indeterminate')
    // The editor route was renamed: the allowlist is stale, and "nothing leaked" would be vacuous.
    const moved = verdict({ routes: [{ route: '/(main)/feed/page', chunks: [] }], carriers: [{ chunk: 'a.js', bytes: 1, packages: ['yjs'] }] })
    expect(moved.state).toBe('indeterminate')
    expect(moved.reason).toContain('EDITOR_ROUTES')
  })

  it('a leak outranks cannot-look, so a small fixture still proves the arm', () => {
    const v = verdict({ routes: [{ route: '/(marketing)/page', chunks: ['a.js'] }], carriers: [{ chunk: 'a.js', bytes: 9, packages: ['yjs'] }] })
    expect(v.state).toBe('leak')
  })
})

describe('the manifest reader', () => {
  it('takes entry files and client module chunks, as a path or a /_next/ URL, and ignores chunk ids', () => {
    const refs = chunkRefs({
      entryJSFiles: { '[project]/app/layout': ['static/chunks/a.js', 'static/chunks/b.css'] },
      clientModules: { x: { chunks: ['/_next/static/immutable/chunks/c.js?dpl=1'] }, y: { chunks: [4471, 'static/chunks/d.js'] }, z: {} },
    })
    expect(refs.sort()).toEqual(['a.js', 'c.js', 'd.js'])
    expect(chunkRefs(undefined)).toEqual([])
  })
})

describe('the fingerprints', () => {
  it.each(FINGERPRINTS)('$pkg: a needle is a literal in the installed package ($source)', (f) => {
    // If an upgrade drops the literal, this fails here instead of the instrument going blind.
    const source = readFileSync(f.source, 'utf8')
    expect(f.needles.some((n) => source.includes(n))).toBe(true)
  })

  it('finds the runtime in the real yjs build, and nothing in ordinary code', () => {
    expect(packagesIn(readFileSync('node_modules/yjs/dist/yjs.mjs', 'utf8'))).toContain('yjs')
    expect(packagesIn(readFileSync(SCRIPT.replace('bundle-bytes', 'crdt-importers'), 'utf8'))).toEqual([])
  })

  it('covers every CRDT runtime package the app depends on', () => {
    // Adding y-protocols (or any y-*) without a fingerprint would leave it invisible here.
    const deps = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies)
    const runtime = deps.filter((d) => d === 'yjs' || /^y-/.test(d))
    expect(runtime.length).toBeGreaterThan(0)
    for (const d of runtime) expect(FINGERPRINTS.map((f) => f.pkg)).toContain(d)
  })

  it('the editor route it allows is a real route', () => {
    expect(EDITOR_ROUTES.some((re) => re.test(`/${CANVAS}`))).toBe(true)
    expect(readFileSync(`app/${CANVAS}.tsx`, 'utf8')).toContain('collab-canvas')
  })
})

describe('advisory: the script postbuild runs cannot fail a build', () => {
  it('prints the gate line and exits 0 on a clean build', () => {
    const r = run(clean())
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^✅ check:editor-bundle-bytes - /)
    expect(r.stdout).toContain(`/${CANVAS}  4.0 KB`)
  })

  it('exits 0 on a leak and still names it; --strict exits 1 on the same artifact', () => {
    const dir = leaky()
    const advisory = run(dir)
    expect(advisory.status).toBe(0)
    expect(advisory.stdout).toMatch(/^⚠️ check:editor-bundle-bytes - /)
    expect(advisory.stdout).toContain('/(marketing)/page  ->  canvas.js')
    const strict = run(dir, '--strict')
    expect(strict.status).toBe(1)
    expect(strict.stdout).toMatch(/^❌ check:editor-bundle-bytes - /)
  })

  it('exits 0 with no .next and with an empty one; --strict says it could not look', () => {
    const bare = realpathSync(mkdtempSync(join(tmpdir(), 'editor-bundle-bytes-')))
    temps.push(bare)
    expect(run(bare).status).toBe(0)
    expect(run(bare, '--strict').status).toBe(79)
    mkdirSync(join(bare, '.next/server/app'), { recursive: true })
    const empty = run(bare)
    expect(empty.status).toBe(0)
    expect(empty.stdout).toContain('read no route manifests')
    expect(run(bare, '--strict').status).toBe(79)
  })

  it('exits 0 on its own crash and says it crashed; --strict does not', () => {
    // A directory named like a chunk makes the chunk read throw (EISDIR): a real crash, not a mock.
    const dir = clean()
    mkdirSync(join(dir, '.next/static/chunks/trap.js'))
    const r = run(dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('CRASHED')
    expect(r.stdout).toMatch(/^⚠️ check:editor-bundle-bytes - /)
    expect(run(dir, '--strict').status).toBe(79)
  })

  it('skips a manifest it cannot load instead of dying on it', () => {
    const dir = clean()
    writeFileSync(join(dir, '.next/server/app/broken_client-reference-manifest.js'), 'throw new Error("nope")')
    const r = run(dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('routes read: 3')
  })
})

describe('postbuild wiring', () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>

  it('is runnable on demand', () => {
    expect(scripts['check:editor-bundle-bytes']).toBe('node scripts/check-editor-bundle-bytes.mjs')
  })

  it('runs in postbuild as advisory only, last, and never --strict', () => {
    // ⚠️ WHEN ARMING IT: this test fails on purpose. A build-blocking gate that has never seen a real
    // artifact is the 2026-08-11 incident with the roles reversed (docs/DEPLOY-SAFETY.md). Change
    // this pin in the SAME change as the production build log that shows the instrument's reading is
    // right, and say so on the PROG-E0 row.
    const postbuild = scripts.postbuild ?? ''
    expect(postbuild.endsWith('&& (node scripts/check-editor-bundle-bytes.mjs || true)')).toBe(true)
    expect(postbuild).not.toContain('--strict')
    expect(postbuild.split('check-editor-bundle-bytes.mjs')).toHaveLength(2)
  })
})
