// The two instruments a failed shutter gets (LIVE-492): the box that measured differently after
// the failure than before it, and the row bands a stable pixel diff sits in with the elements
// under them. Both are pure once the page has been read, so they are tested here with no
// browser, against the shapes the real failures had.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { describe, expect, it } from 'vitest'
import { encodePng } from '../../scripts/visual-diff-bands.mjs'
import {
  attachedImagePair,
  bandsMessage,
  boxesInBands,
  collapsedSamples,
  diffBands,
  diffBoxes,
  explainCaptureFailure,
  receivedHeights,
  moversMessage,
  viewportProbeMessage,
  type BoxSnapshot,
  type ViewportSample,
} from './surfaces'

const box = (h: number, top: number, d: string) => ({ h, top, d })

describe('diffBoxes: what measured differently after the failure than before the shutter', () => {
  it('reports the box that changed and the ancestors carrying it, in the shape smallestEnclosing reduces', () => {
    const before: BoxSnapshot = {
      'body>div[0]': box(7756, 0, 'div#shell'),
      'body>div[0]>main[0]>table[2]': box(4000, 900, 'table.w-full'),
      'body>div[0]>main[0]>table[2]>tbody[1]>tr[7]': box(48, 1500, 'tr "Breathwork basics"'),
    }
    const after: BoxSnapshot = {
      'body>div[0]': box(7752, 0, 'div#shell'),
      'body>div[0]>main[0]>table[2]': box(3996, 900, 'table.w-full'),
      'body>div[0]>main[0]>table[2]>tbody[1]>tr[7]': box(44, 1500, 'tr "Breathwork basics"'),
    }
    const moved = diffBoxes(before, after)
    expect(moved.map((m) => [m.desc, m.from, m.to, m.delta])).toEqual([
      ['div#shell', 7756, 7752, -4],
      ['table.w-full', 4000, 3996, -4],
      ['tr "Breathwork basics"', 48, 44, -4],
    ])
  })

  it('reads a box present on one side only as absent (0) on the other, the branch-swap shape', () => {
    const moved = diffBoxes({ 'body>p[0]': box(55.25, 10, 'p "No scans yet"') }, { 'body>div[0]': box(112, 10, 'div.h-28') })
    expect(moved).toEqual([
      { path: 'body>p[0]', desc: 'p "No scans yet"', from: 55.25, to: 0, delta: -55.25 },
      { path: 'body>div[0]', desc: 'div.h-28', from: 0, to: 112, delta: 112 },
    ])
  })

  it('ignores sub-half-pixel rounding and respects the cap', () => {
    expect(diffBoxes({ a: box(10, 0, 'a') }, { a: box(10.4, 0, 'a') })).toEqual([])
    const many = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`b${i}`, box(1, 0, 'b')]))
    expect(diffBoxes(many, {}, 3)).toHaveLength(3)
  })
})

describe('moversMessage: the sentence a person acts on', () => {
  it('names the box with both readings', () => {
    expect(moversMessage([{ desc: 'tr "Breathwork basics"', from: 48, to: 44 }], {})).toContain(
      'tr "Breathwork basics" 48px then 44px',
    )
  })
  it('says when nothing moved, and why that is still a finding', () => {
    expect(moversMessage([], {})).toMatch(/resting on the layout it started on/)
  })
  it('says when the page could not be read', () => {
    expect(moversMessage([], null)).toMatch(/could not be read/)
  })
})

describe('the touch emulation is dropped before a full-page shutter, and only then (LIVE-492)', () => {
  it('capture() drops it after goto and before settle, for full-page captures on touch projects', () => {
    const src = readFileSync(join(process.cwd(), 'test/e2e/visual.spec.ts'), 'utf8')
    const drop = src.indexOf('await dropTouchBeforeFullPageCapture(page)')
    expect(drop).toBeGreaterThan(-1)
    expect(src.indexOf("await page.goto(surface.path, { waitUntil: 'load' })")).toBeLessThan(drop)
    expect(drop).toBeLessThan(src.indexOf('const settleReport = await settle(page)'))
    expect(drop).toBeLessThan(src.indexOf('const before = await boxSnapshot(page)'))
    // Gated on BOTH: a first-screen capture keeps touch (its camera does not drop it, and its
    // baselines are coarse renderings), and a project without touch has nothing to drop.
    expect(src.slice(drop - 120, drop)).toMatch(/!surface\.viewportOnly && test\.info\(\)\.project\.use\.hasTouch/)
  })
})

