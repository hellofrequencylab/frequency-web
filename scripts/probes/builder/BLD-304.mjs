// BLD-304: view as. Host, Member and Visitor in the top bar as one kit control whose actions are in ⌘K; a visitor or
// member view previews the page through the renderers' own gates (editing placeholders off, tags off, a live role's sample
// copy with no Space rows left out, unknown blocks left out), lists what that view never meets with the reason, and the
// test proves host-only sections are absent in the visitor preview and present for the host.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const lib = read('lib/builder/view-as.ts')
for (const fn of ['viewerLens', 'hostOnlySections', 'viewerDoc']) if (!lib.includes(`export function ${fn}(`)) bad.push(`view-as.ts must export ${fn}`)
if (!/roleDrawsNothingForVisitor\(role, /.test(lib)) bad.push('the visitor gate must be the renderers\' own emptyLive rule, not a copy')
const roles = read('components/page-editor/blocks/roles.tsx')
if (!/export function roleDrawsNothingForVisitor\(/.test(roles) || !/return emptyLive\(props, metadata, roleHasSpaceRows\(id, metadata, now\)\)/.test(roles)) bad.push('roles.tsx must expose its emptyLive gate as one question')
const ui = read('components/builder/view-as/view-as.tsx')
if (!/SegmentedControl/.test(ui) || !/'data-action': `view-\$\{v\.id\}`/.test(ui) || !/h\.reason/.test(ui)) bad.push('the switch must be the kit segmented control with action ids, and the notes must carry the reason')
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/<ViewAsSwitch view=\{view\} onChange=\{viewAs\}/.test(shell)) bad.push('the top bar must carry the switch')
const drawsViewed = /doc=\{viewed\.doc\}/.test(shell) || (/doc=\{canvasDoc\}/.test(shell) && /surfaceSections\(viewed\.doc,/.test(shell) && /\{ \.\.\.viewed\.doc, content: surfaced\.shown \} : viewed\.doc/.test(shell))
if (!drawsViewed || !/metadata=\{lens\.metadata\}/.test(shell) || !/tags=\{lens\.tags && !state\.preview \? tags : undefined\}/.test(shell)) bad.push('the canvas must draw the viewed document with the view\'s metadata and tags')
if (!/<ViewAsNotes view=\{view\} hostOnly=\{viewed\.hostOnly\}/.test(shell)) bad.push('what a view never meets must be listed')
const commands = read('lib/builder/commands.ts')
for (const v of ['host', 'member', 'visitor']) if (!commands.includes(`'view-${v}'`)) bad.push(`⌘K must list view-${v}`)
const test = read('lib/builder/view-as.test.ts')
if (!/for \(const h of hostOnly\) expect\(shown\.doc\.content\.some\(\(s\) => s\.props\.id === h\.id\)\)\.toBe\(false\)/.test(test)) bad.push('the test must prove host-only sections are absent in the visitor preview')
if (!/expect\(host\.doc\)\.toBe\(doc\)/.test(test)) bad.push('the test must prove the host sees the whole page')
if (/#[0-9a-fA-F]{3,8}\b/.test(read('components/builder/view-as/view-as.module.css'))) bad.push('no hex in the builder chrome')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
