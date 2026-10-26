// Actual receipt/standing executed offline. UI primitives are inert; no Next/server/provider IO.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('package.json'))
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const primitive = ({ children }) => React.createElement('div', null, children)
const stubs = {
  'next/link': { __esModule: true, default: primitive },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/ui/stat-card': { StatCard: ({ label, value, detail }) => React.createElement('div', null, label, ': ', value, ' ', detail) },
  '@/components/ui/section-header': { SectionHeader: ({ title }) => React.createElement('h2', null, title) },
  '@/components/ui/empty-state': { EmptyState: ({ title }) => React.createElement('p', null, title) },
}
function load(file) {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const dep = key => {
    if (Object.hasOwn(stubs, key)) return stubs[key]
    if (key === 'react/jsx-runtime') return require(key)
    throw new Error('Unexpected dependency ' + key)
  }
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Date })(dep, mod, mod.exports)
  return mod.exports
}
const { ReachReceipt } = load('components/spaces/reach-receipt.tsx')
const { standingLevers, standingScore } = load('lib/spaces/standing.ts')
function render(views, attendance) {
  return renderToStaticMarkup(React.createElement(ReachReceipt, {
    spaceSlug: 'fixture', reach: { windowDays: 30, profileViews: views, ctaClicks: null, followers: 2, members: 1, upcoming: 0 },
    levers: standingLevers(standingScore({ attendance })), placement: null, listed: false, computedAt: null,
  }))
}
const measured = render(3, 2)
assert.ok(measured.includes('Daily page views: 3'))
for (const text of ['One per signed-in account per UTC day', 'Anonymous views share one daily count', 'not unique visitors or proof', 'current totals, not new joins', 'Attendance records', 'Repeat attendance counts again', 'Marked ticket seats also require a succeeded, unrefunded payment']) assert.ok(measured.includes(text), text)
for (const falseClaim of ['Counted once per person per day', 'Attendance is not counted', 'Paid tickets count while']) assert.ok(!measured.includes(falseClaim), falseClaim)
assert.ok(render(null, null).includes('Daily page views: --'))
assert.ok(render(null, null).includes('Not counted yet'))
assert.ok(render(0, 0).includes('Daily page views: 0'))
assert.ok(standingScore({ attendance: 2 }).present.includes('attendance'))
assert.ok(!standingScore({ attendance: null }).present.includes('attendance'))
const route = fs.readFileSync('app/(main)/spaces/[slug]/settings/reach/page.tsx', 'utf8')
assert.ok(route.includes('getSpaceProfileEvidence(space.id, 30)'))
assert.ok(!route.includes('getSpaceProfileStats'))
assert.ok(route.includes('profileViews: stats.profileViews,') && route.includes('ctaClicks: stats.ctaClicks,'))
console.log('Reach rendered units, attendance limits and null propagation: PASS (offline)')
