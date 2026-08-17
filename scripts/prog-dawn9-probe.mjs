#!/usr/bin/env node
// PROG-DAWN9 — the probe for "DAWN Phase 9: fix the two instrument defects".
//
// It does NOT look for the fix. It re-creates each defect's decisive case and asks the SHIPPED
// instrument for an answer, because the row's consequence is "the ratchet gives a different answer
// on a case where the broken one was wrong". Every assertion below is a case the pre-fix gate got
// wrong; a grep for `escape` or `strip-comments@2` would pass by existing, which is the shape this
// repo's own rules forbid.
//
// Exit 0 = the instruments measure the consequence · 1 = a defect is back · 79 = cannot tell.

import { loadConfig, loadCorpus, evaluate, countEntry, stripComments } from './check-adoption.mjs'

const INDETERMINATE = 79
const fail = []
const note = []

let config, base
try {
  config = loadConfig()
  base = loadCorpus(config)
} catch (err) {
  console.error(`PROG-DAWN9 probe cannot read its subject: ${err.message}`)
  process.exit(INDETERMINATE)
}
const entry = (key) => {
  const e = config.entries.find((x) => x.key === key)
  if (!e) { console.error(`PROG-DAWN9 probe: no baseline entry "${key}" — the ratchet was restructured.`); process.exit(INDETERMINATE) }
  return e
}
const seed = (source) => [...base.filter((f) => f.path !== 'components/__probe__.tsx'),
  { path: 'components/__probe__.tsx', text: stripComments(source), source }]
const current = (key, corpus) => evaluate([entry(key)], corpus)[0].current
const check = (label, got, want) => { (got === want ? note : fail).push(`${got === want ? 'ok  ' : 'FAIL'} ${label} — got ${got}, want ${want}`) }

// ── DEFECT 1 — raw-input counted controls no primitive can receive ───────────────────────────
// Pre-fix: every one of these read 1. The carve-out must exempt the concealed TRIGGER shape and
// nothing wider, so the visible file input is the half that proves it is not just a blanket pass.
const inputs = current('raw-input', base)
check('a concealed file trigger is not a field', current('raw-input', seed('<input ref={r} type="file" accept="image/*" className="hidden" onChange={go} />')), inputs)
check('…in the other attribute order too', current('raw-input', seed('<input className="sr-only" type="file" multiple />')), inputs)
check('…and spelled as a bare hidden attribute', current('raw-input', seed('<input type="file" accept="image/*" hidden />')), inputs)
check('a VISIBLE file input is still debt', current('raw-input', seed('<input type="file" className="w-full rounded-control border" />')), inputs + 1)
check('an ordinary raw control is still debt', current('raw-input', seed('<input type="text" name="q" className="w-full" />')), inputs + 1)

// ── DEFECT 2 — white-black-literals could not tell a carve-out from a bug ─────────────────────
// Pre-fix the floor was 27 written carve-outs, so a bare monochrome could hide behind retiring one
// of them and the class read "held". The floor is the assertion: at 0, the next one fails CI.
const mono = current('white-black-literals', base)
check('the monochrome floor is 0, not a pile of carve-outs', mono, 0)
check('a bare monochrome fails', current('white-black-literals', seed('<div className="bg-white" />')), 1)
check('a stated reason exempts the site it was written about', current('white-black-literals', seed('// KEEP bg-white: a QR reader needs a true-white quiet zone.\n<div className="bg-white" />')), 0)
check('one reason cannot cover two literals', current('white-black-literals', seed('// KEEP bg-white: a QR reader needs a true-white quiet zone.\n<div className="bg-white" />\n<div className="bg-white" />')), 1)
check('a shrug is not a reason', current('white-black-literals', seed('// KEEP\n<div className="bg-white" />')), 1)

// ── DEFECT 3 — the corpus blanked real markup out of a string literal ────────────────────────
// Found underneath defect 1 and the reason its fix only reached 15 of 37 sites without this.
const glob = '<input type="file" accept="image/*" className="hidden rounded-lg" />\nconst x = 1\n/** doc */\n<div className="rounded-lg" />'
check('an accept glob does not open a comment', (stripComments(glob).match(/rounded-lg/g) ?? []).length, 2)
check('a real comment is still blanked', stripComments('/* shadow-lg */').trim().length, 0)
check('blanking is length-preserving', stripComments(glob).length, glob.length)

// ── The mechanism that keeps all three honest ────────────────────────────────────────────────
try {
  countEntry({ ...entry('white-black-literals'), mode: 'files' }, [{ path: 'app/a.tsx', text: 'bg-white', source: 'bg-white' }])
  fail.push('FAIL an escape declared in files mode is silently ignored')
} catch { note.push('ok   an escape that cannot be honoured throws instead of reading as coverage') }

for (const line of note) console.log(`  ${line}`)
if (fail.length === 0) { console.log(`\n✓ PROG-DAWN9: ${note.length} consequence checks hold.`); process.exit(0) }
console.error(`\n✗ PROG-DAWN9: ${fail.length} instrument defect(s) are back.\n`)
for (const line of fail) console.error(`  ${line}`)
process.exit(1)
