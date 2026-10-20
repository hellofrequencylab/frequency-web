// LIVE-1175 probe: the Offerings and Money page is five tabs (one open at a time) and Check in is one of
// them, so the door has a menu entry instead of a dead #checkin anchor.
//
//   node scripts/probes/offerings-tabs.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const catalog = readFileSync('lib/spaces/offerings.ts', 'utf8')
assert.match(catalog, /OFFERING_TABS/, 'the tab list lives in the offerings catalog')
assert.match(catalog, /key: 'checkin', label: 'Check in'/, 'Check in is a tab')
const body = readFileSync('app/(main)/spaces/[slug]/settings/offerings/offerings-body.tsx', 'utf8')
assert.match(body, /CheckinSection/, 'the Check in tab mounts the check in section')
assert.doesNotMatch(body, /sections\.map\(/, 'the body no longer stacks every section')
const modules = readFileSync('lib/admin/modules/space-modules.ts', 'utf8')
assert.match(modules, /id: 'space\.scanners', label: 'Check in'/, 'the console row is named Check in')
assert.match(modules, /offerings\?tab=checkin/, 'the console row opens the Check in tab')
console.log('PASS offerings-tabs')
