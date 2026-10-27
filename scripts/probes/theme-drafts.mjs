#!/usr/bin/env node
// LIVE-1545: a Space owner keeps several theme drafts over the same website and publishes the one they like.
//
// Fails when the snapshot loses its draft fields, when picking a theme or a global style in the editor writes the
// live site again before Publish, when Publish stops applying the draft's theme through the one apply, or when
// House of Fates leaves the editor-only Nocturne variant (or enters the theme library or kit registry).
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const need = (file, needles) => { const t = r(file); for (const n of needles) if (!t.includes(n)) bad.push(`${file} has no ${n}`) }
const forbid = (file, needles) => { const t = r(file); for (const n of needles) if (t.includes(n)) bad.push(`${file} still has ${n}`) }

need('lib/sites/editor/state.ts', ['WebsiteThemeDraft', 'MAX_THEME_DRAFTS', 'delete publicSnapshot.themes'])
need('lib/sites/editor/theme-drafts.ts', ['addThemeDraft', 'switchThemeDraft', 'removeThemeDraft', 'liveThemeDraftId'])
need('lib/sites/editor/actions.ts', ['publishDraftStyle', "import('@/lib/theme/apply-mega-theme')", 'Publish now to switch themes'])
// Picking a theme or a style is a draft edit; only Publish (actions.ts) writes the live style.
const shell = r('components/sites/editor/shell.tsx')
if (/saveStyle\(\s*\{\s*theme:/.test(shell)) bad.push('shell.tsx saves the live theme when a theme is picked')
if (/saveStyle\(\s*\{\s*look:/.test(shell)) bad.push('shell.tsx saves the live global styles when one is picked')
need('components/sites/editor/shell.tsx', ['ThemeDraftsPanel', 'setLook'])
need('lib/sites/house-of-fates-site.ts', ["id: 'house-of-fates', label: 'House of Fates', theme: 'Midnight'", "activeTheme: 'house-of-fates'"])
for (const f of ['lib/themes/library.ts', 'lib/sites/kits/registry.ts']) forbid(f, ['house-of-fates', 'House of Fates'])

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Theme drafts: snapshot fields, draft-only picks, publish-time apply and the House of Fates variant are in place.')
