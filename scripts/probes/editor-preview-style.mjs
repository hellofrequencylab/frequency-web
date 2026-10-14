// LIVE-908: the website editor's canvas previews a page in the look the live site gives it. Before, a Frequency
// site on another font set with a brand accent previewed in the DAWN contract's Anton and amber while the live page
// wore the owner's fonts and accent (danieltyack.com, 2026-10-13). Measures the consequences:
//   1. the live page and the editor resolve theme, fonts and accent through ONE resolver (siteRenderStyle), and the
//      live page no longer resolves its accent by hand;
//   2. the canvas wears the resolved tokens (themeVars) and the font set's `data-space-theme`;
//   3. every font set's faces in SPACE_THEME_FONT_VARS are the ones its app/globals.css block binds, so the canvas
//      and the live page name the same `--font-*` variables.
// The behavioural equality is held by lib/sites/site-render-style.test.ts.
// Run: node scripts/probes/editor-preview-style.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const site = readFileSync('components/sites/site-page.tsx', 'utf8')
const shell = readFileSync('components/sites/editor/shell.tsx', 'utf8')
const canvas = readFileSync('components/sites/editor/canvas.tsx', 'utf8')
const editorPage = readFileSync('components/sites/editor/editor-page.tsx', 'utf8')
const themes = readFileSync('lib/theme/space-themes.ts', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')

// 1. One resolver.
assert.match(site, /siteRenderStyle\(siteStyle, websiteBrand\.accent, defaultAccentForType\(space\.type\)\)/, 'the live page resolves through siteRenderStyle')
assert.ok(!/resolveAccentVars\(/.test(site), 'the live page does not resolve its accent by hand')
assert.match(shell, /siteRenderStyle\(sitePageStyle\(/, 'the editor resolves its page through siteRenderStyle over sitePageStyle')
assert.match(editorPage, /defaultAccent=\{defaultAccentForType\(space\.type\)\}/, 'the editor gets the Space type default accent the live page falls back to')

// 2. The canvas wears it.
assert.match(shell, /themeVars=\{canvasVars\} spaceTheme=\{render\.fonts\}/, 'the shell hands the canvas the resolved tokens and font set')
assert.match(canvas, /data-space-theme=\{spaceTheme\} style=\{themeVars \?\?/, 'the canvas root wears them')

// 3. The font sets agree with globals.css.
const map = themes.match(/SPACE_THEME_FONT_VARS[^=]*=\s*\{([^}]*)\}/)?.[1] ?? ''
const entries = [...map.matchAll(/(\w+): \['(--font-[a-z0-9-]+)', '(--font-[a-z0-9-]+)'\]/g)]
assert.ok(entries.length >= 7, 'SPACE_THEME_FONT_VARS names every font set')
for (const [, id, display, body] of entries) {
  const block = css.match(new RegExp(`\\[data-space-theme="${id}"\\]\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  assert.ok(block.includes(`--font-display: var(${display})`), `${id}: display face matches globals.css`)
  assert.ok(block.includes(`--font-body: var(${body})`), `${id}: body face matches globals.css`)
}

console.log('editor-preview-style: the editor canvas and the live page resolve one look')
