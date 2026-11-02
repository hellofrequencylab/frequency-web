#!/usr/bin/env node
// LIVE-1999: the four public lead-capture doors under app/(capture) render the funnel stage, whose
// classes only mean something inside the site kit root. The group had no layout, so /checkin, /exchange,
// /intro and /unlock rendered as bare text in the top-left of a blank page (visual sweep 2026-11-02,
// 1280 and 390). This probe reads the group's layout for the kit shell.
import { existsSync, readFileSync } from 'node:fs'
const f = 'app/(capture)/layout.tsx'
if (!existsSync(f)) {
  console.error('app/(capture) has no layout, so the capture doors render outside the site kit root')
  process.exit(1)
}
const s = readFileSync(f, 'utf8')
if (!/<SiteShell\b/.test(s) || !/chrome=\{false\}/.test(s)) {
  console.error('app/(capture)/layout.tsx does not wrap the doors in the chrome-free SiteShell')
  process.exit(1)
}
console.log('the capture doors render inside the chrome-free site shell')
