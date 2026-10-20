// THE CYBERUNICORN 5000 SKIN, as data (design system "CyberUnicorn 5000", Claude Design, 2026-10-20;
// firmware copy at hellofrequencylab/projects cyberpunkunicorn-os/design/). ONE surface wears it: the
// CyberUnicorn console in a Space's Check-in & scanners panel (components/spaces/loyalty/cyberunicorn-
// console.tsx). Everything else on the page stays in the Frequency design. The skin is scoped by
// putting CU_SCOPE_STYLE on the console's root, so its custom properties never reach the page.
//
// Values are the firmware's 24-bit sources (assets/make_unicorn.py, apps/boot/unicorn_boot.cpp, patch
// 0008), and the hue maths is rainbow.cpp ported 1:1, quantised to RGB565 so the browser shows what the
// panel shows. This file is colour DATA, which is why it lives under lib/theme/ (scripts/check-tokens.mjs).

import type { CSSProperties } from 'react'

export type RGB = readonly [number, number, number]
export type HueMode = 'row' | 'col' | 'diag' | 'angle'
type CellValue = RGB | 'rainbow' | 'frameA' | 'frameB' | 'gridA' | 'gridB' | 'sparkle' | null

/** The skin's custom properties. Semantic names first; the console reads only these. */
export const CU_SCOPE_STYLE = {
  '--cu-screen': '#000000', // bgColor, the panel background
  '--cu-panel': '#1e0046', // sky top
  '--cu-floor': '#0c001c', // grid floor
  '--cu-text': '#ffffff',
  '--cu-muted': '#c8b4ff', // lavender: labels, disabled
  '--cu-dim': '#7b7b7b', // TFT_DARKGREY: key-hint footers
  '--cu-primary': '#ff00c8', // hot pink, bruceConfig.priColor default: selected, pressed
  '--cu-secondary': '#00ffff', // cyan: links, progress outline, the cyber eye
  '--cu-ok': '#00ffa0', // neon hooves green
  '--cu-warn': '#ffdc3c', // horn yellow
  '--cu-attention': '#ff5ac8', // nose pink
  '--cu-glitch-left': '#00ffff',
  '--cu-glitch-right': '#ff00a0',
  '--cu-sky': 'linear-gradient(180deg,#1e0046 0%,#3c0034 60%,#73001c 100%)',
  '--cu-sun': 'linear-gradient(180deg,#ffdc3c 0%,#ff9678 55%,#ff3cb4 100%)',
  // GFX text sizes (one step = a 6×8 cell) and the VT323 body sizes.
  '--cu-type-1': '8px',
  '--cu-type-2': '16px',
  '--cu-type-body': '20px',
  '--cu-type-console': '18px',
} as CSSProperties

/** cyberHue(): full-saturation hue in degrees → RGB. Same sector maths as rainbow.cpp. */
function cyberHue(hue: number): RGB {
  let h = hue % 360
  if (h < 0) h += 360
  const s = Math.floor(h / 60)
  const f = Math.floor(((h % 60) * 255) / 60)
  switch (s) {
    case 0:
      return [255, f, 0]
    case 1:
      return [255 - f, 255, 0]
    case 2:
      return [0, 255, f]
    case 3:
      return [0, 255 - f, 255]
    case 4:
      return [f, 0, 255]
    default:
      return [255, 0, 255 - f]
  }
}

/** Quantise to RGB565 and back: the colour the ILI9341 actually lights. */
function to565([r, g, b]: RGB): RGB {
  return [(r & 0xf8) | (r >> 5), (g & 0xfc) | (g >> 6), (b & 0xf8) | (b >> 5)]
}

function rgbCss([r, g, b]: RGB): string {
  return `rgb(${r},${g},${b})`
}

/** The panel colour of one hue, as CSS. */
export function hueCss(hue: number): string {
  return rgbCss(to565(cyberHue(hue)))
}

