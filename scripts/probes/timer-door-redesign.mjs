// LIVE-2245: the Mindless door wears the Claude Design redesign of 2026-11-10 on the same props as
// the restore (LIVE-2241..2244): one component, a sheet under 840px and a dialog from it, the orb
// as the length field, Practice and How pickers, settings rows one open at a time, the note on the
// door for Journal and Just Log, "Log it" / "Continue, N min left" / "Start timer" as the one Go.
// Source contract; the render tests are components/on-air/compact-setup.test.tsx in the test job.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const read = (p) => readFileSync(p, 'utf8')
const door = read('components/on-air/compact-setup.tsx')
for (const needle of [
  "'(min-width: 840px)'",
  'aria-label="Mindless timer setup"',
  'label="Length presets in minutes"',
  "'Log it'",
  '`Continue, ${remainingMin} min left`',
  "'Start timer'",
  'Start fresh',
  '>Today<',
]) assert.ok(door.includes(needle), `the door must carry ${needle}`)
assert.ok(!door.includes("'Open practice'"), 'Open practice is retired: Just Log logs from the door (handoff decision 1)')
assert.ok(!door.includes('More settings'), 'no second screen')
const doorFiles = ['components/on-air/compact-setup.tsx', 'components/on-air/door/door-section.tsx', 'components/on-air/door/cue-sections.tsx', 'components/on-air/door/still-sections.tsx', 'components/on-air/door/move-sections.tsx']
for (const f of doorFiles) {
  const src = read(f)
  assert.ok(!/--fq-/.test(src), `${f} must not name a --fq-* token (docs/THEME.md)`)
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src.replace(/#mx-|#\{/g, '')), `${f} must not carry a hex colour`)
}
assert.ok(read('components/on-air/door/still-sections.tsx').includes('export function NoteField'), 'the note is typed on the door')
const engine = read('components/on-air/session.tsx')
assert.ok(engine.includes('initialNote?: string') && engine.includes('logNow?: boolean'), 'the sit engine must take the door note and Log it')
assert.ok(engine.includes("if (mode === 'log' && !logNow) return"), 'a practice chip still opens the note screen; only the door logs at once')
const provider = read('components/on-air/mindless.tsx')
assert.ok(provider.includes('initialNote={state.note}') && provider.includes('logNow={state.logNow}'), 'the provider must hand the note and Log it to the engine')
assert.ok(read('components/on-air/compact-setup.test.tsx').includes('from 840px'), 'the dialog layout must be rendered in the test job')
console.log('The Mindless door redesign contract holds (LIVE-2245).')
