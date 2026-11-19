#!/usr/bin/env node
// LIVE-2432 probe: the /themes showcase lists Honey and Mindless with a skin, a decoration, a builder link and a real shot for every
// accent and surface. Reads the sources (no build).
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const dir = 'components/frequency/site/pages/themes'
const data = read(`${dir}/kit-showcase/data.ts`)
const skins = read(`${dir}/kit-showcase/skins.ts`)
const links = read(`${dir}/frequency-themes.tsx`)
const problems = []
const kits = { honey: { theme: 'free-human', accents: ['madder', 'moss', 'wine', 'indigo', 'ochre'] }, mindless: { theme: 'mindless', accents: ['yellow', 'pink', 'blue'] } }
for (const [id, k] of Object.entries(kits)) {
  if (!data.includes(`{id:'${id}',`)) problems.push(`THEMES has no ${id} kit`)
  if (!data.includes(`"${id}":[`)) problems.push(`SPD has no ${id} entry`)
  if ((skins.match(new RegExp(`^ ${id}:\\(A`, 'gm')) ?? []).length < 2) problems.push(`${id} needs both a SKIN and a DECO`)
  if (!links.includes(`${id}: { theme: '${k.theme}'`)) problems.push(`KIT_THEMES has no ${id} link to ${k.theme}`)
  for (const a of k.accents) for (const s of ['site', 'spot', 'email']) {
    const f = `public/themes-index/s/themes/${id}/shots/${a}-${s}.webp`
    if (!existsSync(f)) problems.push(`${f} is missing`)
  }
}
const count = (data.match(/^ \{id:'/gm) ?? []).length
if (count < 11) problems.push(`the showcase lists ${count} kits, not eleven`)
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
console.log(`LIVE-2432: the /themes showcase lists ${count} kits, Honey and Mindless with every accent drawn`)