/** cyberRainbowFrame(): the hue walking round a panel's outline, as a conic gradient. */
export function rainbowFrameCss(phase: number): string {
  const stops = Array.from({ length: 13 }, (_, i) => `${hueCss(phase + i * 30)} ${i * 30}deg`).join(',')
  return `conic-gradient(from 90deg, ${stops})`
}

/** cyberRainbowFill(): a progress fill `done` px wide whose hue walks along it (the boot loader). */
export function rainbowFillCss(done: number, phase: number): string {
  const stops: string[] = []
  for (let x = 0; x <= Math.max(done, 1); x += 6) stops.push(`${hueCss(x * 2 - phase)} ${x}px`)
  return `linear-gradient(90deg, ${stops.join(',')})`
}

function modeHue(mode: HueMode, x: number, y: number, w = 32, h = 24): number {
  if (mode === 'row') return y * 18
  if (mode === 'col') return x * 12
  if (mode === 'diag') return (x + y) * 10
  return (Math.atan2(y - (h - 1) / 2, x - (w - 1) / 2) * 180) / Math.PI + 180
}

/** One icon cell's colour at tick `t` (25 fps), or null for nothing drawn. Ported from pixel.js. */
function cellColor(k: string, x: number, y: number, mode: HueMode, t: number): RGB | null {
  const v = ICON_PALETTE[k]
  if (v === null || v === undefined) return null
  const frame = Math.floor(t / 6) % 2
  const hue = () => cyberHue(modeHue(mode, x, y) + t * 12)
  if (v === 'rainbow') return hue()
  if (v === 'frameA') return frame === 0 ? hue() : null
  if (v === 'frameB') return frame === 1 ? hue() : null
  if (v === 'gridA') return frame === 0 ? [0, 160, 255] : [12, 0, 28]
  if (v === 'gridB') return frame === 1 ? [0, 160, 255] : [12, 0, 28]
  if (v === 'sparkle') {
    const p = (x * 3 + y * 5 + Math.floor(t / 4)) % 6
    return p === 0 ? [255, 255, 255] : p === 1 ? [0, 255, 255] : p === 2 ? [255, 90, 200] : null
  }
  return v
}

/** Paint an icon grid onto a 2D canvas at `cell` px per cell. */
export function paintIcon(ctx: CanvasRenderingContext2D, grid: readonly string[], mode: HueMode, t: number, cell: number) {
  ctx.clearRect(0, 0, grid[0]!.length * cell, grid.length * cell)
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!
    for (let x = 0; x < row.length; x++) {
      const c = cellColor(row[x]!, x, y, mode, t)
      if (!c) continue
      ctx.fillStyle = rgbCss(to565(c))
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }
}

