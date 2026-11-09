import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// LIVE-2186: Vera proposes a setting inside a Space's settings sections (the calendar's time zone and sky markers
// first), and the owner or an admin confirms it. Runs the real settings module with a stand-in zone check: a value
// is checked before a card exists, a setting off the list has no card, and the guide lists each setting with its
// value now. Then reads the wiring: the turn adds the list only to the guide that offers changes, the model
// chokepoint refuses a setting or value off the list, and a tap goes through the calendar page's own guarded
// actions.
const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const code = ts.transpileModule(read('lib/ai/vera/space-settings.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const mod = { exports: {} }
new vm.Script(`(function(require,module,exports){${code}\n})`).runInNewContext({ Object, Array, JSON })((key) => {
  if (key === '@/lib/time/zone') return { isValidTimeZone: (z) => z === 'America/Chicago' }
  throw new Error(`Unexpected dependency ${key}`)
}, mod, mod.exports)
const { veraSettingCard, veraSettingsGuide } = mod.exports

assert.equal(veraSettingCard('calendar.time_zone', 'America/Chicago'), "Keep this Space's dates in America/Chicago?")
assert.equal(veraSettingCard('calendar.time_zone', 'Mars/Olympus'), null, 'a zone the tz database does not know has no card')
assert.equal(veraSettingCard('calendar.sky_markers', 'on'), "Show sky markers on this Space's calendar?")
assert.equal(veraSettingCard('calendar.sky_markers', 'yes'), null, 'a toggle takes on or off only')
assert.equal(veraSettingCard('payments.payouts', 'on'), null, 'a setting off the list has no card')
assert.equal(veraSettingCard('toString', 'on'), null)
const guide = veraSettingsGuide('sunrise', { 'calendar.sky_markers': 'off' })
assert.match(guide, /set_space_setting tool \(space "sunrise"/)
assert.match(guide, /- calendar\.sky_markers \(Sky markers\): .* Now: off\. Values: on or off\. Where: \/spaces\/sunrise\/settings\/calendar/)
assert.equal(veraSettingsGuide('sunrise', {}), '', 'nothing applies, nothing listed')

const turn = read('lib/ai/vera/turn.ts')
assert.match(turn, /guide\.includes\('set_space_feature'\) \? \[guide, veraSettingsGuide\(/, 'only the owner or admin guide gets the settings')
assert.match(turn, /if \(!events \|\| !spaceFunctionEnabled\(space, events\)\) return \{\}/, 'calendar settings only while the Calendar is on')
assert.match(read('lib/ai/vera/agent-claude.ts'), /settingCard: veraSettingCard/)
assert.match(read('lib/ai/vera/model-tools.ts'), /c\.name === 'set_space_setting' && !space\?\.settingCard\?\.\(/, 'the chokepoint refuses a setting it may not offer')
const confirm = read('app/onboarding/vera-actions.ts')
assert.match(confirm, /const value = veraSettingValue\(setting, args\.value\)\n  if \(value === null\) return \{ ok: false/, 'the confirm path re-checks the setting and value')
assert.match(confirm, /await setSpaceTimeZone\(slug, value\)/, 'a time zone tap goes through the calendar page action')
assert.match(confirm, /await setSpaceSkyMarkers\(slug, value === 'on'\)/, 'a sky markers tap goes through the calendar page action')
console.log('LIVE-2186 ok: Vera proposes a Space setting to its owner or an admin, values are checked, and a tap goes through the page action')
