#!/usr/bin/env node
// BLD-215 probe: surface parity for the roles. The profile surface draws the page in the Frequency frame with no site
// theme (the Space page's own resolver, skin off), the Spotlight surface draws one door per role section, and every
// role declares all four surfaces. Exit 1 on the first miss, 0 when all hold.
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const fail = (m) => { console.error(`BLD-215: ${m}`); process.exit(1) }
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : fail(`${p} is missing`))

const view = read('lib/builder/surface-view.ts')
if (!/export function profileFrame\(/.test(view)) fail('profileFrame is not exported from lib/builder/surface-view.ts')
if (!/skinned: false/.test(view)) fail('the profile frame does not switch the site skin off')
if (!/siteCanvasVars\(/.test(view)) fail('the profile frame does not read the Space page\'s own resolver (siteCanvasVars)')
if (!/export function spotlightDoors\(/.test(view)) fail('spotlightDoors is not exported')
if (!/surfaces\.spotlight !== 'door'/.test(view)) fail('spotlightDoors does not read the role\'s declared Spotlight surface')
if (/supabase|server-only/.test(view)) fail('surface-view.ts must stay pure')

const test = read('lib/builder/surface-view.test.ts')
for (const needle of ['no site theme', 'one door per role section', "frame.theme).toBe('DAWN')"]) if (!test.includes(needle)) fail(`test lacks "${needle}"`)
const freeze = read('lib/blocks/roles/surfaces.test.ts')
if (!/freezes every role that reads the Space/.test(freeze)) fail('the email freeze rule has no test')

for (const f of readdirSync('lib/blocks/roles').filter((n) => n.endsWith('.role.json'))) {
  const role = JSON.parse(readFileSync(`lib/blocks/roles/${f}`, 'utf8'))
  const s = role.surfaces ?? {}
  if (s.site !== 'draw' || s.profile !== 'draw' || s.spotlight !== 'door' || !['draw', 'hide', 'freeze'].includes(s.email)) fail(`${f} does not declare all four surfaces`)
}

const shell = read('components/builder/shell/builder-shell.tsx')
if (!/state\.surface === 'profile' \? profileFrame\(/.test(shell)) fail('the shell does not frame the profile surface')
if (!/state\.surface === 'spotlight' \? spotlightDoors\(/.test(shell)) fail('the shell does not draw the Spotlight doors')
if (!/<ProfileFrame /.test(shell) || !/<SpotlightDoors /.test(shell)) fail('the shell does not mount both surface canvases')
if (!/themeVars=\{profile \? profile\.vars : canvasVars\}/.test(shell)) fail('the profile canvas still wears the site\'s theme variables')
for (const p of ['components/builder/surfaces/profile/profile-frame.tsx', 'components/builder/surfaces/spotlight/spotlight-doors.tsx']) read(p)
if (/#[0-9a-fA-F]{3,8}\b/.test(read('components/builder/surfaces/spotlight/spotlight-doors.module.css') + read('components/builder/surfaces/profile/profile-frame.module.css'))) fail('hex colour in a surface stylesheet')
console.log('BLD-215: profile frame (no site theme), Spotlight doors per role, four surfaces on every role, freeze rule tested')
