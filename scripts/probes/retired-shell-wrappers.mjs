import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { RETIRED_SHELL_WRAPPERS } from '../lib/retired-shell-wrappers.mjs'
import { retiredModuleEdges } from '../lib/retired-member-shell.mjs'
import { replacementMounted } from './retired-browse-wrappers.mjs'
/** @param {(file: string) => string} [read] */
export function retainedShellReplacements(read = file => readFileSync(file, 'utf8')) {
  const shell = read('components/frequency/members/shell/members-shell.tsx')
  const nearby = read('app/(main)/nearby/page.tsx')
  return replacementMounted(shell, 'FqMegaFooter') && replacementMounted(shell, 'FqRailLayout') &&
    replacementMounted(nearby, 'DispatchMarquee') &&
    shell.includes('visibleFooterColumns(gateRole,') && shell.includes('myFrequency?.circles') && shell.includes('props.availableContexts.flatMap') &&
    read('components/sidebar/game-stats-dock.tsx').includes("onOtherDockSegmentOpen('vault', () => setOpen(false))") &&
    read('components/sidebar/rail-registry.tsx').includes('<DispatchesPanel profileId={profileId} circleIds={circleIds} />')
}
if (process.argv[1]?.endsWith('/retired-shell-wrappers.mjs')) {
  for (const file of RETIRED_SHELL_WRAPPERS) assert.equal(existsSync(file), false, `${file} must stay retired`)
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter(file => /\.[cm]?[jt]sx?$/.test(file) && existsSync(file))
  for (const file of files) assert.deepEqual(retiredModuleEdges(file, readFileSync(file, 'utf8'), RETIRED_SHELL_WRAPPERS), [], `Dangling retired wrapper import in ${file}`)
  assert.ok(retainedShellReplacements(), 'Actual current footer, personal rail, dispatch board/registry and dock paths must stay wired')
  console.log('Four retired wrappers absent; actual Frequency shell, dispatch board/registry and live dock replacements retained.')
}
