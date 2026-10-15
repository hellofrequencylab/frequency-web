// Read-only backlog consequences. CI runs the full behavioral suites independently.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const read = (file) => fs.readFileSync(file, 'utf8')
function evaluate(source, globals = {}, dependencies = {}) {
  const exports = {}
  const context = { module: { exports }, exports, console, structuredClone, crypto: globalThis.crypto, ...globals,
    require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name) }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context, { timeout: 2000 })
  return context.module.exports
}
function selected(file, names) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const printer = ts.createPrinter()
  return source.statements.filter((node) => (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) || (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => names.includes(d.name.getText(source))))).map((node) => printer.printNode(ts.EmitHint.Unspecified, node, source)).join('\n')
}
const jsx = (type, props) => ({ type, props: props ?? {} })
function links(node, found = []) {
  if (!node || typeof node !== 'object') return found
  if (node.type === 'a') found.push(node.props.href)
  for (const child of [node.props?.children].flat(Infinity)) links(child, found)
  return found
}
async function wake() {
  const { createScreenWakeLock } = evaluate(read('lib/on-air/screen-wake-lock.ts'))
  let count = 0; let current
  const lock = createScreenWakeLock(async () => { count++; current = { released: false, async release() { this.released = true } }; return current })
  await Promise.all([lock.acquire(), lock.acquire()]); assert.equal(count, 1)
  current.released = true; await lock.acquire(); assert.equal(count, 2)
  await lock.release(); assert.equal(current.released, true)
}
function escape() {
  const file = ts.createSourceFile('mindless.tsx', read('components/on-air/mindless.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let predicate
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect' && node.arguments[0]?.getText(file).includes("e.key === 'Escape'")) {
      const first = node.arguments[0].body?.statements?.find(ts.isIfStatement)
      if (first) predicate = first.expression.getText(file)
    }
    ts.forEachChild(node, visit)
  }
  visit(file); assert.ok(predicate, 'provider Escape effect must exist')
  const { handles } = evaluate(`exports.handles = state => !(${predicate});`)
  assert.equal(handles({ phase: 'ready', data: { practices: [{}] } }), false)
  assert.equal(handles({ phase: 'closed' }), false)
  assert.equal(handles({ phase: 'loading' }), true)
  assert.equal(handles({ phase: 'ready', data: { practices: [] } }), true)
}
function duplicate() {
  const operations = evaluate(read('components/page-editor/mobile/data-ops.ts'), {}, {
    '@/lib/page-editor/block-limits': { canAddBlock: () => true, blockLimitReason: () => null },
    '@/lib/page-editor/palette-scope': { categoryKeysForSurface: () => [] },
  })
  const { duplicateWebsiteSection } = evaluate(read('lib/sites/editor/duplicate.ts'), {}, { '@/components/page-editor/mobile/data-ops': operations })
  const config = { components: { Section: { fields: { body: { type: 'slot' } } }, Text: { fields: {} } } }
  const doc = { root: { props: { websiteLayout: { parent: { desktop: { columns: 2, anchor: 'unique' }, mobile: { padding: 'sm' } }, child: { mobile: { width: 'full' } } } } }, content: [{ type: 'Section', props: { id: 'parent', body: [{ type: 'Text', props: { id: 'child' } }] } }] }
  const before = JSON.stringify(doc); const result = duplicateWebsiteSection(doc, config, 'parent')
  assert.notEqual(result.id, 'parent'); const layout = result.data.root.props.websiteLayout
  assert.equal(layout[result.id].desktop.columns, 2); assert.equal(layout[result.id].desktop.anchor, undefined)
  assert.equal(layout[result.id].mobile.padding, 'sm')
  const copiedChild = result.data.content[1].props.body[0].props.id
  assert.notEqual(copiedChild, 'child'); assert.equal(layout[copiedChild].mobile.width, 'full')
  assert.equal(JSON.stringify(doc), before)
}
function routes() {
  const { normalizeAppPath } = require('next/dist/shared/lib/router/utils/app-paths')
  const { normalizeCatchAllRoutes } = require('next/dist/server/lib/router-utils/normalize-catchall-routes')
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
  const paths = walk('app').filter((file) => /\/(page|default)\.tsx$/.test(file)).map((file) => `/${file.slice(4, -4)}`)
  const pages = {}; for (const route of paths.filter((route) => route.endsWith('/page'))) (pages[normalizeAppPath(route)] ??= []).push(route)
  const resolve = (defaults) => normalizeCatchAllRoutes(structuredClone(pages), undefined, { strictRouteMatching: true, defaultAppPaths: defaults })
  const defaults = paths.filter((route) => route.endsWith('/default'))
  const result = resolve(defaults); assert.equal(result.unmatchedAppPages.length, 0); assert.equal(result.incompatibleParallelRouteSlots.length, 0)
  assert.ok(resolve(defaults.filter((route) => route !== '/(main)/default')).unmatchedAppPages.length > 0, 'removing the fallback must break completeness')
  assert.equal(evaluate(read('app/(main)/default.tsx')).default(), null)
}
function editor() {
  const { editorBlockMeta } = evaluate(read('lib/sites/editor/block-meta.ts'))
  for (const type of ['NetworkHero', 'NetworkEvents', 'NetworkCircles']) { const meta = editorBlockMeta({ categories: {} }, type); assert.equal(meta.group, 'Live'); assert.equal(meta.live, true) }
  const css = evaluate(selected('components/sites/editor/canvas.tsx', ['CANVAS_CSS', 'FQ_CANVAS_CSS']) + '\nexports.css = [CANVAS_CSS, FQ_CANVAS_CSS];').css
  const coarse = css.map((sheet) => [...sheet.matchAll(/@media\(pointer:coarse\)\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((match) => match[1]).join('\n'))
  assert.match(coarse[0], /\.we-micro button[^{}]*\{[^}]*width:44px;[^}]*height:44px/)
  assert.match(coarse[0], /\.we-section-label\{[^}]*opacity:1!important/)
  assert.match(coarse[0], /\.we-insert\{[^}]*height:44px/)
  assert.match(coarse[1], /\.we-insert\{[^}]*color:var\(--fq-/)
  assert.match(coarse[1], /\.we-chrome-edit\{[^}]*min-height:44px/)
}
function og() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frequency-og-probe-'))
  const trace = (name, files) => { const file = path.join(dir, '.next/server/app', name, 'route.js.nft.json'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ version: 1, files })) }
  try {
    for (let i = 0; i < 220; i++) trace(`plain-${i}`, [])
    const native = '../../../../node_modules/@img/sharp-libvips-darwin-x64/lib/libvips-cpp.8.18.7.dylib'
    for (let i = 0; i < 6; i++) trace(`kind-${i}/opengraph-image`, [native])
    const run = () => spawnSync(process.execPath, [path.resolve('scripts/check-og-trace.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, VERCEL: '1' } })
    const good = run(); assert.equal(good.status, 0, good.stdout + good.stderr)
    trace('starved/twitter-image', []); const bad = run(); assert.equal(bad.status, 1); assert.match(bad.stdout + bad.stderr, /WITHOUT sharp/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}
function events() {
  const { filterNetworkEvents, networkChapterLabel, networkEventAvailability, networkMonthDays } = evaluate(read('lib/sites/network-events.ts'))
  const rows = [{ id: 'a', chapter: 'Oceanside', day: '2026-10-15' }, { id: 'b', chapter: 'Oceanside', day: '2026-10-22' }, { id: 'c', chapter: 'North', day: '2026-10-22' }]
  assert.equal(filterNetworkEvents(rows, 'Oceanside', '2026-10-22').map((row) => row.id).join(','), 'b')
  assert.equal(filterNetworkEvents(rows, null, null).length, 3)
  assert.equal(networkChapterLabel({ title: 'Oceanside', hostingSpaceId: 'north' }, [{ label: 'Oceanside', spaceId: 'ocean', match: ['oceanside'] }, { label: 'North', spaceId: 'north', match: ['north'] }]), 'North')
  assert.equal(networkEventAvailability({ startsAtInstant: 5, endsAtInstant: 10 }, 8), 'ongoing')
  assert.equal(networkEventAvailability({ startsAtInstant: 5, endsAtInstant: 10 }, 10), 'ended')
  assert.equal(networkEventAvailability({ startsAtInstant: 9, endsAtInstant: 10 }, 8), 'future')
  assert.ok(networkMonthDays('2026-10').includes('2026-10-22'))
}
function circles() {
  const { NetworkCirclesBlock } = evaluate(selected('components/page-editor/blocks/network.tsx', ['NetworkCirclesBlock']), {
    upcoming: () => [], arr: (value) => Array.isArray(value) ? value : [], str: (value) => typeof value === 'string' ? value : '', todayIn: () => '2026-10-15', ZONE: 'America/Los_Angeles',
    CIRCLE_TONES: ['var(--nw-accent)'], Section: 'section', Head: 'header', Icon: 'icon', ArrowRight: 'arrow',
  }, { 'react/jsx-runtime': { jsx, jsxs: jsx } })
  const tree = NetworkCirclesBlock({ p: { circles: [{ title: 'Authored', circleSlug: 'tg-authored' }, { title: 'Known' }, { title: 'Unknown' }] }, metadata: { links: { origin: 'http://localhost:3000' }, space: { community: [{ name: 'Known', slug: 'known' }] } } })
  assert.equal(links(tree).join(','), 'http://localhost:3000/circles/tg-authored,http://localhost:3000/circles/known')
}
const probes = { 'SCAN-923': wake, 'SCAN-924': escape, 'SCAN-926': duplicate, 'SCAN-930': routes, 'SCAN-931': editor, 'SCAN-932': og, 'SCAN-949': events, 'LIVE-928': circles }
const probe = probes[process.argv[2]]
if (!probe) throw new Error('Expected a supported audit ID')
await probe()
console.log(`${process.argv[2]} consequence passed`)
