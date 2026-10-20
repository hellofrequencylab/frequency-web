// LIVE-1167 probe: the Around you tile (right rail and /events) paints a real basemap under its pins, pinned
// to keyless MapLibre so a Google key never bills a map load per page view, instead of a bare dot grid.
//
//   node scripts/probes/rail-map-tile-basemap.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tile = readFileSync('components/frequency/members/events/events-map-lightbox.tsx', 'utf8')
assert.match(tile, /<TileBasemap items=\{items\} \/>/, 'the tile renders the basemap')
assert.match(tile, /engine="maplibre"/, 'the tile map is pinned to keyless MapLibre')
const seam = readFileSync('components/maps/map-canvas.tsx', 'utf8')
assert.match(seam, /forcedEngine !== 'maplibre'/, 'the seam honours the pin')
console.log('PASS rail-map-tile-basemap')
