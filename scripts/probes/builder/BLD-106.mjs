// BLD-106: the command bar reaches every action. lib/builder/commands.ts names each action once; the shell's
// buttons carry the same ids (data-action); the bar opens on ⌘K or Ctrl+K and on its visible Find button, traps
// focus while open and hands it back on close.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const reg = read('lib/builder/commands.ts')
const ids = [...reg.matchAll(/^\s+'?([\w-]+)'?: \{ label:/gm)].map((m) => m[1])
if (ids.length < 15) bad.push('the action registry looks empty')
const shell = read('components/builder/shell/builder-shell.tsx')
for (const id of [...shell.matchAll(/data-action="([\w-]+)"/g)].map((m) => m[1])) if (!ids.includes(id)) bad.push(`button ${id} is not in the registry`)
for (const id of ids) if (!shell.includes(`'${id}'`)) bad.push(`the shell cannot run ${id}`)
if (!/event\.key\.toLowerCase\(\) === 'k'/.test(shell) || !/id="builder-command"/.test(shell)) bad.push('⌘K and a visible Find button must open the bar')
const bar = read('components/builder/command/command-bar.tsx')
if (!/aria-modal="true"/.test(bar) || !/e\.key === 'Tab'/.test(bar) || !/before\?\.focus\?\.\(\)/.test(bar)) bad.push('the bar must trap focus and return it on close')
if (!/every toolbar and rail button is in the registry/.test(read('lib/builder/commands.test.ts'))) bad.push('the reachability test is missing')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
