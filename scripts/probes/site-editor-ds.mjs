// LIVE-907: the website editor wears the Frequency design system's Site Editor (design_handoff_site_editor), not the
// theme of the site it edits. Measures the consequences:
//   1. the chrome reads the design system's Commons tokens and faces, scoped to the editor (never app/globals.css or
//      the root layout), and the shell root no longer takes the site theme's variables;
//   2. a section picked in Layers scrolls the canvas to it, and Layers rows name the section type with its own line;
//   3. the inspector has the handoff's Content · Design · Advanced · Notes tabs and its Duplicate / Delete footer;
//   4. the theme faces a site may wear (Network, Wildheart) reach the canvas frame from the editor route alone.
// Run: node scripts/probes/site-editor-ds.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('components/sites/editor/editor.css', 'utf8')
const shell = readFileSync('components/sites/editor/shell.tsx', 'utf8')
const canvas = readFileSync('components/sites/editor/canvas.tsx', 'utf8')
const page = readFileSync('components/sites/editor/editor-page.tsx', 'utf8')

// 1. Design-system chrome.
for (const token of ['--pa:', '--pa-soft:', '--x-violet-deep:', '--surface-card:', '--text-strong:']) assert.ok(css.includes(token), `editor.css defines ${token}`)
assert.match(css, /\.we-shell\{[^}]*--th-accent:var\(--x-violet-deep\)/, 'the chrome maps its accent to the design system violet')
assert.ok(!/data-editor-root[^>]*style=\{websiteThemeVars/.test(shell), 'the shell root does not wear the site theme')
assert.ok(shell.includes('Unbounded') && shell.includes('Hanken+Grotesk'), 'the editor asks for the design system faces')
assert.ok(!readFileSync('app/layout.tsx', 'utf8').includes('Unbounded'), 'the root layout never registers them')

// 2. Layers ⇄ canvas.
assert.ok(canvas.includes('Layers → canvas') && /view\.scrollTo\(/.test(canvas), 'a section picked in Layers scrolls the canvas to it')
assert.ok(shell.includes('className="we-row we-layer"') && shell.includes('sectionLine('), 'Layers rows show the section type and its own line')

// 3. Inspector.
for (const label of ["'Content'", "'Design'", "'Advanced'", '>Notes']) assert.ok(shell.includes(label), `the inspector has the ${label} tab`)
assert.ok(shell.includes('className="we-ifoot"') && shell.includes('Duplicate') && shell.includes('Delete'), 'the inspector footer duplicates and deletes')
assert.ok(readFileSync('components/sites/editor/inspector.tsx', 'utf8').includes("tab?: 'content' | 'design' | 'advanced'"), 'the inspector splits by tab')

// 4. Theme faces in the frame.
assert.ok(page.includes('NETWORK_FONT_CLASS') && page.includes('WILDHEART_FONT_CLASS'), 'the editor route registers the theme faces')
assert.ok(canvas.includes("closest<HTMLElement>('[data-editor-root]')"), 'the frame copies the faces from the editor root')
console.log('site-editor-ds: ok')
