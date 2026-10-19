// EMAIL-025 probe: the Event and Circle cards are real email blocks on the Product card's contract. The
// registry offers them to email only and the palette lists them; the field schema stores a ref plus a
// snapshot; the renderer draws both; the send compile refreshes them from the live row through
// lib/email-studio/data-blocks.ts (the only place the live read may happen); the canvas previews them and
// the rail edits them with the search-a-Space picker.
//
//   node scripts/probes/email-data-blocks.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (f) => readFileSync(f, 'utf8')

const registry = read('lib/entity-blocks/registry.ts')
for (const id of ['eventCard', 'circleCard']) {
  assert.ok(new RegExp(`id: '${id}'[^\\n]*kinds: \\['email'\\]`).test(registry), `${id} is not an email-only block in the registry`)
  assert.ok(new RegExp(`^\\s*'${id}',$`, 'm').test(registry), `${id} is not in EMAIL_PALETTE_BLOCK_IDS`)
}

const fields = read('lib/entity-blocks/block-content.ts')
assert.ok(/eventCard: \[\s*\{ key: 'event', label: 'Event', type: 'event' \}/.test(fields), 'eventCard has no event ref field')
assert.ok(/circleCard: \[\s*\{ key: 'circle', label: 'Circle', type: 'circle' \}/.test(fields), 'circleCard has no circle ref field')
assert.ok(/case 'product':\s*case 'event':\s*case 'circle':/.test(fields), 'the event and circle refs are not sanitized like the product ref')

const render = read('lib/email-studio/render.ts')
assert.ok(/case 'eventCard':\s*return eventCard\(/.test(render), 'the renderer has no eventCard case')
assert.ok(/case 'circleCard':\s*return circleCard\(/.test(render), 'the renderer has no circleCard case')
assert.ok(!/createAdminClient|from\('events'\)|from\('circles'\)/.test(render), 'the renderer reads live data (a reads-live block must resolve at send, not render)')

const resolver = read('lib/email-studio/data-blocks.ts')
assert.ok(/^import 'server-only'/m.test(resolver), 'data-blocks.ts is not server-only')
assert.ok(/export async function resolveDataBlockRefs/.test(resolver), 'no resolveDataBlockRefs')
assert.ok(/from\('events'\)/.test(resolver) && /from\('circles'\)/.test(resolver), 'the resolver does not read the live rows')
assert.ok(/is\('removed_at', null\)/.test(resolver), 'the resolver does not drop a removed event')
assert.ok(/LISTABLE_CIRCLE_STATUS/.test(resolver), 'the resolver does not scope circles to the listable statuses')

const send = read('lib/email-studio/send.ts')
assert.ok(/resolveDataBlockRefs\(await resolveProductRefs\(/.test(send), 'the send compile does not refresh the event and circle cards')

const canvas = read('components/admin/email-studio/canvas/canvas-block.tsx')
assert.ok(/id === 'eventCard' \|\| id === 'circleCard'/.test(canvas), 'the canvas has no preview for the two cards')
const editor = read('components/admin/email-studio/email-canvas-editor.tsx')
assert.ok(/<EventCardEditor /.test(editor) && /<CircleCardEditor /.test(editor), 'the rail does not open the pickers')
const actions = read('components/admin/email-studio/data-picker-actions.ts')
assert.ok(/^'use server'/.test(actions) && /writerGate\(\)/.test(actions), 'the picker actions are not server actions behind the writer gate')

const doc = read('docs/EDITOR-ARCHITECTURE.md')
assert.ok(/3 are email-only: `productCard`, and its siblings `eventCard` and `circleCard`/.test(doc), 'EDITOR-ARCHITECTURE §2.2 still counts one email-only block')

console.log('EMAIL-025: the Event and Circle cards are email blocks on the Product card contract, resolved at send.')
