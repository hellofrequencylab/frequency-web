// Fast, read-only consequence probes. Full component suites remain independently enforced by CI.
import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import ts from 'typescript'
const realRequire = createRequire(import.meta.url)
const read = (path) => fs.readFileSync(path, 'utf8')
function evaluate(source, globals = {}, dependencies = {}) {
  const exports = {}
  const context = { module: { exports }, exports, console, URLSearchParams, ...globals,
    require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : realRequire(name) }
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, context, { timeout: 2000 })
  return context.module.exports
}
function functions(path, names) {
  const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const printer = ts.createPrinter()
  return file.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map((node) => printer.printNode(ts.EmitHint.Unspecified, node, file)).join('\n')
}
const jsx = (type, props) => ({ type, props: props ?? {} })
function find(node, matches) {
  if (!node || typeof node !== 'object') return null
  if (matches(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, matches); if (result) return result }
  return null
}
function component(path, dependencies, globals) {
  return evaluate(read(path), globals, {
    react: { useRef: () => ({ current: null }), useState: (initial) => [initial, () => {}], useTransition: () => [false, (fn) => fn()], useEffect: () => {}, useCallback: (fn) => fn, useImperativeHandle: () => {} },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': { Search: 'search', X: 'x', Loader2: 'loader', Send: 'send' },
    '@/components/ui/field': { Input: 'input', Textarea: 'textarea' },
    '@/components/ui/icon-button': { IconButton: 'button' },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') }, ...dependencies,
  })
}
async function weekend() {
  const zone = evaluate(read('lib/time/zone.ts'))
  const { dateRangeWindow } = evaluate(functions('app/(main)/events/index-data.ts', ['dateRangeWindow']) + '\nexports.dateRangeWindow = dateRangeWindow;', zone)
  const sunday = dateRangeWindow('weekend', new Date('2026-10-18T19:00:00Z'))
  assert.equal(sunday.from.toISOString(), '2026-10-18T00:00:00.000Z')
  assert.equal(sunday.to.toISOString(), '2026-10-18T23:59:59.999Z')
  const saturday = dateRangeWindow('weekend', new Date('2026-10-17T19:00:00Z'))
  assert.equal(saturday.to.toISOString(), sunday.to.toISOString())
}
async function directory() {
  const timers = new Map(); let serial = 0; const navigations = []
  const { DirectorySearch } = component('components/ui/directory-search.tsx', {
    'next/navigation': { useRouter: () => ({ replace: (url) => navigations.push(url) }), usePathname: () => '/people', useSearchParams: () => new URLSearchParams('q=seed') },
  }, { setTimeout: (fn) => { timers.set(++serial, fn); return serial }, clearTimeout: (id) => timers.delete(id) })
  const tree = DirectorySearch({})
  find(tree, (node) => node.type === 'input').props.onChange({ target: { value: 'stale' } })
  assert.equal(timers.size, 1)
  find(tree, (node) => node.props['aria-label'] === 'Clear search').props.onClick()
  for (const run of timers.values()) run()
  assert.equal(timers.size, 0)
  assert.equal(navigations.length, 1)
  assert.equal(new URL(navigations[0], 'http://localhost').searchParams.has('q'), false)
}
async function composition() {
  let sent = 0
  const { ChatComposer } = component('components/ui/chat-composer.tsx')
  const tree = ChatComposer({ value: 'unfinished', label: 'Message', onValueChange: () => {}, onSend: () => { sent++ } })
  const key = find(tree, (node) => node.type === 'textarea').props.onKeyDown
  const event = (isComposing, keyCode) => ({ key: 'Enter', nativeEvent: { isComposing, keyCode }, preventDefault() { this.defaultPrevented = true } })
  key(event(true, 13)); key(event(false, 229)); assert.equal(sent, 0)
  key(event(false, 13)); assert.equal(sent, 1)
}
async function hub() {
  const areas = ['market', 'housing', 'makers', 'shop']; let role = 'member'
  const visibility = { market: true, housing: true, makers: true, shop: false }
  const visible = evaluate(functions('lib/marketplace/visibility.ts', ['visibleAreas']), { MARKET_AREAS: areas }).visibleAreas
  const source = functions('components/frequency/members/shared/hub-links.tsx', ['navAccessFor', 'hubViewer']) + '\nexports.hubViewer = hubViewer;'
  const { hubViewer } = evaluate(source, {
    NAV_AREAS: areas.map((key) => ({ key, surface: key })), MARKET_AREAS: areas, AREA_NAV_KEY: Object.fromEntries(areas.map((key) => [key, key])),
    getCachedViewerProfile: async () => ({ id: 'operator', community_role: 'host' }), applyViewAs: async () => role, viewingAsVisitor: async () => false,
    getViewerHats: async () => ({ tier: 'collective', personas: ['operator'] }), getStaffMember: async () => null, hasOperatedSpaces: async () => true,
    browsableAreas: async () => areas, marketplaceVisibility: async () => visibility, visibleAreas: visible,
    accessTo: () => 'full', meetsAccess: (_minimum, effective) => effective === 'host',
  })
  const down = await hubViewer(); assert.equal(down.navAccess.shop, 'none'); assert.equal(down.operatesSpaces, false)
  role = 'host'; const operator = await hubViewer(); assert.equal(operator.navAccess.shop, 'full'); assert.equal(operator.operatesSpaces, true)
}
const probes = { 'SCAN-920': weekend, 'SCAN-921': directory, 'SCAN-922': composition, 'SCAN-929': hub }
const probe = probes[process.argv[2]]
if (!probe) throw new Error('Expected a supported SCAN ID')
await probe()
console.log(`${process.argv[2]} consequence passed`)
