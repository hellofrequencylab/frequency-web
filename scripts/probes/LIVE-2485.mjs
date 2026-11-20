#!/usr/bin/env node
// LIVE-2485: on a phone the console top bar leads with the Frequency mark, and it goes back to the Feed (owner
// 2026-11-20: "In the admin sections on the mobile app, the logo needs to go back to the feed."). Fails while the
// phone top bar has no /feed mark, the mark is hidden at phone width, or it wears the CSS mask itself (which clips
// its focus ring).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const shell = readFileSync('components/frequency/admin/admin-shell.tsx', 'utf8')
const css = readFileSync('app/themes/frequency/admin-shell.css', 'utf8')
const top = shell.slice(shell.indexOf('<header className="ad-top"'))
assert.ok(/^<header className="ad-top"[^>]*>\s*(\{\/\*[\s\S]*?\*\/\}\s*)*<Link href="\/feed" className="ad-top-logo"/.test(top), 'the console top bar does not open with a /feed Frequency mark')
const phone = css.slice(css.indexOf('THE PHONE CONSOLE'))
assert.ok(/@media \(max-width:960px\)\{[\s\S]*?\.ad-top-logo\{display:flex/.test(phone), 'the Frequency mark is not shown at phone width')
assert.ok(/\.ad-top-logo span\{[^}]*mask:/.test(phone) && !/\.ad-top-logo\{[^}]*mask:/.test(phone), 'the mask must sit on the inner span so the focus ring is not clipped')
console.log('LIVE-2485: the phone console mark goes back to the Feed')
