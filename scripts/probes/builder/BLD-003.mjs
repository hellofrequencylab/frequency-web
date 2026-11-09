// BLD-003: every glyph the builder names (undo, redo, eye, eye-off, three devices, outline, pin, unpin, fold, history, surface, variant, sample) resolves in a sprite.
import fs from 'node:fs'
const editor = fs.readFileSync('public/brand/frequency/frequency-editor-icons.svg', 'utf8')
const main = fs.readFileSync('public/brand/frequency/frequency-icons.svg', 'utf8')
const has = (svg, id) => svg.includes(`<symbol id="${id}"`)
const need = ['undo', 'redo', 'eye', 'eye-off', 'desktop', 'tablet', 'phone', 'outline', 'unpin', 'fold-left', 'fold-right', 'history', 'surface', 'variant', 'sample']
const bad = need.filter((i) => !has(editor, i))
if (!has(main, 'pin')) bad.push('pin')
if (bad.length) { console.error('missing icons: ' + bad.join(', ')); process.exit(1) }
