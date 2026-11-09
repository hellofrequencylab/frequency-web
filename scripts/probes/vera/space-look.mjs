import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// LIVE-2187: Vera proposes the Space page's look (cover style, logo backdrop, top of page height, top buttons) from
// closed lists, and the owner or an admin confirms it. Runs the real settings module: only the closed values have a
// card, the card says it in plain words, and the guide lists each with its value now. Then reads the wiring: the
// turn reads each look setting's value now, and a tap goes through the page look settings' own guarded actions.
const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const code = ts.transpileModule(read('lib/ai/vera/space-settings.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const mod = { exports: {} }
new vm.Script(`(function(require,module,exports){${code}\n})`).runInNewContext({ Object, Array, JSON })((key) => {
  if (key === '@/lib/time/zone') return { isValidTimeZone: () => false }
  throw new Error(`Unexpected dependency ${key}`)
}, mod, mod.exports)
const { veraSettingCard, veraSettingsGuide } = mod.exports

assert.equal(veraSettingCard('page.cover_style', 'blend'), "Show a photo that fades into the page at the top of this Space's page?")
assert.equal(veraSettingCard('page.logo_backdrop', 'none'), "Put this Space's logo straight on the cover?")
assert.equal(veraSettingCard('page.hero_height', 'tall'), "Make the top of this Space's page tall?")
assert.equal(veraSettingCard('page.hero_buttons', 'stacked'), "Lay the buttons at the top of this Space's page one above the other?")
for (const [id, bad] of [['page.cover_style', '#000000'], ['page.logo_backdrop', 'off'], ['page.hero_height', 'medium'], ['page.hero_buttons', 'constructor']]) {
  assert.equal(veraSettingCard(id, bad), null, `${id} takes only its closed values`)
}
assert.match(veraSettingsGuide('sunrise', { 'page.cover_style': 'shade' }), /- page\.cover_style \(Cover style\): .* Now: shade\. Values: one of none, shade, blend\. Where: \/spaces\/sunrise\/manage\/layout/)

assert.match(read('lib/ai/vera/turn.ts'), /veraSettingsGuide\(found\.slug, \{ \.\.\.pageLookNow\(found\), \.\.\.settingsNow\(found\) \}\)/, 'the turn hands in the look values now')
const confirm = read('app/onboarding/vera-actions.ts')
assert.match(confirm, /'page\.cover_style': \(slug, value\) => setSpaceCoverScrim\(slug, value as CoverScrim\)/)
assert.match(confirm, /'page\.logo_backdrop': \(slug, value\) => setSpaceLogoBackdrop\(slug, value as LogoBackdrop\)/)
assert.match(confirm, /'page\.hero_height': \(slug, value\) => setSpaceHeroLook\(slug, \{ height: value as HeroHeight \}\)/)
assert.match(confirm, /'page\.hero_buttons': \(slug, value\) => setSpaceHeroLook\(slug, \{ buttonOrientation: value as HeroButtonOrientation \}\)/)
assert.match(confirm, /const write = Object\.hasOwn\(SETTING_WRITERS, setting\) \? SETTING_WRITERS\[setting\] : null/, 'an unknown setting writes nothing')
console.log('LIVE-2187 ok: Vera proposes the Space page look from closed lists, and a tap goes through the page look actions')
