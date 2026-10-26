import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const bad = []
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.next'].includes(entry.name)) continue
    const file = join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (/flyer-raster|LiberationSans-Regular/i.test(entry.name)) bad.push(file)
  }
}
walk('.')
assert.deepEqual(bad, [], 'The retired flyer rasterizer and its exclusive Regular face must stay absent')
assert.equal(existsSync('lib/og/load-nunito.ts'), false, 'The obsolete loader must stay retired')
for (const file of ['public/fonts/Nunito-Black.ttf', 'public/fonts/LiberationSans-Bold.ttf']) assert.equal(existsSync(file), false, 'No unused legacy faces')
const fallback = 'public/fonts/Nunito-Bold.ttf'
assert.equal(readFileSync(fallback).subarray(0, 4).toString('hex'), '00010000', 'Keep the active full TrueType glyph fallback')
assert.ok(readFileSync(fallback).length > 50_000)
assert.ok(readFileSync('lib/og/load-stage-fonts.ts', 'utf8').includes("readFile(join(process.cwd(), 'public/fonts', 'Nunito-Bold.ttf'))"))
console.log('Flyer stays retired; active Stage glyph fallback survives; obsolete loader and unused faces remain absent')
