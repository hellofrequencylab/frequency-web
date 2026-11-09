// LIVE-1971: Create a Space v3 hardening. Reads the files, never a test runner (LIVE-034): the e2e walk exists and
// proves the three things it names, the funnel journey no longer expects /spaces/new to sign in, the phone keeps a
// 44px target on the pills and chips, and the proxy makes the signed-out hop the e2e walks. Exit 1 on the first miss.
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const spec = read('test/e2e/create-space.spec.ts')
if (!spec) bad.push('test/e2e/create-space.spec.ts is missing')
for (const name of [
  '/spaces/new opens the wizard for a visitor with no account, carrying the door',
  'the builder walks name, accent and the offer mock-up',
  'the anonymous sinks answer 204 to junk and store nothing from it',
]) if (!spec.includes(`test('${name}'`)) bad.push(`the e2e walk lost "${name}"`)
if (!/tag: '@smoke'/.test(spec)) bad.push('the e2e walk is not in the smoke tag')
if (!/test\.skip\(!baseURL/.test(spec)) bad.push('the e2e walk does not skip itself without PW_BASE_URL')

const funnel = read('test/e2e/funnel.spec.ts')
if (/for \(const route of \[[^\]]*'\/spaces\/new'/.test(funnel)) bad.push('funnel.spec.ts still expects /spaces/new to sign a visitor in')

const css = read('components/frequency/site/pages/create-space/create-space.css')
if (!/@media \(pointer:coarse\)\{\.cs-pill\{height:44px\}\.cs-chip-btn\{min-height:44px\}\}/.test(css)) bad.push('the phone lost its 44px pill and chip targets')

const proxy = read('proxy.ts')
if (!/!user && CREATE_SPACE_DOORS\.has\(pathname\.replace\(\/\\\/\$\/, ''\)\)/.test(proxy) || !/CREATE_SPACE_DOORS = new Set\(\[[^\]]*'\/spaces\/new'/.test(proxy)) bad.push('proxy.ts does not make the signed-out /spaces/new hop the e2e walks')

if (bad.length) {
  for (const b of bad) console.error('✗', b)
  process.exit(1)
}
console.log('✓ create a space hardening: the e2e walk, the funnel journey, the phone targets and the proxy hop all read as shipped')
