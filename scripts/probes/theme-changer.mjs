#!/usr/bin/env node
// LIVE-1450 (ADR-1890): the website editor has a Change theme button that opens every theme and its kits.
//
// Fails when the Theme tab loses the button, the dialog stops rendering the switcher, or the switcher stops
// sharing the Theme tab's pick handler (so a pick is no longer one undo step that saves the site style).
import { readFileSync } from 'node:fs'

const bad = []
const read = (f) => readFileSync(f, 'utf8')
const shell = read('components/sites/editor/shell.tsx')
if (!shell.includes("setModal('theme')") || !shell.includes('Change theme')) bad.push('the Theme tab no longer has a Change theme button')
if (!shell.includes('<ThemeChanger')) bad.push('the editor no longer renders the theme switcher dialog')
if (!shell.includes('function pickTheme(') || (shell.match(/pickTheme\(t\)/g) ?? []).length < 2) bad.push('the Theme tab and the dialog no longer share pickTheme')
if (!read('components/sites/editor/theme-changer.tsx').includes('<KitLibrary theme={current}')) bad.push('the switcher no longer lists the kits of the current theme')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('theme changer: button, dialog, shared handler and kits are wired')