/** Paint one gallop frame of the boot unicorn. The mane hue is row × 18 + t × 12, like the boot scene. */
export function paintUnicorn(ctx: CanvasRenderingContext2D, t: number, cell: number) {
  const rows = CU_UNICORN_FRAMES[Math.floor(t / 4) % 2]!
  ctx.clearRect(0, 0, rows[0]!.length * cell, rows.length * cell)
  rows.forEach((row, y) => {
    const mane = cyberHue(y * 18 + t * 12)
    for (let x = 0; x < row.length; x++) {
      const k = row[x]!
      if (k === '.') continue
      const c = k === 'R' ? mane : UNICORN_PALETTE[k]
      if (!c) continue
      ctx.fillStyle = rgbCss(to565(c))
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  })
}

// ── Pixel data, generated from the design system's iconData.js / unicornData.js. Do not hand-edit. ──

/** Icon palette: cell key → RGB, or a behaviour (rainbow, two-frame, sparkle, grid). Keys 0-9 match
 *  unicorn_sprite.h; the rest are the boot scene's sky, sun, grid and floor. */
const ICON_PALETTE: Record<string, CellValue> = {
  '.': null,
  R: 'rainbow',
  K: [24, 6, 40],
  W: [255, 255, 255],
  w: [200, 180, 255],
  H: [255, 220, 60],
  h: [255, 140, 0],
  E: [0, 255, 255],
  P: [255, 90, 200],
  G: [0, 255, 160],
  M: [255, 0, 200],
  B: [0, 160, 255],
  D: [30, 0, 70],
  V: [96, 0, 48],
  N: [12, 0, 28],
  o: [255, 150, 120],
  S: 'sparkle',
  A: 'frameA',
  a: 'frameB',
  Q: 'gridA',
  q: 'gridB',
}

/** Two icons from the set (design system icons/build_icons.js): 32×24 cells, 3 px per cell on the panel. */
export const CU_ICONS = {
  frequency: {
    label: 'Frequency Check-in',
    mode: 'angle' as HueMode,
    grid: [
      '............RRRRRRRR............',
      '..........RRRRRRRRRRRR..........',
      '..S......RRRKKKKKKKKRRR.........',
      '.......RRRKKDDDDDDDDKKRRR....S..',
      '.......RRKSDDDDDDDDDDDKRR.......',
      '...A..RRKDDDDDDDDDDDDDDKRR......',
      '..AAARRKDWWWWWWWWWWWDDDDKRR.....',
      '...A.RRKWWWWWWWWWWWWWDDDKRR.....',
      '....RRKVWWVVVVVVVVVWWWVVVKRR....',
      '....RRKVWWVVVVVVVVVVWWVVSKRR....',
      '....RRKSWWWWWVWWWWWWWWVVVKRR....',
      '....RRKVWWWWWVWWWWWWWVVVVKRR....',
      '....RRKVWWVVVVWWVVWWVVVVVKRR....',
      '....RRKVWWVVVVWWVVVWWVVVVKRR....',
      '....RRKNWWNNNNWWHHNWWNNNNKRR....',
      '....RRKNwwNNHHwwHHHHwwNNNKRRa...',
      '.....RRKwwNhhhwwhhhhhwwNKRRaaa..',
      '.....RRKNNNNNNNNNNNNNNNNKRR.a...',
      '......RRKooooooooooooooKRR......',
      '.......RRKNNNNNNNNNNNNKRR.......',
      '.......RRRKKPPPPPPPPKKRRR.......',
      '..S......RRRKKKKKKKKRRR......S..',
      '..........RRRRRRRRRRRR..........',
      '............RRRRRRRR............',
    ],
  },
  rfid: {
    label: 'RFID Cards',
    mode: 'col' as HueMode,
    grid: [
      '................................',
      '................................',
      '................................',
      '...KKKKKKKKKKKKKKKKKKKKK........',
      '..KWWWWWWWWWWWWWWWWWWWWWK.......',
      '.KWWWWWWWWWWWWWWWWWWWWWWWK......',
      'KWWWWWWWWWWWWWWWWWWWWWWWWwK.....',
      'KWWWWWWWWWWWWWWWWWWWWWWWWwK.a...',
      'KWWWHHHhHHHWWWWWWWWWWWWWWwK..a..',
      'KWWWHHHhHHHWWwwwwwwwwwwWWwKA.a..',
      'KWWWhhhhhhhWWWWWWWWWWWWWWwK.A.a.',
      'KWWWHHHhHHHWWWWWWWWWWWWWWwK.A.a.',
      'KWWWHHHhHHHWWwwwwwwwWWWWWwK.A.a.',
      'KWWWHHHhHHHWWWWWWWWWWWWWWwK.A.a.',
      'KWWWWWWWWWWWWWWWWWWWWWWWWwK.A.a.',
      'KWWWWWWWWWWWWWWWWWWWWWWWWwKA.a..',
      'KWRRRRRRRRRRRRRRRRRRRRRRRwK..a..',
      'KWRRRRRRRRRRRRRRRRRRRRRRRwK.a...',
      'KWWWWWWWWWWWWWWWWWWWWWWWWwK.....',
      '.KWWWWWWWWWWWWWWWWWWWWWWWK......',
      '..KwwwwwwwwwwwwwwwwwwwwwK.......',
      '...KKKKKKKKKKKKKKKKKKKKK........',
      '................................',
      '................................',
    ],
  },
} as const

const UNICORN_PALETTE: Record<string, RGB> = {
  K: [24, 6, 40],
  W: [255, 255, 255],
  w: [200, 180, 255],
  H: [255, 220, 60],
  h: [255, 140, 0],
  E: [0, 255, 255],
  P: [255, 90, 200],
  G: [0, 255, 160],
}

/** The boot unicorn's two gallop frames (assets/make_unicorn.py), 40×29 cells. 'R' is the mane. */
const CU_UNICORN_FRAMES = [
  [
    '...................................H....',
    '..................................HhK...',
    '.................................HhK....',
    '................................HhK.....',
    '.......................RRRR....KHhK.....',
    '.....................RRRRRRRKKKWWK......',
    '....................RRRRRRRKWWWWWWK.....',
    '...................RRRRRRRKWWWWWEEWK....',
    '..................RRRRRRRKWWWWWWEEWWK...',
    '..................RRRRRRKWWWWWWWWWWWWK..',
    '.................RRRRRRKWWWWWWWWWWWWPWK.',
    '.................RRRRRKWWWWWWKKKWWWWWWK.',
    '................RRRRRKWWWWWWK..KKKKKKK..',
    '................RRRRKWWWWWWK............',
    '..RRRR.........RRRRKWWWWWWWK............',
    '.RRRRRRR...KKKKKKKKWWWWWWWWK............',
    'RRRRRRRRKKKWWWWWWWWWWWWWWWWK............',
    'RRRRRRRKWWWWWWWWWWWWWWWWWWWWK...........',
    '.RRRRRKWWWWWWWWWWWWWWWWWWWWWK...........',
    '..RRRRKWWWWWWWWWWWWWWWWWWWWWK...........',
    '...RRRKwWWWWWWWWWWWWWWWWWWWwK...........',
    '....RRKwwWWWWWWWWWWWWWWWWWwwK...........',
    '.....RKwwwKKwwwwwwwwwwKKwwwK............',
    '......KwwK.KKKKKKKKKKK.KwwK.............',
    '.....KwwK...............KwwK............',
    '....KwwK.................KwwK...........',
    '...KwwK...................KwwK..........',
    '..KGGK.....................KGGK.........',
    '..KKK.......................KKK.........',
  ],
  [
    '...................................H....',
    '..................................HhK...',
    '.................................HhK....',
    '................................HhK.....',
    '.......................RRRR....KHhK.....',
    '.....................RRRRRRRKKKWWK......',
    '....................RRRRRRRKWWWWWWK.....',
    '...................RRRRRRRKWWWWWEEWK....',
    '..................RRRRRRRKWWWWWWEEWWK...',
    '..................RRRRRRKWWWWWWWWWWWWK..',
    '.................RRRRRRKWWWWWWWWWWWWPWK.',
    '.................RRRRRKWWWWWWKKKWWWWWWK.',
    '................RRRRRKWWWWWWK..KKKKKKK..',
    '................RRRRKWWWWWWK............',
    '...............RRRRKWWWWWWWK............',
    'RRRRRRRR...KKKKKKKKWWWWWWWWK............',
    '.RRRRRRRKKKWWWWWWWWWWWWWWWWK............',
    '..RRRRRKWWWWWWWWWWWWWWWWWWWWK...........',
    '...RRRKWWWWWWWWWWWWWWWWWWWWWK...........',
    '...RRRKWWWWWWWWWWWWWWWWWWWWWK...........',
    '..RRRRKwWWWWWWWWWWWWWWWWWWWwK...........',
    '.RRRR.KwwWWWWWWWWWWWWWWWWWwwK...........',
    '......KwwwKKwwwwwwwwwwKKwwwK............',
    '.......KwwKKKKKKKKKKKKKwwK..............',
    '........KwwK.........KwwK...............',
    '.........KwwK.......KwwK................',
    '..........KwwK.....KwwK.................',
    '..........KGGK.....KGGK.................',
    '..........KKK......KKK..................',
  ],
] as const
