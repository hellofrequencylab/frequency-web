#!/usr/bin/env node
// Where did the pixels move? A reader for visual-baseline recaptures (ADR-1273).
//
// A recapture (`e2e-manual.yml` with `update_baselines`) rewrites every committed PNG whose page
// no longer renders the way it did when the file was last taken, and the only thing the runner
// reports is the file count. ADR-1264 measured the next thing — how many pixels differed per
// file — and then inferred a CAUSE from that count: same height + five figures of pixels was
// read as "a different rasteriser", and 138 real files were thrown away. They were the 2026-09-04
// CTA sweep (`Start a Circle` → `Join free`, `Find your way in` → `Find your people`), a settings
// row that swapped an icon button for a chevron, and live data on the member surfaces. Copy
// changes inside a fixed box move zero rows. The count was right; the physics was wrong.
//
// A COUNT IS NOT A CAUSE. This script prints, for every PNG that differs between two sources,
// WHERE the differing pixels sit as contiguous row bands, so the reader can crop one and look:
//
//   · a handful of bands at the header, a CTA and the footer is a copy change — take the capture;
//   · a band across every text row is a font or rasteriser change — the suite moved, not the page;
//   · bands only on surfaces that change between two captures minutes apart is live data.
//
// It reads PNGs from two directories, or from two git refs (`origin/main HEAD` reads the
// committed set against a runner commit without checking anything out). No dependencies: the
// PNG decoder below handles what Playwright writes (8-bit RGB/RGBA, non-interlaced) and the
// colour delta is pixelmatch's YIQ formula at Playwright's default `threshold` (0.2), with
// anti-alias detection omitted, so every count is an upper bound on what `toHaveScreenshot`
// would report. `--budget` defaults to the 400 px of ADR-1258 and is printed beside each count,
// never enforced here: this is a READER, not a gate (ADR-1259's rule for instruments).
//
//   pnpm visual:bands origin/main HEAD                 # committed set vs the runner's commit
//   pnpm visual:bands <dirA> <dirB> --only app-nearby  # two extracted directories, one surface
//   pnpm visual:bands A B --top 6 --json               # machine-readable
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

export const DEFAULT_DIR = 'test/e2e/__screenshots__/visual.spec.ts'
/** Playwright's default per-pixel colour `threshold`; playwright.config.ts leaves it unset. */
export const DEFAULT_THRESHOLD = 0.2
/** ADR-1258's absolute budget, mirrored for the printout. screenshot-tolerance.test.ts pins the
 *  config's value; visual-diff-bands.test.ts pins this mirror to the config. */
export const DEFAULT_BUDGET = 400

// ── PNG ────────────────────────────────────────────────────────────────────────────────────────

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/** Decode an 8-bit, non-interlaced RGB or RGBA PNG into RGBA bytes. Throws on anything else. */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  let pos = 8
  let width = 0
  let height = 0
  let colorType = -1
  const idat = []
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const bitDepth = data[8]
      colorType = data[9]
      const interlace = data[12]
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error(
          `unsupported PNG (bit depth ${bitDepth}, colour type ${colorType}, interlace ${interlace}); Playwright writes 8-bit RGB/RGBA`,
        )
      }
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + len
  }
  if (!width || !height) throw new Error('PNG has no IHDR')
  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  if (raw.length < (stride + 1) * height) throw new Error('PNG data is short')
  const out = new Uint8Array(width * height * 4)
  const prev = new Uint8Array(stride)
  const cur = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const off = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      const v = raw[off + x]
      let f
      if (filter === 0) f = v
      else if (filter === 1) f = v + a
      else if (filter === 2) f = v + b
      else if (filter === 3) f = v + ((a + b) >> 1)
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        f = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      } else throw new Error(`unknown PNG filter ${filter} on row ${y}`)
      cur[x] = f & 255
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp
      const d = (y * width + x) * 4
      out[d] = cur[s]
      out[d + 1] = cur[s + 1]
      out[d + 2] = cur[s + 2]
      out[d + 3] = bpp === 4 ? cur[s + 3] : 255
    }
    prev.set(cur)
  }
  return { width, height, data: out }
}

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(bytes) {
  let c = -1
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Encode RGBA bytes as an 8-bit RGBA PNG (filter 0 on every row). Used by the test to build
 *  fixtures; a decoder that only reads its own encoder is not proven, so the test also decodes a
 *  committed baseline and checks its IHDR against the raw header bytes. */
export function encodePng({ width, height, data }) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
// ── Diff ───────────────────────────────────────────────────────────────────────────────────────

// pixelmatch's colour distance (YIQ NTSC, the same weights it ships), so a count here means
// what `toHaveScreenshot` means by it. The threshold enters as pixelmatch squares it.
const rgb2y = (r, g, b) => r * 0.29889531 + g * 0.58662247 + b * 0.11448223
const rgb2i = (r, g, b) => r * 0.59597799 - g * 0.2741761 - b * 0.32180189
const rgb2q = (r, g, b) => r * 0.21147017 - g * 0.52261711 + b * 0.31114694
const blend = (c, a) => 255 + (c - 255) * a

function colorDelta(img1, img2, k) {
  let r1 = img1[k], g1 = img1[k + 1], b1 = img1[k + 2], a1 = img1[k + 3]
  let r2 = img2[k], g2 = img2[k + 1], b2 = img2[k + 2], a2 = img2[k + 3]
  if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) return 0
  if (a1 < 255) { a1 /= 255; r1 = blend(r1, a1); g1 = blend(g1, a1); b1 = blend(b1, a1) }
  if (a2 < 255) { a2 /= 255; r2 = blend(r2, a2); g2 = blend(g2, a2); b2 = blend(b2, a2) }
  const y = rgb2y(r1, g1, b1) - rgb2y(r2, g2, b2)
  const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2)
  const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2)
  return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q
}

