import fs from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
import ts from 'typescript'
import { loadProbeModule } from '../lib/probe-module.mjs'
import { RETIRED_MEMBER_SHELL, retiredShellEdges } from '../lib/retired-member-shell.mjs'

export const SOURCES = {
  layout: 'app/(main)/layout.tsx',
  shell: 'components/frequency/members/shell/members-shell.tsx',
  rails: 'components/frequency/members/shell/rail-layout.tsx',
  header: 'components/frequency/members/shell/header.tsx',
  bell: 'components/frequency/members/shell/bell.tsx',
  tab: 'components/frequency/members/shell/tab-bar.tsx',
  event: 'app/(main)/events/[slug]/event-member-page.tsx',
  registry: 'lib/layout/page-chrome.ts',
  actions: 'components/feed/create-actions.ts',
  css: 'app/themes/frequency/members-shell.css',
  globals: 'app/globals.css',
}
/** @param {string} file @param {string} source */
function code(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  if (ast.parseDiagnostics.length) throw new Error(`Cannot parse ${file}`)
  return ts.createPrinter({ removeComments: true }).printFile(ast)
}
/** Each named mode retains a distinct historical consequence after owner4058 replaced AppShell.
 * @param {'retirement'|'breadcrumb'|'zap'|'size'|'viewport'} mode
 * @param {(file:string)=>string} read
 * @param {boolean} retiredExists
 * @returns {string[]}
 */
export function activeShellProblems(mode, read, retiredExists = false) {
  const bad = []
  const src = key => code(SOURCES[key], read(SOURCES[key]))
  const check = (condition, message) => { if (!condition) bad.push(message) }
  if (mode === 'retirement') {
    check(!retiredExists, 'Retired AppShell module is present')
    check(src('layout').includes('<FrequencyMembersShell'), 'Main layout must render active Frequency chrome')
    check(retiredShellEdges(SOURCES.layout, read(SOURCES.layout)).length === 0, 'Main layout imports retired shell')
  } else if (mode === 'breadcrumb') {
    check(src('event').includes('label: event.title'), 'Event trail must use the real title')
    check(src('registry').includes('export function ownsBreadcrumb'), 'Page trail ownership registry disappeared')
    check(!/<Breadcrumbs\b/.test(src('shell') + src('rails')), 'Global shell must not duplicate page-owned trails')
  } else if (mode === 'zap') {
    check(src('tab').includes('Zap, capture a moment') && src('tab').includes('onClick={onZap}'), 'Phone centre action must remain Zap')
    check(src('header').includes("onZap={() => toggle('zap')}") && src('header').includes('id="fqm-zap"'), 'Actual phone Zap must open its sheet')
    check(!/\bCreateButton\b/.test(src('header') + src('tab')), 'Create sheet returned on the centre action')
    const actions = src('actions').split('\n')
    for (const href of ['/events/new', '/circles/new']) check(actions.some(line => line.includes(href) && line.includes('EVERYONE')), `${href} lost its every-member gate`)
  } else if (mode === 'size') {
    check(!retiredExists, 'Legacy monolithic client shell returned')
    const lines = ['header', 'bell', 'rails', 'tab'].reduce((sum, key) => sum + read(SOURCES[key]).split('\n').length, 0)
    check(lines <= 1800, `Active core client chrome totals ${lines} lines, over the unchanged 1800 line ceiling`)
  } else if (mode === 'viewport') {
    const css = read(SOURCES.css).replace(/\/\*[\s\S]*?\*\//g, '')
    check(css.includes('min-height:100dvh;display:flex;flex-direction:column'), 'Active kit must fill one dynamic viewport as a flex column')
    check(/\.fqm-body\{[^}]*\bflex:1;/.test(css), 'Active content must fill the flex remainder, not add another viewport')
    check(!/\.fqm-body\{[^}]*min-height:\s*(?:100v|calc\(100v)/.test(css), 'Content adds a second viewport below the header')
    for (const file of ['components/layout/admin-bar/admin-bar.tsx', 'app/(main)/admin/layout.tsx', 'components/admin/admin-rail-drawer-column.tsx']) {
      const { reDerivesHeaderHeight } = loadProbeModule('lib/layout/header-offset.ts')
      check(!reDerivesHeaderHeight(read(file)), `${file} subtracts a bare header height`)
    }
    check(/--app-header-h:\s*calc\(3\.5rem \+ env\(safe-area-inset-top\)\)/.test(read(SOURCES.globals)), 'Shared admin header token lost safe-area inset')
  } else throw new Error(`Unknown contract mode ${mode}`)
  return bad
}
if (invokedDirectly(import.meta.url)) {
  const bad = activeShellProblems(process.argv[2], file => fs.readFileSync(file, 'utf8'), fs.existsSync(RETIRED_MEMBER_SHELL))
  if (bad.length) { console.error(bad.join('\n')); process.exitCode = 1 }
  else console.log(`Active member shell ${process.argv[2]} contract passes`)
}
