// BLD-402: Vera joins the builder as one more client of the draft. Four tools (read_page, plan_page, apply_edits,
// validate), proposals drawn as ghosts and accepted per section as ONE edit, speaking first only at page creation, and
// every line re-parsed in the browser so she names only tokens and known slot keys. ⌘K and the Add sheet reach her rail.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const vera = read('lib/builder/vera.ts')
for (const fn of ['readPage', 'veraMenu', 'validateProposal', 'veraGroups', 'applyEdits', 'acceptGroup', 'veraGhost', 'veraMaySpeak', 'veraOpening']) if (!vera.includes(`export function ${fn}(`)) bad.push(`vera.ts must export ${fn}`)
if (/from 'react'|fetch\(|@\/lib\/supabase/.test(vera)) bad.push('the Vera tools must be pure: no React, no request')
if (!/parseWebsiteVeraLayout\(\{ changes: raw\.changes \}, ids, menu\)/.test(vera)) bad.push('a reply must be parsed again against this page and menu')
if (!/trigger === 'page-created' \|\| trigger === 'command' \|\| trigger === 'rail'/.test(vera)) bad.push('she may speak only at page creation, from ⌘K or from her rail')
if (/#[0-9a-fA-F]{3,8}\b|font-family|css/.test(vera.replace(/\/\/[^\n]*/g, ''))) bad.push('Vera output carries no colour, font or css')
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/proposeWebsiteLayout|onLayout\(request, readPage\(doc, config\), veraMenuNow\)/.test(shell)) bad.push('the shell must ask through the layout action with the page outline and menu')
if (!/acceptVera/.test(shell) || !/editDoc\(\(\) => result\.doc\)/.test(shell)) bad.push('Accept must be one edit of the draft (one undo step)')
if (!/const canvasDoc = ghost \? ghost\.doc : surfaceDoc/.test(shell)) bad.push('the canvas must draw the ghost, not the draft')
if (/Vera arrives in the builder/.test(shell)) bad.push('the placeholder toast for Vera must be gone')
if (!/else if \(rowId === 'ask'\) openVera\(query\)/.test(shell)) bad.push('⌘K must open her rail with the question')
if (!/vera: \{ label: 'Ask Vera'/.test(read('lib/builder/commands.ts'))) bad.push('Ask Vera must be an action in the registry')
const rail = read('components/builder/vera/vera-rail.tsx')
if (!/Accept<\/button>/.test(rail) || !/Preview/.test(rail)) bad.push('each group needs Preview and Accept')
if (/#[0-9a-fA-F]{3,8}\b/.test(read('components/builder/vera/vera-rail.module.css'))) bad.push('no hex in the builder chrome')
const test = read('lib/builder/vera.test.ts')
if (!/names only tokens and known slot keys/.test(test) || !/accepting a group is one document/.test(test)) bad.push('the test must hold the token rule and one-group accept')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