/** Row bands: maximal runs of consecutive rows that each hold at least one differing pixel. */
export function bandsOf(rowCounts) {
  const bands = []
  let start = -1
  let sum = 0
  for (let y = 0; y <= rowCounts.length; y++) {
    const v = y < rowCounts.length ? rowCounts[y] : 0
    if (v > 0) {
      if (start < 0) { start = y; sum = 0 }
      sum += v
    } else if (start >= 0) {
      bands.push({ from: start, to: y - 1, rows: y - start, pixels: sum })
      start = -1
    }
  }
  return bands.sort((p, q) => q.pixels - p.pixels)
}

/** Compare two decoded images. Returns the differing-pixel count and its row bands, or a
 *  dimension mismatch — which is what Playwright reports too, before any pixel is examined. */
export function diffImages(a, b, { threshold = DEFAULT_THRESHOLD } = {}) {
  if (a.width !== b.width || a.height !== b.height) {
    return { dimensionMismatch: true, a: `${a.width}x${a.height}`, b: `${b.width}x${b.height}` }
  }
  const maxDelta = 35215 * threshold * threshold
  const rows = new Uint32Array(a.height)
  let differing = 0
  const w = a.width
  for (let y = 0; y < a.height; y++) {
    let n = 0
    for (let x = 0; x < w; x++) if (colorDelta(a.data, b.data, (y * w + x) * 4) > maxDelta) n++
    rows[y] = n
    differing += n
  }
  return { dimensionMismatch: false, width: a.width, height: a.height, differing, bands: bandsOf(rows) }
}

// ── Sources: a directory or a git ref ──────────────────────────────────────────────────────────

