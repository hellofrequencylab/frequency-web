import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(path.join(process.cwd(), 'package.json'))
const ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
const stubs = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': ({ children, ...props }) => React.createElement('a', props, children),
  '@/components/cards/row-card': { RowCard: props => React.createElement('div', null, props.title, props.meta, props.footer) },
  'lucide-react': { Sparkles: () => null },
  '@/components/frequency/admin/pages/space-reads': {}, '@/lib/spaces/analytics': {},
}
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Date, Number, Set, Map })(key => {
    if (Object.hasOwn(stubs, key)) return stubs[key]
    assert.equal(key, '@/lib/ai/coaching-evidence', `Unexpected dependency ${key}`)
    return load('lib/ai/coaching-evidence.ts')
  }, mod, mod.exports)
  cache.set(file, mod.exports); return mod.exports
}
const { SpaceCoachingCardView } = load('components/spaces/dashboard/space-coaching-card.tsx')
const html = renderToStaticMarkup(React.createElement(SpaceCoachingCardView, { slug: 'Thursday / walks', identity: { name: 'Walks', tagline: 'Weekly', about: 'Our walk' }, observed: { windowDays: 30, observedFrom: '2026-09-25T00:00:00Z', observedThrough: '2026-10-25T00:00:00Z', profileViews: 7, ctaClicks: 0 } }))
assert.ok(html.includes('href="/spaces/Thursday%20%2F%20walks/manage?section=settings#branding-cta-label"'), 'Main-button coaching must reach the actual settings Header button editor')
assert.ok(!html.includes('/manage/mode'), 'Mode/focus presets do not edit the primary button')
function parsed(file) { return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) }
function has(node, predicate) { if (predicate(node)) return true; return Boolean(ts.forEachChild(node, child => has(child, predicate))) }
function jsx(node, name) { return (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === name }
const page = parsed('app/(main)/spaces/[slug]/manage/page.tsx')
assert.ok(has(page, n => jsx(n, 'SpaceManageBoard') && n.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText() === 'section' && a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression?.getText() === 'section')), 'Manage route must pass the requested section into the real board')
const board = parsed('app/(main)/spaces/[slug]/manage/manage-board.tsx')
assert.ok(has(board, n => ts.isConditionalExpression(n) && ts.isBinaryExpression(n.condition) && n.condition.left.getText() === 'section' && ts.isStringLiteral(n.condition.right) && n.condition.right.text === 'settings' && has(n.whenTrue, child => jsx(child, 'SpaceIdentityEditor'))), 'Settings section must render the actual identity editor')
assert.ok(has(parsed('app/(main)/spaces/[slug]/manage/identity-editor.tsx'), n => jsx(n, 'SpaceBrandingForm')), 'Identity editor must render the existing branding controls')
const branding = parsed('components/spaces/space-branding-form.tsx')
assert.ok(has(branding, n => ts.isJsxAttribute(n) && n.name.getText() === 'id' && n.initializer && ts.isStringLiteral(n.initializer) && n.initializer.text === 'branding-cta-label'), 'The exact link anchor must exist on the real Header button editor')
// Execute the actual client reveal effect with inert DOM primitives: an anchor inside closed
// details is insufficient unless both initial mount and native hash changes expose the controls.
let revealEffect
has(branding, n => {
  if (ts.isCallExpression(n) && n.expression.getText() === 'useEffect' && n.arguments[0]?.getText().includes('headerStyleRef')) { revealEffect = n.arguments[0]; return true }
  return false
})
assert.ok(revealEffect, 'Deep link must have a client reveal effect for the folded Header button')
const handlers = new Map(), moves = []
const target = { focus: options => moves.push(['focus', options]), scrollIntoView: options => moves.push(['scroll', options]) }
const details = { open: false, querySelector: selector => { assert.equal(selector, '#branding-cta-label'); return target } }
const window = { location: { hash: '' }, addEventListener: (event, handler) => handlers.set(event, handler), removeEventListener: event => handlers.delete(event) }
const effectCode = ts.transpileModule(`exports.effect = ${revealEffect.getText()}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const effectModule = { exports: {} }
new vm.Script(`(function(exports){${effectCode}\n})`).runInNewContext({ window, headerStyleRef: { current: details } })(effectModule.exports)
let cleanup = effectModule.exports.effect()
assert.equal(details.open, false, 'Normal editor must remain folded')
window.location.hash = '#branding-cta-label'; handlers.get('hashchange')()
assert.equal(details.open, true, 'Deep link must expose the folded controls')
assert.equal(moves[0][0], 'focus'); assert.equal(moves[1][0], 'scroll')
cleanup(); assert.equal(handlers.size, 0, 'Reveal listener must be removed on unmount')
details.open = false; moves.length = 0
cleanup = effectModule.exports.effect()
assert.equal(details.open, true, 'Initial deep-linked mount must expose the controls')
assert.equal(moves.length, 2); cleanup()
console.log('ok: actual coaching task/view links to encoded settings Header button anchor; real Manage route/board/identity editor reaches the existing branding controls and opens/focuses the folded Header button on deep link (inert IO).')
