// LIVE-2522: one stitch per button on aidentyack.com. Every button draws its stitch as a ::after dash box (the design's 7-on 5-off
// dash), and the skin turns the old dashed outline off for all of them. Three later rules (the band hero's secondary button, a
// secondary button in a row of actions, the band FAQ button) brought a dashed outline back with higher specificity, so "Order
// Custom" and "Start a Repair" drew two stitches (Daniel, 17:30Z: "The Order Custom button has double stitch."). This reads the
// skin: the only rule that may give a button a dashed outline is the base rule the later `outline:0` overrides.
import { readFileSync } from 'node:fs'
const skin = readFileSync('components/sites/aiden-tyack-css.ts', 'utf8')
const rules = skin.split('\n').filter((l) => l.includes('[data-part="cta"]') && !l.includes('::after'))
const dashed = rules.filter((l) => /outline:var\(--at-frame\)/.test(l))
const base = dashed.filter((l) => l.startsWith('${A} [data-role][data-role] [data-part="cta"]{position:relative'))
const reset = skin.includes('${A} [data-role][data-role] [data-part="cta"]{outline:0}')
const after = /\[data-role\]\[data-role\] \[data-part="cta"\]::after\{content:"";position:absolute;inset:4px/.test(skin)
const extra = dashed.length - base.length
console.log(`LIVE-2522: ${extra} button rules add a second stitch; base outline reset: ${reset}; dash box stitch: ${after}: ${extra || !reset || !after ? 'RED' : 'ok'}`)
if (extra || !reset || !after) process.exit(1)
