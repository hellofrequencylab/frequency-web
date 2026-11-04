#!/usr/bin/env node
// check:roles (BLD-201, docs/EDITOR-NEXT.md G-ROLES): every lib/blocks/roles/*.role.json holds the whole role contract
// the builder reads, so the Add sheet, the layout chips and the Edit panel never meet a role with a gap.
//
// WHAT IT PROVES, per role file:
//   R1  the file is registered in ROLES (lib/blocks/roles/roles.ts) under its own file name, and `type` is unique.
//   R2  `intent` is a short owner-facing phrase, unique across roles, and `why` is its one-line card text; no em dashes.
//   R3  `group` is one of ROLE_GROUPS and `live` is a boolean.
//   R4  `icon` is a <symbol> in the Frequency sprite or the editor sprite (public/brand/frequency/), so it draws.
//   R5  every variant has a label and a `thumb` from ROLE_THUMBS; `default` names a variant; every `needs` names a slot or an item field.
//   R6  `slots.labels` names exactly the role's slots, each with a non-empty label and hint and no em dash.
//   R7  every ROLE_THUMBS name has a sketch the layout chips draw (components/builder/canvas/variants/thumbs.tsx).
//
// CANNOT SEE: whether the sketch a thumb names looks like the variant (the visual suite's job). Exit 1 on any problem.

import { readFileSync, readdirSync } from 'node:fs'
import { invokedDirectly } from './lib/invoked-directly.mjs'

const ROLES_DIR = 'lib/blocks/roles'
const THUMBS_FILE = 'components/builder/canvas/variants/thumbs.tsx'
const SPRITES = ['public/brand/frequency/frequency-icons.svg', 'public/brand/frequency/frequency-editor-icons.svg']

/** A `const NAME = [...] as const` string list, read from the TypeScript source (the script runs without a TS loader). */
export function constList(source, name) {
  const m = source.match(new RegExp(`${name} = \\[([^\\]]*)\\]`))
  if (!m) throw new Error(`check:roles: ${name} not found in roles.ts`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/** Every <symbol id> across the sprites. */
export function spriteIcons(sprites = SPRITES.map((p) => readFileSync(p, 'utf8'))) {
  return new Set(sprites.flatMap((s) => [...s.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1])))
}

const text = (v) => typeof v === 'string' && v.trim().length > 0

/** Problems with one role file, given the contract's vocabularies. */
export function roleProblems(id, r, { groups, thumbs, icons }) {
  const out = []
  const at = (msg) => out.push(`${id}: ${msg}`)
  if (!text(r.type)) at('no type')
  if (!text(r.intent)) at('no intent')
  else {
    if (r.intent.length > 40) at(`intent "${r.intent}" is over 40 characters`)
    if (r.intent.includes('—')) at('intent has an em dash')
  }
  if (!text(r.why)) at('no why line')
  else if (r.why.includes('\u2014')) at('why line has an em dash')
  if (!groups.includes(r.group)) at(`group "${r.group}" is not one of ${groups.join(', ')}`)
  if (typeof r.live !== 'boolean') at('live is not true or false')
  if (!icons.has(r.icon)) at(`icon "${r.icon}" is not in the sprite`)
  const slots = [...Object.keys(r.slots?.required ?? {}), ...Object.keys(r.slots?.optional ?? {})]
  const itemFields = Object.values({ ...r.slots?.required, ...r.slots?.optional }).flatMap((s) => (s && typeof s === 'object' && s.item ? Object.keys(s.item) : []))
  const variants = Object.entries(r.variants ?? {})
  if (!variants.length) at('no variants')
  for (const [key, v] of variants) {
    if (!text(v.label)) at(`variant ${key} has no label`)
    if (!thumbs.includes(v.thumb)) at(`variant ${key} thumb "${v.thumb}" is not one of ROLE_THUMBS`)
    for (const need of v.needs ?? []) if (!slots.includes(need) && !itemFields.includes(need)) at(`variant ${key} needs "${need}", which is not a slot or an item field`)
  }
  if (!(r.default in (r.variants ?? {}))) at(`default "${r.default}" is not a variant`)
  const labels = r.slots?.labels ?? {}
  for (const slot of slots) {
    const l = labels[slot]
    if (!l || !text(l.label) || !text(l.hint)) at(`slot ${slot} has no label and hint`)
    else if (`${l.label} ${l.hint}`.includes('—')) at(`slot ${slot} copy has an em dash`)
  }
  for (const slot of Object.keys(labels)) if (!slots.includes(slot)) at(`labels name "${slot}", which is not a slot`)
  return out
}

export function checkRoles() {
  const source = readFileSync(`${ROLES_DIR}/roles.ts`, 'utf8')
  const vocab = { groups: constList(source, 'ROLE_GROUPS'), thumbs: constList(source, 'ROLE_THUMBS'), icons: spriteIcons() }
  const problems = []
  // R7: every thumb the contract allows has a sketch the chip can draw (BLD-203).
  const sketches = readFileSync(THUMBS_FILE, 'utf8')
  for (const thumb of vocab.thumbs) if (!new RegExp(`^\\s+'?${thumb}'?: \\{`, 'm').test(sketches)) problems.push(`thumb ${thumb} has no sketch in ${THUMBS_FILE}`)
  const files = readdirSync(ROLES_DIR).filter((f) => f.endsWith('.role.json')).sort()
  const types = new Map()
  const intents = new Map()
  if (!files.length) problems.push('no role files found: a gate that finds nothing must say so')
  for (const file of files) {
    const id = file.replace('.role.json', '')
    if (!source.includes(`${id}: ${id} as RoleDefinition`)) problems.push(`${id}: not registered in ROLES`)
    const r = JSON.parse(readFileSync(`${ROLES_DIR}/${file}`, 'utf8'))
    problems.push(...roleProblems(id, r, vocab))
    if (types.has(r.type)) problems.push(`${id}: type ${r.type} is also ${types.get(r.type)}'s`)
    types.set(r.type, id)
    if (intents.has(r.intent)) problems.push(`${id}: intent "${r.intent}" is also ${intents.get(r.intent)}'s`)
    intents.set(r.intent, id)
  }
  return { roles: files.length, problems }
}

if (invokedDirectly(import.meta.url)) {
  const { roles, problems } = checkRoles()
  if (problems.length) {
    console.error(`check:roles: ${problems.length} problem(s) across ${roles} roles\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`check:roles: ${roles} roles hold the whole contract (intent, group, icon, live, thumbs, slot labels).`)
}