function isDir(p) {
  try { return statSync(p).isDirectory() } catch { return false }
}
function git(args, opts = {}) {
  // stderr is dropped: a spec that is not a ref is reported by openSource in its own words.
  return execFileSync('git', args, { encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
}
/** A source is either a directory of PNGs or `<git ref>` read at `--dir` without a checkout. */
export function openSource(spec, dir) {
  if (isDir(spec)) {
    return {
      label: spec,
      list: () => readdirSync(spec).filter((f) => f.endsWith('.png')).sort(),
      read: (f) => readFileSync(join(spec, f)),
    }
  }
  let rev
  try { rev = git(['rev-parse', '--verify', `${spec}^{commit}`]).trim() } catch {
    throw new Error(`"${spec}" is neither a directory nor a git ref`)
  }
  return {
    label: `${spec} (${rev.slice(0, 9)})`,
    list: () =>
      git(['ls-tree', '--name-only', rev, `${dir.replace(/\/?$/, '/')}`])
        .split('\n').filter((p) => p.endsWith('.png')).map((p) => p.slice(p.lastIndexOf('/') + 1)).sort(),
    read: (f) => git(['show', `${rev}:${dir}/${f}`], { binary: true }),
  }
}

/** Compare every same-named PNG in two sources. */
export function compareSources(a, b, { threshold = DEFAULT_THRESHOLD, only = '' } = {}) {
  const names = [...new Set([...a.list(), ...b.list()])].filter((n) => n.includes(only)).sort()
  const results = []
  for (const name of names) {
    let ia, ib
    try { ia = decodePng(a.read(name)) } catch (e) { results.push({ name, missing: 'a', error: String(e.message ?? e) }); continue }
    try { ib = decodePng(b.read(name)) } catch (e) { results.push({ name, missing: 'b', error: String(e.message ?? e) }); continue }
    results.push({ name, ...diffImages(ia, ib, { threshold }) })
  }
  return results
}

export function summarize(results, budget = DEFAULT_BUDGET) {
  const s = { files: results.length, identical: 0, underBudget: 0, overBudget: 0, dimensionMoved: 0, missing: 0 }
  for (const r of results) {
    if (r.missing) s.missing++
    else if (r.dimensionMismatch) s.dimensionMoved++
    else if (r.differing === 0) s.identical++
    else if (r.differing <= budget) s.underBudget++
    else s.overBudget++
  }
  return s
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { dir: DEFAULT_DIR, top: 4, budget: DEFAULT_BUDGET, threshold: DEFAULT_THRESHOLD, only: '', json: false, positional: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--dir') opts.dir = argv[++i]
    else if (a === '--only') opts.only = argv[++i] ?? ''
    else if (a === '--top') opts.top = Number(argv[++i])
    else if (a === '--budget') opts.budget = Number(argv[++i])
    else if (a === '--threshold') opts.threshold = Number(argv[++i])
    else opts.positional.push(a)
  }
  return opts
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv)
  if (opts.positional.length !== 2) {
    console.error('usage: visual-diff-bands <A> <B> [--dir <png dir>] [--only <substring>] [--top N] [--budget N] [--threshold T] [--json]\n  A and B are directories of PNGs, or git refs read at --dir.')
    return 2
  }
  const a = openSource(opts.positional[0], opts.dir)
  const b = openSource(opts.positional[1], opts.dir)
  const results = compareSources(a, b, { threshold: opts.threshold, only: opts.only })
  const summary = summarize(results, opts.budget)
  if (opts.json) {
    console.log(JSON.stringify({ a: a.label, b: b.label, threshold: opts.threshold, budget: opts.budget, summary, results }, null, 2))
    return 0
  }
  console.log(`visual-diff-bands: ${a.label}  →  ${b.label}\n  threshold ${opts.threshold} (pixelmatch YIQ, AA omitted: counts are upper bounds) · budget ${opts.budget} px is printed, not enforced\n`)
  const changed = results.filter((r) => r.missing || r.dimensionMismatch || r.differing > 0)
  changed.sort((p, q) => (q.differing ?? Infinity) - (p.differing ?? Infinity))
  for (const r of changed) {
    if (r.missing) { console.log(`  ${r.name}\n      only in ${r.missing === 'a' ? 'B' : 'A'} (${r.error})`); continue }
    if (r.dimensionMismatch) { console.log(`  ${r.name}\n      DIMENSIONS ${r.a} → ${r.b}: the compare aborts before a pixel is read`); continue }
    const flag = r.differing > opts.budget ? 'over' : 'under'
    console.log(`  ${r.name}  ${r.width}x${r.height}  ${r.differing} px (${flag} ${opts.budget}) in ${r.bands.length} band${r.bands.length === 1 ? '' : 's'}`)
    for (const band of r.bands.slice(0, opts.top)) {
      console.log(`      rows ${band.from}-${band.to} (${band.rows}): ${band.pixels} px`)
    }
  }
  console.log(`\n  ${summary.files} files · ${summary.identical} identical · ${summary.underBudget} under budget · ${summary.overBudget} over budget · ${summary.dimensionMoved} moved dimensions · ${summary.missing} missing`)
  console.log('  Read a band before deciding what it is: crop it, look at it. A count is not a cause.')
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main()
}
