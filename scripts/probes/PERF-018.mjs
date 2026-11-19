#!/usr/bin/env node
// PERF-018: Space photos and logos stored before PERF-012 are still the size the phone made them (one logo drawn at
// 28px is 1.37 MB). Owner ruling 2026-11-19: "Shrink them, keep a backup". The consequence this pins: a one-off
// script exists that re-saves those files web-sized at the same path and format, writes every original to a local
// backup BEFORE it uploads anything, changes nothing without --apply, can put the originals back, and never goes
// near the paid image optimizer.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const p = 'scripts/shrink-stored-space-photos.mjs'
assert.ok(existsSync(p), 'the one-off shrink script is gone')
const s = readFileSync(p, 'utf8')
assert.ok(/const APPLY = args\.includes\('--apply'\)/.test(s) && /if \(APPLY\) \{/.test(s), 'the script writes without --apply')
const backup = s.indexOf('writeFileSync(local, buf)')
const put = s.indexOf('await upload(bucket, path, next.buf, next.type)')
assert.ok(backup > 0 && put > backup, 'the script uploads a shrunk file before the original is backed up')
assert.ok(/statSync\(local\)\.size !== buf\.length\)[\s\S]{0,120}continue/.test(s), 'a file whose backup did not land is still shrunk')
assert.ok(/--restore/.test(s) && /async function restore\(/.test(s), 'there is no way to put the originals back')
assert.ok(/const MIN_BYTES = 600 \* 1024/.test(s) && /const MAX_DIM = 2000/.test(s), 'the script does not use the upload pass size rules')
assert.ok(/if \(meta\.format === 'jpeg'\)[\s\S]*else if \(meta\.format === 'webp'\)[\s\S]*else img = img\.png\(/.test(s), 'a file is not re-saved in its own format, so its link would break')
assert.ok(!/_next\/image|render\/image\/public\/\$\{/.test(s.replace(/\(\?:object\|render\\\/image\)/, '')), 'the script uses an image optimizer')
console.log('PERF-018: the stored-photo shrink backs up first, keeps paths and formats, and is a dry run by default')
