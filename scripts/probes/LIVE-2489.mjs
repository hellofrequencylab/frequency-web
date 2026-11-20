#!/usr/bin/env node
// LIVE-2489: the Circle header reads cleanly on a phone. The status badge and the "Part of <Space>" pill sit in
// their own row in flow (never absolutely over the title), and under 520px of column the cover art becomes its
// own band above the name, facts and buttons, with one primary action spanning the row. Fails when the badges
// go back to absolute positions over the cover, or when the phone rules stop stacking the art above the text.
import { readFileSync } from 'node:fs'

const shell = readFileSync('components/frequency/members/circle/circle-shell.tsx', 'utf8')
const css = readFileSync('app/themes/frequency/members-circle.css', 'utf8')
const rule = (sel) => (css.match(new RegExp(`\\] ${sel.replace(/[.[\]]/g, '\\$&')}\\{([^}]*)\\}`)) || [])[1] ?? ''
const bad = []
if (!/className="fqc-cover-top"/.test(shell)) bad.push('the badge row is gone from the cover')
if (!/className="fqc-cover-art"/.test(shell)) bad.push('the cover art is not its own layer')
if (/position:absolute/.test(rule('.fqc-badge')) || /position:absolute/.test(rule('.fqc-space-pill'))) bad.push('a badge is absolutely placed over the title again')
const phone = css.split('@container (max-width:520px){')[1]?.split('\n}\n')[0] ?? ''
if (!phone) bad.push('no phone rules for the Circle cover')
if (!/\.fqc-cover-art\{position:relative[^}]*aspect-ratio/.test(phone)) bad.push('the phone cover no longer puts the art in its own band')
if (!/\.fqc-cover \.h1\{color:var\(--fq-text-strong\)/.test(phone)) bad.push('the phone title is not on the panel in the kit ink')
if (!/\.fqc-act-main\{order:-1/.test(phone)) bad.push('the primary action does not lead on a phone')
if (bad.length) {
  console.error('LIVE-2489: ' + bad.join('; '))
  process.exit(1)
}
console.log('LIVE-2489 circle phone header: ok')