describe('the viewport probe: what the shutter did to the window, measured', () => {
  const s = (w: number, h: number, at: number): ViewportSample => ({ w, h, at })

  it('reads the collapse the capture induces and how long it lasted', () => {
    const samples = [s(1, 1, 926), s(390, 844, 928)]
    expect(collapsedSamples(samples)).toEqual([s(1, 1, 926)])
    const msg = viewportProbeMessage(samples)
    expect(msg).toContain('read 1x1 for 2ms before returning to 390x844')
    expect(msg).toContain('1 of 2 resize events')
  })

  it('the mobile project collapses to 4x4, which still counts', () => {
    expect(collapsedSamples([s(4, 4, 0), s(390, 844, 12)])).toHaveLength(1)
  })

  it('reports no resize as a measurement rather than as silence', () => {
    expect(viewportProbeMessage([])).toMatch(/no resize event/)
  })

  it('lists real resizes that were not a collapse', () => {
    expect(viewportProbeMessage([s(1280, 800, 0)])).toMatch(/1 resize event \(1280x800\) and no collapse/)
  })
})

describe('boxesInBands: the elements under a band of differing rows', () => {
  const snapshot: BoxSnapshot = {
    'body>div[0]': box(5410, 0, 'div#shell'),
    'body>div[0]>main[0]>table[2]': box(4000, 900, 'table.w-full'),
    'body>div[0]>main[0]>table[2]>tbody[1]>tr[7]': box(48, 1500, 'tr "Breathwork basics"'),
    'body>div[0]>main[0]>table[2]>tbody[1]>tr[8]': box(48, 1548, 'tr "Cold plunge"'),
    'body>div[0]>footer[3]': box(300, 5000, 'footer'),
  }

  it('picks the smallest boxes overlapping the band, so a row wins over its table and the shell', () => {
    const [named] = boxesInBands(snapshot, [{ from: 1510, to: 1530, rows: 21, pixels: 812 }])
    expect(named!.boxes.map((b) => b.d)).toEqual(['tr "Breathwork basics"', 'table.w-full', 'div#shell'])
  })

  it('a band straddling two rows names both before their table', () => {
    const [named] = boxesInBands(snapshot, [{ from: 1540, to: 1552, rows: 13, pixels: 90 }])
    expect(named!.boxes.map((b) => b.d)).toEqual(['tr "Breathwork basics"', 'tr "Cold plunge"', 'table.w-full'])
  })

  it('REGRESSION: a band on an icon names the <svg> and the words beside it, never a 3px <path>', () => {
    // The first runner reading: "path (3px tall), path (6px tall), path (8px tall)" for
    // thirteen bands on /admin/content/practices. The icon's parts are skipped, the icon stays,
    // and the smallest box carrying text joins so the band can be found in the source.
    const iconRow: BoxSnapshot = {
      'body>div[0]': box(5410, 0, 'div#shell'),
      'body>div[0]>div[3]': box(82, 2500, 'div.flex.flex-wrap "Breathwork basics Never logged Quality 61"'),
      'body>div[0]>div[3]>a[0]': box(21, 2540, 'a.inline-flex "Breathwork basics"'),
      'body>div[0]>div[3]>a[0]>svg[1]': box(12.75, 2543, 'svg.h-3.w-3'),
      'body>div[0]>div[3]>a[0]>svg[1]>path[0]': box(3, 2544, 'path'),
      'body>div[0]>div[3]>a[0]>svg[1]>path[1]': box(6, 2544, 'path'),
      'body>div[0]>div[3]>a[0]>svg[1]>path[2]': box(8, 2546, 'path'),
    }
    const [named] = boxesInBands(iconRow, [{ from: 2543, to: 2556, rows: 14, pixels: 1081 }])
    expect(named!.boxes.map((b) => b.d)).toEqual([
      'svg.h-3.w-3',
      'a.inline-flex "Breathwork basics"',
      'div.flex.flex-wrap "Breathwork basics Never logged Quality 61"',
    ])
    expect(named!.boxes.some((b) => b.d === 'path')).toBe(false)
  })

  it('the words box is added even when the smallest boxes carry none', () => {
    const wordless: BoxSnapshot = {
      'body>section[0]': box(300, 0, 'section "Needs attention Breathwork basics"'),
      'body>section[0]>div[1]': box(10, 20, 'div.h-2'),
      'body>section[0]>div[2]': box(12, 20, 'div.h-3'),
      'body>section[0]>div[3]': box(14, 20, 'div.h-4'),
    }
    const [named] = boxesInBands(wordless, [{ from: 22, to: 28, rows: 7, pixels: 40 }])
    expect(named!.boxes.map((b) => b.d)).toEqual(['div.h-2', 'div.h-3', 'section "Needs attention Breathwork basics"'])
  })

  it('a band with nothing under it names nothing rather than the nearest thing', () => {
    const [named] = boxesInBands({}, [{ from: 10, to: 20, rows: 11, pixels: 5 }])
    expect(named!.boxes).toEqual([])
  })

  // CHROME-DRIFT (ADR-1598), the PR #2949 shape: a 1280-wide desktop row holds the left rail, the
  // page and the operator info rail side by side. The pixels moved on the LEFT rail ("Members",
  // x 47-140); the reader named "Just joined" on the right, which sits inside the admin-rail mask.
  const desktopRow: BoxSnapshot = {
    'body>div[0]': { h: 1372, top: 0, d: 'div.flex.min-h-dvh', left: 0, w: 1280 },
    'body>div[0]>aside[0]>nav[0]>a[5]': { h: 38, top: 400, d: 'a.flex.items-center "Members"', left: 34, w: 204 },
    'body>div[0]>main[1]>div[0]': { h: 300, top: 250, d: 'div.space-y-6 "Admin Dashboard"', left: 281, w: 636 },
    'body>div[0]>div[2]>aside[0]>p[3]': { h: 21, top: 412, d: 'p.eyebrow.text-muted "Just joined"', left: 959, w: 256, masked: true },
    'body>div[0]>div[2]>aside[0]>a[4]': { h: 17, top: 415, d: 'a.text-meta.font-semibold "Roster →"', left: 1150, w: 60, masked: true },
  }

  it('REGRESSION: a box inside a mask is never named, it is the same magenta in both pictures', () => {
    const [named] = boxesInBands(desktopRow, [{ from: 406, to: 420, rows: 15, pixels: 656 }])
    expect(named!.boxes.map((b) => b.d)).not.toContain('p.eyebrow.text-muted "Just joined"')
    expect(named!.boxes.map((b) => b.d)).not.toContain('a.text-meta.font-semibold "Roster →"')
    expect(named!.boxes[0]!.d).toBe('a.flex.items-center "Members"')
  })

  it('a band that carries its columns names only the boxes across them', () => {
    const [named] = boxesInBands(desktopRow, [{ from: 406, to: 420, rows: 15, pixels: 656, left: 47, right: 140 }])
    expect(named!.boxes.map((b) => b.d)).toEqual(['a.flex.items-center "Members"', 'div.flex.min-h-dvh'])
  })

  it('a band on the page column does not name the rail beside it', () => {
    const [named] = boxesInBands(desktopRow, [{ from: 406, to: 420, rows: 15, pixels: 90, left: 300, right: 700 }])
    expect(named!.boxes.map((b) => b.d)).toEqual(['div.space-y-6 "Admin Dashboard"', 'div.flex.min-h-dvh'])
  })
})

