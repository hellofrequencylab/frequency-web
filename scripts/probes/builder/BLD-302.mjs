// BLD-302: the email surface shows the page as the email it would send, compiled by compileEmailDoc itself (the one
// seam every campaign, drip and nurture send runs), from blocks in the email palette; a role says how it appears there
// (draw, freeze, hide), a send-resolved block is marked as the snapshot the send refreshes, and the test proves the
// lens's bytes are compileEmailDoc's.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const lens = read('lib/builder/email-lens.ts')
if (!/import \{ compileEmailDoc[^}]*\} from '@\/lib\/email-studio\/shell'/.test(lens)) bad.push('the lens must compile through compileEmailDoc')
if (!lens.includes('EMAIL_PALETTE_BLOCK_IDS')) bad.push('the lens must read the email palette, never its own list')
if (!/resolveAt === 'send'/.test(lens)) bad.push('the lens must mark send-resolved blocks from their contract')
if (!/surfaces\.email/.test(lens)) bad.push('the lens must read each role\'s email surface from role.json')
if (/@\/lib\/supabase|server-only/.test(lens)) bad.push('the lens must not read live (no Supabase, no server-only import)')
const canvas = read('components/builder/surfaces/email/email-lens.tsx')
if (!/sandbox="allow-same-origin"/.test(canvas) || !/srcDoc=\{lens\.html\}/.test(canvas)) bad.push('the email canvas must show the compiled HTML in a script-free frame')
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/state\.surface === 'email'/.test(shell) || !/<EmailLens /.test(shell)) bad.push('the shell must show the email lens on the email surface')
const test = read('lib/builder/email-lens.test.ts')
if (!/is compileEmailDoc, byte for byte/.test(test)) bad.push('the test must prove the lens output is compileEmailDoc\'s, byte for byte')
if (!/starter templates/.test(test)) bad.push('the test must compile the starter templates through the one seam')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
