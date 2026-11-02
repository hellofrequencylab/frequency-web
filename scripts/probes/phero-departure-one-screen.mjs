#!/usr/bin/env node
// LIVE-1980: SiteFx's .phero departure (fade to 10% and slide up by a quarter of the scroll) assumed a
// one-screen hero. /themes/nocturne's .phero holds the four-surface cascade and is 3480px tall at 1280,
// so its Website and Email template sections rendered washed out, then a whole viewport of fog where
// the hero box ran past its slid-up content (scrolled frames in the 2026-11-02 sweep). The effect now
// skips a hero taller than PHERO_MAX_SCREENS viewports. This probe reads the guard in the source.
import { readFileSync } from 'node:fs'
const src = readFileSync('components/frequency/site/shell/site-fx.tsx', 'utf8')
const bad = []
if (!/const PHERO_MAX_SCREENS = 1\.5/.test(src)) bad.push('site-fx.tsx has no PHERO_MAX_SCREENS cap')
if (!/if \(ph && ph\.offsetHeight <= vh \* PHERO_MAX_SCREENS\)/.test(src)) bad.push('the .phero departure runs on a hero of any height, so a section-tall hero is faded and slid off its box')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('the hero departure fade is limited to a hero of at most 1.5 screens')