/** A tiny RGBA PNG of one colour, with optional rows painted another colour. */
function png(width: number, height: number, paintedRows: number[] = [], color = [255, 0, 0]): Buffer {
  const data = Buffer.alloc(width * height * 4, 255)
  for (const y of paintedRows) {
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * 4
      data[k] = color[0]!
      data[k + 1] = color[1]!
      data[k + 2] = color[2]!
    }
  }
  return encodePng({ width, height, data }) as Buffer
}

describe('diffBands: where the pixels moved, from the two PNGs the matcher attached', () => {
  it('finds the band and counts what toHaveScreenshot would count', async () => {
    const reading = await diffBands(png(20, 40), png(20, 40, [10, 11, 12]))
    expect(reading).not.toBeNull()
    expect(reading!.differing).toBe(60)
    expect(reading!.bands).toEqual([{ from: 10, to: 12, rows: 3, pixels: 60, left: 0, right: 19 }])
  })

  it('returns null on a dimension mismatch, which is the other branch\'s job', async () => {
    expect(await diffBands(png(20, 40), png(20, 44))).toBeNull()
  })

  it('bandsMessage says where and under what', async () => {
    const reading = (await diffBands(png(20, 40), png(20, 40, [10, 11, 12])))!
    const msg = bandsMessage(reading, boxesInBands({ 'body>tr[0]': box(6, 9, 'tr "Cold plunge"') }, reading.bands))
    expect(msg).toContain('60 differing pixels sit in 1 row band of the 20x40 picture')
    expect(msg).toContain('rows 10-12 x 0-19 (60 px) under tr "Cold plunge" (top 9, 6px tall)')
  })
})

