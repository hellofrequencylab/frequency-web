// PERF-009: the Sentry browser SDK loads after the page has loaded and gone idle, not during hydration,
// and errors thrown before it loads are buffered and handed over. Exit 0 = fixed, 1 = not.
import { readFileSync, existsSync } from 'node:fs'

const ENTRY = 'instrumentation-client.ts'
const CLIENT = 'lib/observability/sentry-client.ts'
if (!existsSync(ENTRY) || !existsSync(CLIENT)) process.exit(79)
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const src = strip(readFileSync(ENTRY, 'utf8'))
const client = strip(readFileSync(CLIENT, 'utf8'))
const fails = []

const imp = src.indexOf("import('@/lib/observability/sentry-client')")
const start = src.indexOf('const start = () =>')
if (imp < 0) fails.push('the SDK is no longer reached through a dynamic import')
else if (start < 0 || imp < start) fails.push('the SDK import runs at boot, not from a deferred start()')
if (!/requestIdleCallback\(\s*start/.test(src)) fails.push('start() is not scheduled for an idle moment')
if (!/addEventListener\(\s*'load'\s*,\s*whenIdle/.test(src)) fails.push('the idle wait does not begin at the load event')
if (!/addEventListener\(\s*'error'/.test(src) || !/addEventListener\(\s*'unhandledrejection'/.test(src)) {
  fails.push('no pre-init buffer: errors before the deferred load would be lost')
}
if (!/captureEarlyError\(/.test(src) || !/export function captureEarlyError/.test(client)) {
  fails.push('buffered early errors are never handed to Sentry')
}

if (fails.length) {
  console.error(fails.join('; '))
  process.exit(1)
}
process.exit(0)
