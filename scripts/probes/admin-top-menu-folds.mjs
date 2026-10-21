// LIVE-1222: the operator console's top menu folds up while scrolling down and returns on scroll up.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const nav = readFileSync('components/frequency/admin/admin-nav.tsx', 'utf8')
const model = readFileSync('components/frequency/admin/nav-model.ts', 'utf8')
const css = readFileSync('app/themes/frequency/admin-shell.css', 'utf8')
assert.ok(model.includes('export function foldAfterScroll'), 'the fold rule is a pure function')
assert.ok(/function useFold\(/.test(nav) && nav.includes('foldAfterScroll(') && nav.includes("data-fold"), 'AdminTopMenu folds from the scroll direction')
assert.equal((nav.match(/data-fold=/g) ?? []).length, 2, 'both menu layouts carry the fold attribute')
assert.ok(nav.includes('clientY'), 'the pointer entering the top strip brings it back')
assert.ok(/min-width:961px\)\{[\s\S]*\.ad-topmenu\[data-fold="1"\]:not\(:focus-within\)/.test(css), 'folds only on a wide screen and never while focus is inside it')
assert.ok(css.includes('var(--fq-dur-base)'), 'the motion follows the reduced-motion duration tokens')
console.log('top menu folds')
