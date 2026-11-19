#!/usr/bin/env node
// LIVE-2484: the member launch leads with the four builders, in any order, and folds the long checklist into sections
// (owner 2026-11-19: the pop-up creator is overwhelming; break it into sections people can come back to). Fails while
// the overview does not lead with the build hub, the hub does not open each builder, or the checklist is one flat list.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const view = read('components/launch/launch-overview.tsx')
const hub = read('components/launch/build-hub.tsx')
assert.ok(/<BuildHub built=\{builtFeatures\(/.test(view), 'the launch overview does not lead with the four builders')
assert.ok(/<details[^>]*open=\{p\.next\?\.section === s\.id\}/.test(view), 'the checklist is not folded into sections with the next one open')
assert.ok(/FEATURES\.filter\(\(f\) => f\.open\)/.test(hub) && /href=\{f\.href\}/.test(hub) && /LAUNCH_BUSINESS\.href/.test(hub), 'the hub does not open each builder and Launch Your Business')
assert.ok(!/—/.test(hub + view), 'copy has an em dash')
console.log('LIVE-2484: the member launch leads with the four builders and folds the checklist')
