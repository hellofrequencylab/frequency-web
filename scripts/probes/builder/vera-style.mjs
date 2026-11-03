import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// LIVE-2098: Vera can change the site's STYLE in the website editor, but only by picking from the theme's own menu
// (the dials, accents and Looks the Style panel offers). Runs the real vocabulary: menu picks parse, a colour, a font
// or an invented option is refused with a reason, the patch matches the Style panel's own write, and the editor
// sends the menu and applies style and section lines in one commit.
const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const resolve = (key) => {
    if (!key.startsWith('.') && !key.startsWith('@/')) return require(key)
    const rel = key.startsWith('@/') ? key.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), key))
    if (rel.endsWith('.json')) return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(path.join(root, rel + ext))) return load(rel + ext)
    throw new Error(`Unexpected dependency ${key} from ${file}`)
  }
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Math, Date, Object, JSON, Number, Set, Map, Array, String, structuredClone, crypto: globalThis.crypto })(resolve, mod, mod.exports)
  return mod.exports
}
const v = load('lib/sites/editor/vera-layout.ts')
const menu = {
  dials: [{ id: 'corners', label: 'Corners', options: [{ id: 'soft', label: 'Soft' }, { id: 'square', label: 'Square' }], current: 'square', own: 'square' }],
  accents: [{ id: 'tide', label: 'Tide' }], accent: null,
  looks: [{ id: 'crisp', label: 'Crisp', dials: { corners: 'square' } }],
}
const parsed = v.parseWebsiteVeraLayout({ changes: [
  { kind: 'style', dial: 'corners', option: 'soft' },
  { kind: 'accent', accent: 'tide' },
  { kind: 'accent', accent: '#ff00aa' },
  { kind: 'style', dial: 'font', option: 'comic' },
  { kind: 'style', dial: 'corners', option: 'soft', css: 'border-radius:99px' },
] }, new Set(['hero']), menu)
assert.equal(parsed.changes.length, 2, 'only the two menu picks survive')
assert.equal(parsed.refused.length, 3, 'a raw colour, an unknown dial and a CSS key are refused, not dropped')
assert.ok(!JSON.stringify(parsed.changes).includes('#ff00aa') && !JSON.stringify(parsed.changes).includes('99px'), 'no colour or CSS reaches the draft')
assert.equal(v.parseWebsiteVeraLayout({ changes: [{ kind: 'accent', accent: 'tide' }] }, new Set(['hero'])).changes.length, 0, 'no menu, no style change')
const patch = v.websiteVeraStylePatch(menu, parsed.changes)
assert.equal(JSON.stringify(patch.patch), JSON.stringify({ corners: 'soft', accent: 'tide' }))
assert.equal(v.websiteVeraStylePatch(menu, [{ kind: 'style', dial: 'corners', option: 'square' }]).patch.corners, null, "the theme's own value stores nothing, as the Style panel does")
const shell = fs.readFileSync(path.join(root, 'components/sites/editor/shell.tsx'), 'utf8')
const action = fs.readFileSync(path.join(root, 'lib/sites/editor/actions.ts'), 'utf8')
assert.match(shell, /onLayout\(text, websiteVeraOutline\(page\.doc, config\), menu[,)]/, 'the editor sends the theme menu with the ask')
assert.match(shell, /websiteVeraStylePatch\(veraStyleMenu, chosen\)/, 'style lines are checked again against the theme the draft wears now')
assert.match(shell, /commit\(\{ \.\.\.withPageDoc\(latest\.current, doc\), look: lookWith\(/, 'sections and style land in one undo step')
assert.match(action, /parseWebsiteVeraLayout\(input, new Set\(outline\.map\(\(s\) => s\.id\)\), menu\)/, 'the server parses the reply against the menu too')
console.log("LIVE-2098 ok: Vera changes style only from the theme's own menu, on the draft, in one undo step")
