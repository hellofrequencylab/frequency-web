#!/usr/bin/env node
// LIVE-2314: the Resonance tab on a Space page (`?panel=manage&area=resonance`) draws its Contacts Workspace,
// and its person card (where the message composer lives) cannot stay on "Loading their card" forever.
// The in-place console has no `[data-kit="admin"]` ancestor, so the Workspace needs its own rules under the
// in-place block, and the card read needs a deadline and a way to be asked again.
import { readFileSync } from 'node:fs'

const css = readFileSync('app/themes/frequency/admin-pages.css', 'utf8')
const ws = readFileSync('components/frequency/admin/pages/contacts/contacts-workspace.tsx', 'utf8')
const fails = []
const IN_PLACE = '[data-design="frequency"] [data-kit="members"] .fqs-pane .adp'
const rule = (sel, decl) => new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]*${decl}`).test(css)

if (!rule(`${IN_PLACE} .adp-ws-grid`, 'display:grid')) fails.push('in place, the Workspace grid has no two-column layout')
if (!rule(`${IN_PLACE} .adp-ws-row`, 'display:flex')) fails.push('in place, a roster row is not laid out as a row')
if (!rule(`${IN_PLACE} .adp-ws-list`, 'flex-direction:column')) fails.push('in place, the roster does not stack its rows')
if (!rule(`${IN_PLACE} .adp-ws-pane`, 'min-width:0')) fails.push('in place, the person card has no pane')
if (!/@container fq-console \(max-width:900px\)\{[^@]*\.fqs-pane \.adp \.adp-ws-grid\{grid-template-columns:minmax\(0,1fr\)\}/.test(css))
  fails.push('in place, a narrow column does not stack the card under the roster')
if (/\.fqs-pane[^{]*\{[^}]*#[0-9a-fA-F]{3,8}\b/.test(css)) fails.push('an in-place rule holds a literal colour')

if (!/DETAIL_DEADLINE_MS/.test(ws) || !/setTimeout\(/.test(ws)) fails.push('a card read that never settles has no deadline')
if (!/clearTimeout\(/.test(ws)) fails.push('the card read deadline is never cleared')
if (!/\[selectedId, needsFetch, ask\]/.test(ws)) fails.push('nothing can ask for the same card again')
if (!/onClick=\{\(\) => pick\(m\.id\)\}/.test(ws)) fails.push('picking the same person again does not retry their card')

if (fails.length) {
  console.error(`FAIL LIVE-2314\n- ${fails.join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2314')
