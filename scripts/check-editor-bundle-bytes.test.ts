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
// fingerprint is a real literal in the installed package, and every way the script `postbuild` runs
// can exit: 0 only on a clean artifact, 1 only on a leak, 79 when it could not look (and never 0
// there), with `--warn-only` unable to fail on any arm.
// What they cannot prove: that a real Vercel artifact has the shape the fixtures have. One
// production build log did (PROG-E0C: 633 routes read, the canvas route at 116.6 KB, nothing else
// named), and that reading is why the last test now pins the gate as BLOCKING.

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

  it('will not call a build clean when the chunk names in the manifests resolve to nothing on disk', () => {
    // A compiler upgrade that renames chunk references would otherwise read as "all lazy, no leak".
    const dir = clean()
    const read = readArtifact(join(dir, '.next'))
    expect(read.chunksOnDisk.sort()).toEqual(['canvas.js', 'collab-lazy.js', 'shell.js'])
    const renamed = { ...read, routes: read.routes.map((r) => ({ ...r, chunks: r.chunks.map((c) => `v2-${c}`) })) }
    const v = verdict(renamed)
    expect(v.state).toBe('indeterminate')
    expect(v.reason).toContain('manifest shape changed')
    // One resolvable name anywhere is enough: the arm detects a blind read, it does not audit every route.
    expect(verdict(read).state).toBe('clean')
  })

  it('warns, without failing, about a manifest that would not load; fails once most of them will not', () => {
    const dir = clean()
    writeFileSync(join(dir, '.next/server/app/broken_client-reference-manifest.js'), 'throw new Error("nope")')
    const read = readArtifact(join(dir, '.next'))
    expect(read.skipped).toEqual(['server/app/broken_client-reference-manifest.js'])
    const one = verdict(read)
    expect(one.state).toBe('clean')
    expect(one.warnings.join('\n')).toContain('1 route manifest(s) would not load')
    expect(report(one).join('\n')).toContain('⚠️ 1 route manifest(s) would not load')
    const most = verdict({ ...read, skipped: ['a', 'b', 'c', 'd'] })
    expect(most.state).toBe('indeterminate')
    expect(most.reason).toContain('manifest format changed')
    // The floor is "more unreadable than read": as many as were read is still a warning.
    expect(verdict({ ...read, skipped: ['a', 'b', 'c'] }).state).toBe('clean')
  })

  it('warns, without failing, when the editor route names no carrier (the canvas went lazy)', () => {
    const dir = artifact(CHUNKS, { [CANVAS]: { entry: ['shell.js'] }, '(main)/feed/page': { entry: ['shell.js'] } })
    const v = verdict(readArtifact(join(dir, '.next')))
    expect(v.state).toBe('clean')
    expect(v.editorBytes).toBe(0)
    expect(v.warnings.join('\n')).toContain('the editor route names no chunk that carries the runtime')
    expect(verdict(readArtifact(join(clean(), '.next'))).warnings).toEqual([])
  })

  it('does not take a directory named like a chunk for a chunk', () => {
    const dir = clean()
    mkdirSync(join(dir, '.next/static/chunks/trap.js'))
    const read = readArtifact(join(dir, '.next'))
    expect(read.chunksOnDisk).not.toContain('trap.js')
    expect(verdict(read).state).toBe('clean')
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

/** A manifest that loads and then makes the reader throw while it walks it: a real crash, not a mock. */
const CRASHER = 'globalThis.__RSC_MANIFEST=new Proxy({},{ownKeys(){throw new Error("trap")}})'
const crashing = () => {
  const dir = clean()
  writeFileSync(join(dir, '.next/server/app/zz_client-reference-manifest.js'), CRASHER)
  return dir
}
const bare = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'editor-bundle-bytes-')))
  temps.push(dir)
  return dir
}

