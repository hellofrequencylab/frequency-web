// LIVE-2454: Spotlight link rows that show the whole title, link styles with a block default and a per-link
// override, and the owner's own pick for the main button.
import { readFileSync } from 'node:fs'
const fail = (m) => { console.error(`LIVE-2454: ${m}`); process.exit(1) }
const read = (f) => readFileSync(f, 'utf8')
const bc = read('lib/entity-blocks/block-content.ts')
if (!/LINK_STYLES = \['main', 'button', 'card', 'text'\]/.test(bc)) fail('no link styles')
if (!/const style = asLinkStyle\(o\.style\)/.test(bc)) fail('the sanitizer drops a link\'s own style')
if (!/key: 'linkStyle'/.test(bc)) fail('the Links block has no block-wide style')
const ed = read('components/entity-blocks/controls/links-editor.tsx')
if (/w-1\/3/.test(ed) || !/Make this the main button/.test(ed) || !/suggestLinkTitle/.test(ed)) fail('the link rows are not the new editor')
if (/function LinksEditor/.test(read('components/entity-blocks/block-edit-panel.tsx'))) fail('the old cramped link editor is still in the panel')
const view = read('components/entity-blocks/content-block-view.tsx')
if (!/LINK_STYLE_CLASS\[it\.style\]/.test(view)) fail('the Links block ignores link styles')
const nw = read('lib/spotlight/new-world-kit-content.ts')
if (!/l\.style === 'main'/.test(nw) || /frequencylocal\.com'\) \?\?/.test(nw)) fail('the New World main button is not the owner\'s pick')
console.log('LIVE-2454 ok')
