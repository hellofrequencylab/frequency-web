import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { activeShellProblems, SOURCES } from './probes/active-member-shell-contracts.mjs'
const read = (file: string) => readFileSync(file, 'utf8')
type Mode = 'retirement' | 'breadcrumb' | 'zap' | 'size' | 'viewport'
function mutated(file: string, from: string, to: string) {
  expect(read(file)).toContain(from)
  return (name: string) => name === file ? read(name).replace(from, to) : read(name)
}
describe('retired AppShell consequences move to actual Frequency consumers', () => {
  it.each<Mode>(['retirement', 'breadcrumb', 'zap', 'size', 'viewport'])('current real sources pass %s', mode => {
    expect(activeShellProblems(mode, read)).toEqual([])
  })
  it('rejects the real title changing back to a frozen slug', () => {
    expect(activeShellProblems('breadcrumb', mutated(SOURCES.event, 'label: event.title', 'label: event.slug'))).toContain('Event trail must use the real title')
  })
  it('rejects a global breadcrumb above page-owned content', () => {
    expect(activeShellProblems('breadcrumb', mutated(SOURCES.rails, '{children}', '<Breadcrumbs />{children}'))).toContain('Global shell must not duplicate page-owned trails')
  })
  it('rejects the actual phone action opening a different sheet', () => {
    expect(activeShellProblems('zap', mutated(SOURCES.header, "onZap={() => toggle('zap')}", "onZap={() => toggle('me')}"))).toContain('Actual phone Zap must open its sheet')
  })
  it('rejects a second viewport minimum in the actual content rule', () => {
    expect(activeShellProblems('viewport', mutated(SOURCES.css, '.fqm-body{--fqm-l:', '.fqm-body{min-height:100vh;--fqm-l:'))).toContain('Content adds a second viewport below the header')
  })
  it('retains the 1800 line ceiling and retired-module absence controls', () => {
    expect(activeShellProblems('size', file => file === SOURCES.header ? read(file) + '\n'.repeat(1801) : read(file))).not.toEqual([])
    expect(activeShellProblems('retirement', read, true)).toContain('Retired AppShell module is present')
  })
})