describe('attachedImagePair: the latest expected/actual pair the matcher left', () => {
  it('reads the -expected / -actual names and prefers the last pair', () => {
    expect(
      attachedImagePair([
        { name: 'x--dawn-dark-desktop-expected.png', path: '/a/e1.png' },
        { name: 'x--dawn-dark-desktop-actual.png', path: '/a/a1.png' },
        { name: 'x--dawn-dark-desktop-diff.png', path: '/a/d1.png' },
        { name: 'x--dawn-dark-desktop-expected.png', path: '/b/e2.png' },
        { name: 'x--dawn-dark-desktop-actual.png', path: '/b/a2.png' },
      ]),
    ).toEqual({ expected: '/b/e2.png', actual: '/b/a2.png' })
  })
  it('is null without both halves', () => {
    expect(attachedImagePair(undefined)).toBeNull()
    expect(attachedImagePair([{ name: 'x-actual.png', path: '/a' }])).toBeNull()
    expect(attachedImagePair([{ name: 'x-actual.png' }, { name: 'x-expected.png' }])).toBeNull()
  })
})

/** A stand-in for the page: answers each evaluate by the argument's shape, the way the real
 *  helpers call it. `snapshots` is consumed in order so before/after can differ. */
function fakePage(snapshots: BoxSnapshot[], samples: ViewportSample[] = []): Page {
  const queue = [...snapshots]
  return {
    evaluate: async (_fn: unknown, arg: unknown) => {
      if (typeof arg === 'string') return samples // the probe read
      if (arg && typeof arg === 'object' && 'properties' in (arg as object)) return [] // viewportDependentBoxes
      if (arg && typeof arg === 'object' && 'nodeCap' in (arg as object)) return queue.shift() ?? {} // boxSnapshot
      return null
    },
  } as unknown as Page
}

