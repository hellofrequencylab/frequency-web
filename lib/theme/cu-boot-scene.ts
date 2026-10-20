// THE CYBERUNICORN 5000 BOOT SCENE, framework-free. A 1:1 port of the firmware design system's
// components/device/BootScene.jsx (hellofrequencylab/projects cyberpunkunicorn-os/design/), itself a
// canvas port of unicornBootScene() in apps/boot/unicorn_boot.cpp plus the blast-off finale: gallop,
// tremble, rocket away on a rainbow jet, flood the screen. The console plays it while the board boots.
//
// Colour lives here because this file is colour DATA (lib/theme/, scripts/check-tokens.mjs). Every
// colour goes through to565() so the browser shows what the ILI9341 panel shows.

import { CU_UNICORN_FRAMES, UNICORN_PALETTE, cyberHue, rgbCss, to565 } from './cyberunicorn'

type BootSceneOptions = {
  title?: string
  tagline?: string
  finale?: boolean
  loop?: boolean
  durationMs?: number
  /** CSS font-family for the pixel face (the resolved next/font family of Press Start 2P). */
  fontFamily?: string
  onDone?: () => void
}

const W = 320
const H = 240
const TITLE_H = 34
const SCENE_H = 170
const HORIZON = 110
const UNI = 3
const SPARKS = 18
const FRAME_MS = 40
// Phases (fractions of duration): gallop, tremble during the loader's stall, blast-off on a rainbow
// jet, then the jet floods the whole screen.
const P_TREMBLE = 0.46
const P_BLAST = 0.6
const P_WASH = 0.86
const LOADING = [
  'Polishing horn...',
  'Reticulating rainbows...',
  'Downloading more RAM...',
  'Charging glitter capacitors...',
  'Bribing the CC1101...',
  'Untangling the mane...',
  'Installing hooves.dll...',
  'Teaching IR to see colour...',
  'Negotiating with the nRF24...',
  'Overclocking sparkles...',
  'Summoning the PN532 spirit...',
  'Calibrating vibes...',
]

const c565 = (r: number, g: number, b: number) => rgbCss(to565([r, g, b]))
const hue = (h: number) => rgbCss(to565(cyberHue(h)))
const WHITE = c565(255, 255, 255)
const BLACK = c565(0, 0, 0)
const SPARK_C = [WHITE, c565(0, 255, 255), c565(255, 90, 200), c565(255, 220, 60)]

