#!/usr/bin/env node
// LIVE-2320: the "Finish setup" pill shows in the Space console header (Manage, Marketing, Offerings), not
// only in the members header that steps aside on console routes. Checks the consequence in source:
//   1. The Space console builder passes the members header's own loader (loadLaunchBox) to its shell.
//   2. The console shell draws it in its top bar through an island that reuses LaunchPill and LaunchSheet.
//   3. The console still mounts on /manage and /marketing (the layouts the audit named).
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []

const builder = read('components/frequency/admin/space-console.tsx')
if (!/launch=\{launchSystemEnabled\(\) \? loadLaunchBox\(\) : undefined\}/.test(builder)) {
  fails.push('the Space console does not pass loadLaunchBox() to its shell')
}
const shell = read('components/frequency/admin/admin-shell.tsx')
const top = shell.match(/<header className="ad-top"[\s\S]*?<\/header>/)?.[0] ?? ''
if (!/<ConsoleLaunch launch=\{launch\} \/>/.test(top)) fails.push('the console top bar draws no launch pill')

const islandPath = 'components/frequency/admin/console-launch.tsx'
if (!existsSync(new URL(islandPath, root))) {
  fails.push(`${islandPath} is missing`)
} else {
  const island = read(islandPath)
  if (!/import \{ LaunchPill, LaunchSheet \} from '@\/components\/frequency\/members\/shell\/launch-box'/.test(island)) {
    fails.push('the console island does not reuse the members header LaunchPill and LaunchSheet')
  }
}
for (const layout of ['app/(main)/spaces/[slug]/manage/layout.tsx', 'app/(main)/spaces/[slug]/marketing/layout.tsx']) {
  if (!/<FrequencySpaceConsole/.test(read(layout))) fails.push(`${layout} no longer mounts the Space console`)
}

if (fails.length) {
  console.error(`LIVE-2320 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2320 ok: the Space console top bar shows the Finish setup pill from the same loader')
