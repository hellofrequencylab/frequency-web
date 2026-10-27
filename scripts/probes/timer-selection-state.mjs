// HYG-192: source bindings paired with rendered actual-helper tests in CI.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
for (const [file, names] of [
  ['components/on-air/session.tsx', ['ModeButton']],
  ['components/on-air/movement-session.tsx', ['ModeButton', 'Chip']],
]) {
  const text = readFileSync(file, 'utf8')
  for (const name of names) {
    const start = text.indexOf(`function ${name}(`)
    assert.ok(start >= 0, `${file}: actual ${name} must exist`)
    const end = text.indexOf('\n}\n', start)
    assert.ok(end > start, `${file}: actual helper body must be bounded`)
    const body = text.slice(start, end)
    const opening = body.slice(body.indexOf('<button'), body.indexOf('>', body.indexOf('<button')))
    assert.match(opening, /aria-pressed=\{Boolean\(active\)\}/, `${file} ${name}: selection must be announced`)
    assert.match(opening, /onClick=\{onClick\}/, `${file} ${name}: actual callback retained`)
    assert.match(opening, /type="button"/, `${file} ${name}: never submit a form`)
  }
}
console.log('Timer setup selection bindings pass (source contract; actual-helper renders run in CI).')