type Spark = { x: number; y: number; life: number }
type Blob = { id: number; x: number; y: number; vx: number; vy: number; s: number; g: number; max: number; h: number }
type JetPoint = { x: number; y: number; sc: number }

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Play the boot scene on `canvas` (set to 320×240 internal). Returns a stop function. */
export function startBootScene(canvas: HTMLCanvasElement, opts: BootSceneOptions = {}): () => void {
  const title = opts.title ?? 'CYBERUNICORN 5000'
  const tagline = opts.tagline ?? 'All systems fabulous.'
  const finale = opts.finale ?? true
  const loop = opts.loop ?? true
  const duration = opts.durationMs ?? (finale ? 10000 : 7000)
  const fontFamily = opts.fontFamily ?? "'Press Start 2P', monospace"
  const onDone = opts.onDone

  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  ctx.imageSmoothingEnabled = false

  let rng = 0xc0ffee42 >>> 0
  const rnd = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0
    return rng >>> 8
  }
  const sparks: Spark[] = Array.from({ length: SPARKS }, () => ({ x: 0, y: 0, life: 0 }))
  let plume: Blob[] = []
  let jet: JetPoint[] = []
  let t = 0
  let start = 0
  let last = 0
  let raf = 0
  let done = false
  let stopped = false
  let doneTimer: ReturnType<typeof setTimeout> | undefined

  const titleCv = document.createElement('canvas')
  titleCv.width = W
  titleCv.height = TITLE_H
  const tctx = titleCv.getContext('2d')

  function drawText(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, right = false) {
    c.font = `${6 * size}px ${fontFamily}`
    c.textBaseline = 'top'
    c.fillStyle = color
    const w = s.length * 6 * size
    const x0 = right ? x - w : x
    for (let i = 0; i < s.length; i++) c.fillText(s[i]!, x0 + i * 6 * size, y + size)
  }

  const sky = (t: number) => {
    for (let y = 0; y < HORIZON; y++) {
      const k = ((y * 255) / HORIZON) | 0
      ctx.fillStyle = c565(30 + ((k / 3) | 0), 0, 70 - ((k / 6) | 0))
      ctx.fillRect(0, TITLE_H + y, W, 1)
    }
    ctx.fillStyle = WHITE
    for (let i = 0; i < 24; i++) {
      const x = (i * 97 + 13) % W
      const y = (i * 53 + 7) % (HORIZON - 30)
      if ((i * 7 + ((t / 6) | 0)) % 9 !== 0) ctx.fillRect(x, TITLE_H + y, 1, 1)
    }
    const cx = 228
    const cy = HORIZON
    const r = 46
    for (let y = cy - r; y < cy; y++) {
      const dy = cy - y
      const dx = Math.sqrt(r * r - dy * dy) | 0
      if (dy < 22 && dy % 6 < 2) continue
      const k = ((y - (cy - r)) * 255 / r) | 0
      ctx.fillStyle = c565(255, 220 - ((k * 160 / 255) | 0), 60 + ((k * 120 / 255) | 0))
      ctx.fillRect(cx - dx, TITLE_H + y, 2 * dx, 1)
    }
  }

  const grid = (t: number) => {
    const depth = SCENE_H - HORIZON
    const o = TITLE_H
    ctx.fillStyle = c565(12, 0, 28)
    ctx.fillRect(0, o + HORIZON, W, depth)
    const phase = (t % 24) / 24
    for (let i = 0; i < 9; i++) {
      const z = (i + phase) / 9
      const y = HORIZON + ((z * z * depth) | 0)
      ctx.fillStyle = c565(0, 160 + ((z * 95) | 0), 255)
      ctx.fillRect(0, o + y, W, 1)
    }
    ctx.strokeStyle = c565(255, 0, 200)
    ctx.lineWidth = 1
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, o + HORIZON, W, depth)
    ctx.clip()
    for (let i = -11; i <= 11; i++) {
      ctx.beginPath()
      ctx.moveTo(160 + i * 9 + 0.5, o + HORIZON)
      ctx.lineTo(160 + i * 64 + 0.5, o + SCENE_H - 1)
      ctx.stroke()
    }
    ctx.restore()
    ctx.fillStyle = c565(255, 120, 255)
    ctx.fillRect(0, o + HORIZON, W, 1)
  }

  const trail = (ux: number, uy: number, t: number) => {
    const top = uy + 15 * UNI
    for (let x = 0; x < ux + 6 * UNI; x++) {
      const wave = (4 * Math.sin((x + t * 6) / 11)) | 0
      for (let b = 0; b < 6; b++) {
        ctx.fillStyle = hue(b * 60 - t * 8)
        ctx.fillRect(x, TITLE_H + top + b * 4 + wave, 1, 4)
      }
    }
  }

  const sparksDraw = (ux: number, uy: number, t: number) =>
    sparks.forEach((k, i) => {
      if (k.life === 0) {
        k.x = rnd() % (ux + 40 > 0 ? ux + 40 : 1)
        k.y = uy + 30 + (rnd() % 50) - 25
        k.life = 6 + (rnd() % 10)
      }
      k.x -= 3
      k.life--
      const a = k.life > 4 ? 2 : 1
      ctx.fillStyle = hue(i * 40 + t * 10)
      ctx.fillRect(k.x - a, TITLE_H + k.y, 2 * a + 1, 1)
      ctx.fillRect(k.x, TITLE_H + k.y - a, 1, 2 * a + 1)
    })

  const cellFill = (k: string, mane: string) => (k === 'R' ? mane : rgbCss(to565(UNICORN_PALETTE[k] ?? [0, 0, 0])))

  const unicorn = (ux: number, uy: number, f: number, t: number) =>
    CU_UNICORN_FRAMES[f]!.forEach((row, y) => {
      const mane = hue(y * 18 + t * 12)
      for (let x = 0; x < row.length; x++) {
        const k = row[x]!
        if (k === '.') continue
        ctx.fillStyle = cellFill(k, mane)
        ctx.fillRect(ux + x * UNI, TITLE_H + uy + y * UNI, UNI, UNI)
      }
    })

  // Unicorn at any scale, squashed horizontally (sx < 1) as it banks away from us.
  const unicornAt = (cx: number, top: number, sc: number, sx: number, f: number, t: number) =>
    CU_UNICORN_FRAMES[f]!.forEach((row, y) => {
      const mane = hue(y * 18 + t * 12)
      const w = Math.max(1, Math.ceil(sc * sx))
      const h = Math.max(1, Math.ceil(sc))
      for (let x = 0; x < row.length; x++) {
        const k = row[x]!
        if (k === '.') continue
        ctx.fillStyle = cellFill(k, mane)
        ctx.fillRect(Math.round(cx + (x - 20) * sc * sx), Math.round(TITLE_H + top + y * sc), w, h)
      }
    })

  const titleDraw = (t: number) => {
    if (!tctx) return
    tctx.fillStyle = BLACK
    tctx.fillRect(0, 0, W, TITLE_H)
    const size = title.length * 18 > 316 ? 2 : 3
    const cw = 6 * size
    const w = cw * title.length + 12
    const x0 = ((W - w) / 2) | 0
    const y0 = ((TITLE_H - 8 * size) / 2) | 0
    const glitch = rnd() % 7 === 0
    const jitter = glitch ? (rnd() % 9) - 4 : 0
    drawText(tctx, title, x0 - 2 + jitter, y0, size, c565(0, 255, 255))
    drawText(tctx, title, x0 + 2 - jitter, y0 + (glitch ? 1 : 0), size, c565(255, 0, 160))
    for (let i = 0; i < title.length; i++) drawText(tctx, title[i]!, x0 + i * cw, y0, size, hue(i * 22 - t * 9))
    drawText(tctx, 'TM', x0 + cw * title.length + 1, y0, 1, WHITE)
    if (glitch) {
      tctx.fillStyle = hue(rnd() % 360)
      tctx.fillRect(0, y0 + (rnd() % (8 * size)), W, 2 + (rnd() % 3))
    }
  }

  const loading = (elapsed: number, t: number) => {
    const y = TITLE_H + SCENE_H
    const barX = 16
    const barY = y + 6
    const barW = 288
    const barH = 10
    ctx.fillStyle = BLACK
    ctx.fillRect(0, y, W, H - y)
    if (!finale) {
      const k0 = elapsed / duration
      const pct0 =
        k0 < 0.45 ? ((k0 / 0.45) * 64) | 0 : k0 < 0.62 ? 64 + (((k0 - 0.45) * 18) | 0) : 67 + ((((k0 - 0.62) / 0.38) * 70) | 0)
      const dn0 = pct0 >= 100 ? barW - 2 : ((barW - 2) * pct0 / 100) | 0
      ctx.strokeStyle = c565(0, 255, 255)
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1)
      for (let x = 0; x < dn0; x++) {
        ctx.fillStyle = hue(x * 2 - t * 10)
        ctx.fillRect(barX + 1 + x, barY + 1, 1, barH - 2)
      }
      drawText(ctx, pct0 >= 100 ? tagline : LOADING[((k0 * 1.8 * LOADING.length) | 0) % LOADING.length]!, barX, barY + barH + 6, 1, WHITE)
      drawText(
        ctx,
        pct0 >= 100 ? `${pct0}% (oops)` : `${pct0}%`,
        barX + barW,
        barY + barH + 6,
        1,
        pct0 >= 100 ? hue(t * 20) : c565(255, 0, 200),
        true,
      )
      return
    }
    const k = elapsed / duration
    const pct =
      k < 0.4
        ? ((k / 0.4) * 64) | 0
        : k < P_BLAST
          ? 64 + (((k - 0.4) * 14) | 0)
          : Math.min(137, 67 + ((((k - P_BLAST) / (P_WASH - P_BLAST)) * 70) | 0))
    const fill = barW - 2
    const dn = pct >= 100 ? fill : ((fill * pct) / 100) | 0
    ctx.strokeStyle = c565(0, 255, 255)
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1)
    for (let x = 0; x < dn; x++) {
      ctx.fillStyle = hue(x * 2 - t * 10)
      ctx.fillRect(barX + 1 + x, barY + 1, 1, barH - 2)
    }
    let text: string
    if (k >= P_BLAST) text = k < P_BLAST + 0.03 ? 'Banking left...' : pct >= 100 ? 'BLAST OFF!!!' : 'Venting rainbows...'
    else if (k >= P_TREMBLE) text = (t >> 3) % 2 ? 'Uh oh. Rainbow pressure rising...' : 'Something is brewing...'
    else text = LOADING[((k * 1.8 * LOADING.length) | 0) % LOADING.length]!
    drawText(ctx, text, barX, barY + barH + 6, 1, k >= P_TREMBLE ? hue(t * 20) : WHITE)
    drawText(
      ctx,
      pct >= 100 ? `${pct}% (oops)` : `${pct}%`,
      barX + barW,
      barY + barH + 6,
      1,
      pct >= 100 ? hue(t * 20) : c565(255, 0, 200),
      true,
    )
  }

  // 4-point pixel sparkle.
  const star = (x: number, y: number, r: number, c: string) => {
    ctx.fillStyle = c
    ctx.fillRect(x - r, y, 2 * r + 1, 1)
    ctx.fillRect(x, y - r, 1, 2 * r + 1)
    if (r > 2) {
      ctx.fillStyle = WHITE
      ctx.fillRect(x - 1, y - 1, 3, 3)
    }
  }
  const snap = (v: number) => Math.round(v / 3) * 3

  const drawPlume = (t: number) => {
    // Jet ribbon: six rainbow bands along the rear's path, fattening with age.
    for (let j = 0; j < jet.length; j++) {
      const p = jet[j]!
      const age = jet.length - j
      const w = Math.min(60, p.sc * 2 * (1 + age * 0.12))
      for (let b = 0; b < 6; b++) {
        ctx.fillStyle = hue(b * 60 - t * 10)
        ctx.fillRect(snap(p.x - w), TITLE_H + snap(p.y + (b - 3) * w * 0.9), snap(w * 2) + 3, Math.ceil(w * 0.9) + 1)
      }
    }
    // Blobs: chunky rainbow pixels that spray back, swell and pile up.
    for (const q of plume) {
      const z = q.s / 3
      q.x += q.vx * z
      q.y += q.vy * z
      if (q.s < q.max) q.s *= q.g
      ctx.fillStyle = hue(q.h - t * 6)
      const s = snap(q.s) || 3
      ctx.fillRect(snap(q.x), TITLE_H + snap(q.y), s, s)
    }
    for (const q of plume)
      if ((q.id + t) % 7 === 0) star(snap(q.x) + 1, TITLE_H + snap(q.y) + 1, 2 + (q.id % 3), SPARK_C[(q.id + (t >> 2)) % 4]!)
  }

  const wash = (w: number, t: number) => {
    // The flood: a diagonal rainbow wipe from bottom-left that eats the screen.
    const front = w * 300 - 30
    for (let y = 0; y < H; y += 6)
      for (let x = 0; x < W; x += 6) {
        const d = H - y
        if (d > front + Math.sin((x + t * 6) / 16) * 14) continue
        ctx.fillStyle = hue((x + y) * 1.2 - t * 14)
        ctx.fillRect(x, y, 6, 6)
      }
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + t * 13) % W
      const y = (i * 61 + t * 7) % H
      if (H - y < front && (i + (t >> 1)) % 3) star(x, y, 2 + (i % 4), SPARK_C[i % 4]!)
    }
    if (w >= 1) {
      const msg = tagline
      const sz = msg.length * 12 > 300 ? 1 : 2
      const x0 = ((W - msg.length * 6 * sz) / 2) | 0
      const y0 = 112
      drawText(ctx, msg, x0 - 2, y0, sz, c565(0, 255, 255))
      drawText(ctx, msg, x0 + 2, y0, sz, c565(255, 0, 160))
      drawText(ctx, msg, x0, y0, sz, WHITE)
    }
  }

  /** Draw the scene at `elapsed` ms into the run, at tick `t`. `still` drops the shake. */
  const render = (elapsed: number, still = false) => {
    const k = finale ? elapsed / duration : ((elapsed / duration) * P_TREMBLE) / 0.999
    let ux = -110 + Math.min(t * 6, 170)
    let uy = 22 + ((3 * Math.sin(t / 2)) | 0)
    let f = ((t / 4) | 0) % 2
    let shake = 0
    if (k >= P_TREMBLE && k < P_BLAST) {
      const n = (k - P_TREMBLE) / (P_BLAST - P_TREMBLE)
      const amp = 1 + n * 4
      ux += ((rnd() % 3) - 1) * amp
      uy = 22 + ((rnd() % 3) - 1) * amp
      f = 0
      shake = n > 0.6 ? 1 : 0
    }
    // Blast-off: bank left (squash) to face the horizon, then rocket up and away over the sun,
    // shrinking into the distance, spraying rainbow at the viewer.
    let far: { cx: number; top: number; sc: number; sx: number; n: number } | null = null
    if (k >= P_BLAST) {
      const n = Math.min(1, (k - P_BLAST) / (P_WASH - P_BLAST))
      let cx = 120
      let top: number
      let sc = 3
      let sx: number
      if (n < 0.16) {
        const tn = n / 0.16
        sx = 1 - 0.55 * tn
        top = 22 - tn * 6
        shake = 2
        f = 0
      } else {
        const m = (n - 0.16) / 0.84
        const e = 1 - (1 - m) * (1 - m)
        sx = 0.45
        sc = 3 - 2.55 * e
        cx = 120 + (226 - 120) * e
        top = 16 + (26 - 16) * e - Math.sin(m * Math.PI) * 18 - sc * 6
        f = ((t / 2) | 0) % 2
        shake = sc > 1.5 ? 3 : 1
      }
      far = { cx, top, sc, sx, n }
      const rx = cx
      const ry = top + 18 * sc
      if (n >= 0.1) {
        jet.push({ x: rx, y: ry, sc })
        if (jet.length > 70) jet.shift()
        const burst = 14 + ((n * 26) | 0)
        for (let i = 0; i < burst && plume.length < 1400; i++)
          plume.push({
            id: plume.length,
            x: rx + ((rnd() % 5) - 2) * sc,
            y: ry,
            vx: ((rnd() % 13) - 6) * 0.45,
            vy: ((rnd() % 11) - 2) * 0.45,
            s: Math.max(1.5, sc),
            g: 1.05 + (rnd() % 5) * 0.01,
            max: 24 + (rnd() % 24),
            h: (plume.length * 11) % 360,
          })
      }
    }
    if (still) shake = 0
    if (shake) ctx.setTransform(1, 0, 0, 1, (rnd() % (2 * shake + 1)) - shake, (rnd() % (2 * shake + 1)) - shake)
    sky(t)
    grid(t)
    if (k < P_BLAST) trail(ux, uy, t)
    if (k < P_TREMBLE) sparksDraw(ux, uy, t)
    if (far) {
      if (far.n < 0.97) unicornAt(far.cx, far.top, far.sc, far.sx, f, t)
      else star(far.cx | 0, TITLE_H + (far.top | 0) + 6, 6, SPARK_C[t % 4]!)
    } else unicorn(ux | 0, uy | 0, f, t)
    if (k >= P_BLAST) drawPlume(t)
    if (k >= P_TREMBLE && k < P_BLAST && (t >> 2) % 2) {
      drawText(ctx, '!!', ux + 34 * UNI, TITLE_H + uy - 18, 2, c565(255, 0, 200))
      ctx.fillStyle = c565(0, 255, 255)
      ctx.fillRect(ux + 26 * UNI + (t % 3), TITLE_H + uy + 4 + (t % 6) * 2, 2, 3)
    }
    if (still || t % 3 === 0 || shake) titleDraw(t)
    ctx.drawImage(titleCv, 0, 0)
    loading(elapsed, t)
    if (k >= P_WASH - 0.04) wash(Math.min(1, (k - P_WASH + 0.04) / 0.12), t)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  const frame = (now: number) => {
    if (stopped) return
    raf = requestAnimationFrame(frame)
    if (now - last < FRAME_MS) return
    last = now
    let elapsed = now - start
    if (elapsed >= duration) {
      if (!done && onDone) onDone()
      if (!loop) {
        done = true
        cancelAnimationFrame(raf)
        return
      }
      start = now
      elapsed = 0
      t = 0
      sparks.forEach((s) => (s.life = 0))
      plume = []
      jet = []
    }
    render(elapsed)
    t++
  }

  ctx.fillStyle = BLACK
  ctx.fillRect(0, 0, W, H)

  const reduced = prefersReducedMotion()
  const fontReady: Promise<unknown> =
    typeof document !== 'undefined' && document.fonts?.load ? document.fonts.load(`8px ${fontFamily}`) : Promise.resolve()
  fontReady
    .catch(() => undefined)
    .then(() => {
      if (stopped) return
      if (reduced) {
        // One still, mid-gallop, with the loader at 64%. No animation.
        t = 30
        render(finale ? 0.4 * duration : 0.45 * duration, true)
        if (!loop && onDone) doneTimer = setTimeout(() => !stopped && onDone(), duration)
        return
      }
      start = performance.now()
      raf = requestAnimationFrame(frame)
    })

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    if (doneTimer) clearTimeout(doneTimer)
  }
}
