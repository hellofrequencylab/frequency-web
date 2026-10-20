// LIVE-1167 probe: the Around you tile (right rail and /events) paints a real basemap under its pins, pinned
// through the map seam (Google when the browsable key is set), instead of a bare dot grid.
//
//   node scripts/probes/rail-map-tile-basemap.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tile = readFileSync('components/frequency/members/events/events-map-lightbox.tsx', 'utf8')
assert.match(tile, /<TileBasemap items=\{items\} \/>/, 'the tile renders the basemap')
assert.ok(!tile.includes('engine="maplibre"'), 'the tile does not pin an engine: the seam picks Google')
console.log('PASS rail-map-tile-basemap')
