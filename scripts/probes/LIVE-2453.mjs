// LIVE-2453: snap to frame, both ways, in the Spotlight editor.
import { readFileSync } from 'node:fs'
const fail = (m) => { console.error(`LIVE-2453: ${m}`); process.exit(1) }
const fr = readFileSync('components/spotlight/spotlight-preview-frame.tsx', 'utf8')
if (!/scrollIntoView\(\{ block: 'center'/.test(fr)) fail('a pick in the editor does not scroll the preview')
if (!/ns\.select\(link\.nid\)/.test(fr) || !/ns\.selectItem\(link\.index\)/.test(fr)) fail('a press on a link in the preview does not pick its row')
const mods = readFileSync('components/widgets/space-profile/space-profile-modules.tsx', 'utf8')
if (!/data-spotlight-nid=\{node\.nid\}/.test(mods)) fail('preview blocks carry no node id')
const site = readFileSync('lib/spaces/spotlight-site.ts', 'utf8')
if (!/holder\(\)\.spotlight && !holder\(\)\.preview/.test(site)) fail('a press in the preview could count as a visitor click')
const list = readFileSync('components/entity-blocks/node-link-list-builder.tsx', 'utf8')
if (!/data-nid=\{node\.nid\}/.test(list)) fail('the editor list cannot bring a picked row into view')
console.log('LIVE-2453 ok')