describe('explainCaptureFailure: the two failure shapes, diagnosed', () => {
  const flipText = [
    'expect(page).toHaveScreenshot(expected) failed',
    '  - Expected an image 390px by 7752px, received 390px by 7756px. 13037 pixels (ratio 0.01 of all image pixels) are different.',
    '  - Expected an image 390px by 7756px, received 390px by 7752px. 7568 pixels (ratio 0.01 of all image pixels) are different.',
  ].join('\n')

  it('a two-height failure names the box that changed and what the viewport read', async () => {
    const before: BoxSnapshot = { 'body>div[0]': box(7756, 0, 'div#shell'), 'body>div[0]>tr[3]': box(48, 100, 'tr "Cold plunge"') }
    const after: BoxSnapshot = { 'body>div[0]': box(7752, 0, 'div#shell'), 'body>div[0]>tr[3]': box(44, 100, 'tr "Cold plunge"') }
    const page = fakePage([after], [{ w: 4, h: 4, at: 500 }, { w: 390, h: 844, at: 512 }])
    const out = (await explainCaptureFailure(page, new Error(flipText), '/x [dawn-light · mobile]', { before })) as Error
    expect(out.message).toContain('changed height DURING capture: 7752 and 7756')
    expect(out.message).toContain('tr "Cold plunge" 48px then 44px')
    expect(out.message).not.toContain('div#shell 7756px') // the carrier is dropped
    expect(out.message).toContain('read 4x4 for 12ms before returning to 390x844')
    expect(out.message).toContain(flipText)
    expect(out.cause).toBeInstanceOf(Error)
  })

  it('a two-height failure with no snapshot still gets the flip sentence and the probe', async () => {
    const out = (await explainCaptureFailure(fakePage([]), new Error(flipText), '/x')) as Error
    expect(out.message).toContain('changed height DURING capture')
    expect(out.message).toContain('no resize event')
    expect(out.message).not.toContain('Measured before the shutter')
  })

  it('a stable pixel diff is located from the attached PNGs and named from the page', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'capture-diagnosis-'))
    const expected = join(dir, 'e.png')
    const actual = join(dir, 'a.png')
    writeFileSync(expected, png(30, 60))
    writeFileSync(actual, png(30, 60, [20, 21, 22, 23]))
    const page = fakePage([{ 'body>div[0]': box(60, 0, 'div#shell'), 'body>div[0]>tr[2]': box(8, 18, 'tr "Breathwork basics"') }])
    const original = new Error('expect(page).toHaveScreenshot(expected) failed\n\n  120 pixels (ratio 0.07 of all image pixels) are different.')
    const out = (await explainCaptureFailure(page, original, '/x [dawn-dark · desktop]', {
      attachments: [
        { name: 'x-expected.png', path: expected },
        { name: 'x-actual.png', path: actual },
      ],
    })) as Error
    expect(out).not.toBe(original)
    expect(out.message).toContain('120 differing pixels sit in 1 row band of the 30x60 picture')
    expect(out.message).toContain('rows 20-23 x 0-29 (120 px) under tr "Breathwork basics"')
    expect(out.cause).toBe(original)
  })

  it('a flip that SETTLED and then failed on pixels gets both readings, and says which one failed the case', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'capture-diagnosis-'))
    const expected = join(dir, 'e.png')
    const actual = join(dir, 'a.png')
    writeFileSync(expected, png(30, 60))
    writeFileSync(actual, png(30, 60, [40, 41]))
    const before: BoxSnapshot = { 'body>div[0]': box(64, 0, 'div#shell'), 'body>div[0]>tr[3]': box(48, 0, 'tr "Cold plunge"') }
    const after: BoxSnapshot = { 'body>div[0]': box(60, 0, 'div#shell'), 'body>div[0]>tr[3]': box(44, 0, 'tr "Cold plunge"') }
    const page = fakePage([after, { 'body>div[0]>p[9]': box(4, 39, 'p "Updated 3 minutes ago"') }])
    const settledText = `${flipText}\n  - waiting 250ms before taking screenshot\n  - taking page screenshot\n  - captured a stable screenshot\n  - 60 pixels (ratio 0.03 of all image pixels) are different.`
    const out = (await explainCaptureFailure(page, new Error(settledText), '/x [dawn-light · mobile]', {
      before,
      attachments: [
        { name: 'x-expected.png', path: expected },
        { name: 'x-actual.png', path: actual },
      ],
    })) as Error
    expect(out.message).toContain('tr "Cold plunge" 48px then 44px')
    expect(out.message).toContain('THEN THE HEIGHT SETTLED')
    expect(out.message).toContain('rows 40-41 x 0-29 (60 px) under p "Updated 3 minutes ago"')
    expect(out.message.indexOf('THEN THE HEIGHT SETTLED')).toBeLessThan(out.message.indexOf('rows 40-41'))
  })

  // CHROME-DRIFT (ADR-1598): the /admin call log on PR #2949, verbatim in shape. Every attempt
  // compared against the 1372px baseline and received 1293px: the camera never disagreed with
  // itself, and the old reading called it "changed height DURING capture: 1372 and 1293".
  const shorterText = [
    'expect(page).toHaveScreenshot(expected) failed',
    '',
    '  Expected an image 1280px by 1372px, received 1280px by 1293px. 8430 pixels (ratio 0.01 of all image pixels) are different.',
    '',
    '  Call log:',
    '    - taking page screenshot',
    '    - Expected an image 1280px by 1372px, received 1280px by 1293px. 8430 pixels (ratio 0.01 of all image pixels) are different.',
    '    - waiting 100ms before taking screenshot',
    '    - taking page screenshot',
    '    - captured a stable screenshot',
    '    - Expected an image 1280px by 1372px, received 1280px by 1293px. 8430 pixels (ratio 0.01 of all image pixels) are different.',
  ].join('\n')

  it('REGRESSION: one received height against a different baseline is a page that changed size, not a flip', async () => {
    expect(receivedHeights(shorterText)).toEqual([1293])
    const out = (await explainCaptureFailure(fakePage([]), new Error(shorterText), '/admin [dawn-light · desktop]')) as Error
    expect(out.message).toContain('/admin [dawn-light · desktop] is 1293px tall on every capture against a 1372px baseline, 79px shorter.')
    expect(out.message).toContain('This is NOT a flip')
    expect(out.message).toContain('A mask cannot hold a height')
    expect(out.message).not.toContain('changed height DURING capture')
    expect(out.message).not.toContain('THEN THE HEIGHT SETTLED')
    expect(out.message).toContain(shorterText)
  })

  it('the real flip still reads as a flip: the camera produced two heights', () => {
    expect(receivedHeights(flipText)).toEqual([7756, 7752])
  })

  it('a pixel diff with no attachments, or unreadable ones, is returned exactly as it was', async () => {
    const original = new Error('120 pixels (ratio 0.07 of all image pixels) are different.')
    expect(await explainCaptureFailure(fakePage([]), original, '/x')).toBe(original)
    expect(
      await explainCaptureFailure(fakePage([]), original, '/x', {
        attachments: [
          { name: 'x-expected.png', path: '/nowhere/e.png' },
          { name: 'x-actual.png', path: '/nowhere/a.png' },
        ],
      }),
    ).toBe(original)
  })
})