describe('blocking: every way the script postbuild runs can exit', () => {
  it('exits 0 on a clean build and prints the gate line with the editor bytes', () => {
    const r = run(clean())
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^✅ check:editor-bundle-bytes - /)
    expect(r.stdout).toContain(`/${CANVAS}  4.0 KB`)
  })

  it('exits 1 on a leak, and names the route and the chunk', () => {
    const r = run(leaky())
    expect(r.status).toBe(1)
    expect(r.stdout).toMatch(/^❌ check:editor-bundle-bytes - /)
    expect(r.stdout).toContain('/(marketing)/page  ->  canvas.js')
    expect(r.stdout).toContain('Do not widen EDITOR_ROUTES')
  })

  it('exits 79, never 0 and never the leak code, with no .next', () => {
    const r = run(bare())
    expect(r.status).toBe(79)
    expect(r.stdout).toMatch(/^❌ check:editor-bundle-bytes - no \.next\//)
  })

  it('exits 79 on an artifact with no route manifests', () => {
    const dir = bare()
    mkdirSync(join(dir, '.next/server/app'), { recursive: true })
    const r = run(dir)
    expect(r.status).toBe(79)
    expect(r.stdout).toMatch(/^❌ check:editor-bundle-bytes - COULD NOT LOOK: read no route manifests/)
  })

  it('exits 79 when the runtime is in no client chunk at all', () => {
    const r = run(artifact({ 'shell.js': CHUNKS['shell.js'] }, { [CANVAS]: { entry: ['shell.js'] } }))
    expect(r.status).toBe(79)
    expect(r.stdout).toContain('COULD NOT LOOK: found the CRDT runtime in no client chunk')
  })

  it('exits 79 when no manifest is the editor route', () => {
    const r = run(artifact(CHUNKS, { '(main)/feed/page': { entry: ['shell.js'] } }))
    expect(r.status).toBe(79)
    expect(r.stdout).toContain('EDITOR_ROUTES')
  })

  it('exits 79 when the manifests name chunks that are not on disk', () => {
    const r = run(artifact(CHUNKS, { [CANVAS]: { entry: ['gone-a.js'], client: ['gone-b.js'] }, '(main)/feed/page': { entry: ['gone-a.js'] } }))
    expect(r.status).toBe(79)
    expect(r.stdout).toContain('manifest shape changed')
  })

  it('exits 79 when more manifests fail to load than load', () => {
    const dir = artifact(CHUNKS, { [CANVAS]: { client: ['canvas.js'] } })
    for (const n of ['a', 'b']) writeFileSync(join(dir, `.next/server/app/${n}_client-reference-manifest.js`), 'throw new Error("nope")')
    const r = run(dir)
    expect(r.status).toBe(79)
    expect(r.stdout).toContain('manifest format changed')
  })

  it('exits 79 on its own crash and says it crashed', () => {
    const r = run(crashing())
    expect(r.status).toBe(79)
    expect(r.stdout).toMatch(/^❌ check:editor-bundle-bytes - CRASHED/)
  })

  it('a leak still exits 1 when a cannot-look condition is also true', () => {
    // No editor route in this artifact (79 on its own), and a public route names a carrier: the finding wins.
    const r = run(artifact(CHUNKS, { '(marketing)/page': { entry: ['canvas.js'] } }))
    expect(r.status).toBe(1)
  })

  it('exits 0 with a loud warning line when one manifest will not load', () => {
    const dir = clean()
    writeFileSync(join(dir, '.next/server/app/broken_client-reference-manifest.js'), 'throw new Error("nope")')
    const r = run(dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('routes read: 3')
    expect(r.stdout).toContain('⚠️ 1 route manifest(s) would not load and were NOT checked')
  })

  it('exits 0 with a loud warning line when the editor route names no carrier', () => {
    const r = run(artifact(CHUNKS, { [CANVAS]: { entry: ['shell.js'] }, '(main)/feed/page': { entry: ['shell.js'] } }))
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^✅ check:editor-bundle-bytes - /)
    expect(r.stdout).toContain('⚠️ the editor route names no chunk that carries the runtime')
  })
})

describe('--warn-only cannot fail a build on any arm', () => {
  it('exits 0 on a leak and still names it', () => {
    const r = run(leaky(), '--warn-only')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^⚠️ check:editor-bundle-bytes - /)
    expect(r.stdout).toContain('/(marketing)/page  ->  canvas.js')
  })

  it('exits 0 with no .next, with an empty one, and on its own crash', () => {
    const dir = bare()
    expect(run(dir, '--warn-only').status).toBe(0)
    mkdirSync(join(dir, '.next/server/app'), { recursive: true })
    const empty = run(dir, '--warn-only')
    expect(empty.status).toBe(0)
    expect(empty.stdout).toContain('read no route manifests')
    const crash = run(crashing(), '--warn-only')
    expect(crash.status).toBe(0)
    expect(crash.stdout).toMatch(/^⚠️ check:editor-bundle-bytes - CRASHED/)
  })
})

describe('postbuild wiring', () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>

  it('is runnable on demand', () => {
    expect(scripts['check:editor-bundle-bytes']).toBe('node scripts/check-editor-bundle-bytes.mjs')
  })

  it('runs in postbuild BLOCKING: bare, once, chained with &&, and not swallowed', () => {
    // This pin said "advisory only" until 2026-11-16 and inverted in the change that armed the gate
    // (PROG-E0C), after the production build of main printed it green on a real artifact. A
    // re-added `--warn-only`, `|| true`, or a `;` in front of it is now a silent demotion of a
    // promoted gate. When it fires, fix the import fan-out (docs/RUNBOOKS.md); do not edit this.
    const postbuild = scripts.postbuild ?? ''
    expect(postbuild.split('check-editor-bundle-bytes.mjs')).toHaveLength(2)
    expect(postbuild).toContain(' && node scripts/check-editor-bundle-bytes.mjs')
    const args = /check-editor-bundle-bytes\.mjs(.*?)(?:&&|$)/.exec(postbuild)?.[1] ?? 'x'
    expect(args.trim(), 'check-editor-bundle-bytes.mjs must run bare in postbuild').toBe('')
    // Nothing in the whole chain may swallow an exit code: one `||` or `;` after any gate demotes it.
    expect(postbuild).not.toMatch(/\|\||;|--warn-only/)
  })
})
