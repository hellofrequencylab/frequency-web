import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { codeTriggers } from '../maintenance/menu-drift.mjs'
import { loadProbeModule } from '../lib/probe-module.mjs'

const triggers = codeTriggers(readFileSync('lib/nav/registry.ts', 'utf8'))
assert.ok(triggers.length > 0)
const forbidden = ['/spaces/directory', '/partners', '/journeys']
for (const trigger of triggers) {
  if (trigger.items.length) assert.ok(trigger.items.some(item => item.href === trigger.href), `${trigger.label} must include its own landing`)
  for (const node of [trigger, ...trigger.items]) assert.equal(forbidden.includes(node.href.split('#')[0]), false, `Do not link the private app twin: ${node.href}`)
}
const spaces = triggers.find(t => t.href === '/spaces')
assert.ok(spaces)
assert.equal(spaces.items.find(item => item.label === 'Spaces directory')?.href, '/discover/spaces')
const workflow = readFileSync('.github/workflows/maintenance.yml', 'utf8').split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
for (const command of ['node scripts/maintenance/menu-drift.mjs --print-query', 'node scripts/maintenance/menu-drift.mjs menu.json']) assert.ok(workflow.includes(command), 'Keep the scheduled data drift read and comparison wired')
const legal = loadProbeModule('lib/nav/legal-links.ts')
const nav = loadProbeModule('lib/frequency/site-nav.ts', { '@/lib/nav/legal-links': legal })
assert.equal(nav.ROUTES.directory, '/discover/spaces')
assert.equal(nav.DIRECT_LINKS.find(link => link.label === 'Business Spaces')?.href, '/discover/spaces')
for (const [key, href] of [['people', '/the-community'], ['spaces', '/spaces']]) {
  const menu = nav.WING_MENUS.find(menu => menu.key === key)
  assert.ok(menu?.cols.some(col => col.links.some(link => link.href === href)), `${key} panel contains its actual landing`)
}
console.log('Current DAWN registry and Frequency public menus preserve landing access and public directory destinations without arbitrary trigger count floors; live DB drift remains separate')
