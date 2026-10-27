import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RETIRED_SHELL_WRAPPERS } from './lib/retired-shell-wrappers.mjs'
import { retiredModuleEdges } from './lib/retired-member-shell.mjs'
import { retainedShellReplacements } from './probes/retired-shell-wrappers.mjs'
const read = (file: string) => readFileSync(file, 'utf8')
describe('actual replacement contracts for four retired internal shell wrappers', () => {
  it.each(RETIRED_SHELL_WRAPPERS)('rejects reintroducing %s into a real active entry', target => {
    const source = read('app/(main)/layout.tsx')
    expect(retiredModuleEdges('app/(main)/layout.tsx', source, RETIRED_SHELL_WRAPPERS)).toEqual([])
    for (const edge of [`import X from '@/${target.replace(/\.tsx$/, '')}'`, `export { X } from '@/${target.replace(/\.tsx$/, '')}'`, `const x = import('@/${target.replace(/\.tsx$/, '')}')`]) {
      expect(retiredModuleEdges('app/(main)/layout.tsx', `${source}\n${edge}`, RETIRED_SHELL_WRAPPERS)).toHaveLength(1)
    }
  })
  it('requires actual mounted replacements, current personal data and live dock semantics', () => {
    expect(retainedShellReplacements(read)).toBe(true)
    for (const [file, old, next] of [
      ['components/frequency/members/shell/members-shell.tsx', '<FqMegaFooter', '<div'],
      ['components/frequency/members/shell/members-shell.tsx', 'myFrequency?.circles', 'undefined'],
      ['components/frequency/members/shell/members-shell.tsx', 'props.availableContexts.flatMap', '[].flatMap'],
      ['app/(main)/nearby/page.tsx', '<DispatchMarquee', '<span'],
      ['components/sidebar/game-stats-dock.tsx', "onOtherDockSegmentOpen('vault', () => setOpen(false))", 'undefined'],
      ['components/sidebar/rail-registry.tsx', '<DispatchesPanel profileId={profileId} circleIds={circleIds} />', 'null'],
    ]) expect(retainedShellReplacements(path => path === file ? read(path).replace(old, next) : read(path))).toBe(false)
  })
})
