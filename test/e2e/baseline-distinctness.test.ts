// Committed visual baselines must each be a photograph of their OWN surface.
//
// Why this exists. #2049 photographed the app shell for the first time and committed four
// `app-room` baselines that were pictures of the marketing HOME page — hero copy, "JOIN THE
// BETA" button and all. `appSurfaces()` defaults `PW_ROOM_PATH` to `/channels`; that visit
// bounced, and the only guard in place (`assertMemberSession`) tested for `/sign-in` and
// nothing else, so a bounce to `/` read as success. The baselines sat in the repo for five
// days as the reference for a member room, and the next `update_baselines` run would have
// re-frozen them.
//
// `assertMemberSession` now catches the bounce at capture time (surfaces.ts). This is the
// second lock: it reads what is actually COMMITTED, so a wrong reference cannot survive in
// the tree even if it is produced some other way — a hand-copied file, a resolved merge
// conflict, a future surface that quietly redirects.
//
// The check is deliberately about DISTINCTNESS, not correctness. It cannot know what a room
// looks like, but it can know that a room does not look 99% like the home page. Two
// different surfaces rendering near-identical pixels is either a mis-pointed surface or a
// redundant one, and both are worth a human's attention.
//
// Runs in the normal vitest suite (no browser, no baseURL) — it only reads PNG bytes.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { coverageSurfaces } from './surfaces'

const DIR = join('test', 'e2e', '__screenshots__', 'visual.spec.ts')

/** The Playwright projects' viewports, mirrored from playwright.config.ts. */
const VIEWPORT = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }

/** Slugs captured at viewport height, read off the surface registry rather than re-listed.
 *  The stub env is what makes the two env-gated rows visible here; see appSurfaces().
 *
 *  🔴 EVERY REGISTRY, and keep it that way even though only `/feed` opts in today. It reads
 *  `coverageSurfaces()` — the visual suite's own union (ADR-1128), so a registry added there is
 *  covered here the day it lands rather than the day someone remembers. This read
 *  `appSurfaces()` alone, on the fair assumption that only the member shell would ever need a
 *  first-screen capture. `/discover` broke that in #2139: an ANON surface opted in, its eight
 *  baselines came back viewport-tall, and this file called every one of them a Vercel protection
 *  wall. That opt-in has since been reversed (see LIVE_DATA_PATHS in surfaces.ts, now deliberately
 *  empty), so the widening currently changes no result — which is exactly when it is cheapest to
 *  keep. The wall detector below is why: it fails CLOSED, so a registry it cannot see reads as a
 *  compromised capture rather than as an unknown, and the next anon opt-in must not have to
 *  rediscover that. */
const VIEWPORT_ONLY = new Set(
  coverageSurfaces({ roomPath: '/room', spaceSlug: 'space' })
    .filter((s) => s.viewportOnly)
    .map((s) => s.slug),
)

/** `<slug>--<state>-<project>.png` → its three parts. */
function parse(file: string): { slug: string; variant: string } | null {
  const m = /^(.+?)--(.+)\.png$/.exec(file)
  return m ? { slug: m[1], variant: m[2] } : null
}

/** Downscaled greyscale bytes — enough to tell two pages apart, cheap enough for every pair. */
async function fingerprint(file: string): Promise<Buffer> {
  return sharp(join(DIR, file)).resize(48, 96, { fit: 'fill' }).greyscale().raw().toBuffer()
}

function similarity(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let same = 0
  for (let i = 0; i < n; i++) if (Math.abs(a[i] - b[i]) < 12) same++
  return same / n
}

// Two surfaces that genuinely SHOULD look alike belong here, with the reason. Empty on
// purpose: nothing in the current registry has a defensible twin.
const ALLOWED_TWINS: ReadonlyArray<readonly [string, string]> = []

function isAllowed(a: string, b: string): boolean {
  return ALLOWED_TWINS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

describe('visual baselines are distinct per surface', () => {
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.png')) : []

  it('has baselines to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('no two surfaces share a near-identical capture in the same render state', async () => {
    // Group by variant, so we only ever compare like with like (same state, same viewport).
    const byVariant = new Map<string, { slug: string; file: string }[]>()
    for (const file of files) {
      const p = parse(file)
      if (!p) continue
      const list = byVariant.get(p.variant) ?? []
      list.push({ slug: p.slug, file })
      byVariant.set(p.variant, list)
    }

    const offenders: string[] = []

    for (const [variant, list] of byVariant) {
      const prints = new Map<string, Buffer>()
      for (const { file } of list) prints.set(file, await fingerprint(file))

      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]
          const b = list[j]
          if (a.slug === b.slug) continue
          if (isAllowed(a.slug, b.slug)) continue
          const score = similarity(prints.get(a.file)!, prints.get(b.file)!)
          if (score > 0.98) {
            offenders.push(
              `${a.slug} ≈ ${b.slug} (${variant}): ${(score * 100).toFixed(1)}% identical`,
            )
          }
        }
      }
    }

    expect(
      offenders,
      [
        'Two DIFFERENT surfaces have near-identical baselines, so at least one of them is a',
        'photograph of the wrong page. Check where that surface actually lands before',
        'recapturing — recapturing is what freezes the mistake.',
        '',
        ...offenders,
      ].join('\n'),
    ).toEqual([])
  }, 60_000)

  it('every baseline is a real PNG at the height its capture mode implies', () => {
    const bad: string[] = []
    for (const file of files) {
      const b = readFileSync(join(DIR, file))
      const isPng = b.length > 24 && b.readUInt32BE(0) === 0x89504e47
      if (!isPng) {
        bad.push(`${file}: not a PNG`)
        continue
      }
      const width = b.readUInt32BE(16)
      const height = b.readUInt32BE(20)
      const vp = file.includes('-mobile') ? VIEWPORT.mobile : VIEWPORT.desktop
      if (width !== vp.width) bad.push(`${file}: width ${width}, expected ${vp.width}`)

      if (VIEWPORT_ONLY.has(parse(file)?.slug ?? '')) {
        // Height carries no wall signal for these: a first-screen capture and an interstitial
        // are both exactly one viewport tall. What it still catches is the two sides
        // disagreeing — a baseline taller than the viewport means the registry says
        // `viewportOnly` and the capture ran `fullPage`, so the committed reference was taken
        // under rules that are no longer in force.
        if (height !== vp.height) {
          bad.push(`${file}: height ${height}, expected exactly ${vp.height} (captured viewportOnly)`)
        }
      } else if (height <= 900) {
        // A viewport-tall capture is the signature of a wall (Vercel Deployment Protection,
        // an error page) rather than a full-page render of a real surface.
        //
        // It is also what a baseline looks like after its surface LEAVES `viewportOnly` and has
        // not been recaptured yet — the mirror of the branch above, and the state `/discover` was
        // left in when ADR-1042 reverted its opt-in. Both readings are named because the fix
        // differs: a wall means the bypass secret is missing, a stale mode means one runner
        // dispatch. The light-vs-dark rule below is what tells them apart (a wall photographs
        // identically in both states; a real surface repaints), so run it before choosing.
        bad.push(
          `${file}: height ${height} — viewport-tall. Either a wall (set ` +
            'VERCEL_AUTOMATION_BYPASS_SECRET) or a baseline taken while this surface was ' +
            'viewportOnly and not yet recaptured full-page (e2e-manual.yml → update_baselines).',
        )
      }
    }
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('a viewport-only baseline still proves it photographed the app, not a wall', async () => {
    // This is the wall detector the rule above gives up for `viewportOnly` slugs, and it has
    // to be a different KIND of evidence — height cannot distinguish a first screen from an
    // interstitial. It leans on something a wall cannot fake: our shell repaints completely
    // between light and dark, while Vercel's protection page and a framework error page both
    // ignore `.dark` and photograph identically in the two states.
    //
    // The 90% threshold is not a guess. Measured 2026-08-10 across the committed baselines,
    // light-vs-dark similarity was: app-settings 0.0/0.9%, app-space-console 0.9/3.4%,
    // app-feed 3.9/15.2%, the-lab 34.9/32.2% (desktop/mobile). A theme-blind page scores ~100%,
    // so the bar sits in empty space — well above the noisiest real surface, far below a wall.
    //
    // Note the two rules fail closed together. If VIEWPORT_ONLY ever came back empty because
    // the registry import broke, this test would silently check nothing — but the height rule
    // would then hold /feed's 800px baselines to the full-page floor and fail loudly. Neither
    // can go quiet on its own.
    const offenders: string[] = []
    for (const file of files) {
      const p = parse(file)
      if (!p || !VIEWPORT_ONLY.has(p.slug) || !p.variant.includes('-light-')) continue
      const twin = `${p.slug}--${p.variant.replace('-light-', '-dark-')}.png`
      if (!files.includes(twin)) {
        offenders.push(`${file}: no dark twin (${twin}) to compare against`)
        continue
      }
      const score = similarity(await fingerprint(file), await fingerprint(twin))
      if (score > 0.9) {
        offenders.push(
          `${file} ≈ ${twin}: ${(score * 100).toFixed(1)}% identical — this capture does not ` +
            'respond to dark mode, which is what a wall looks like',
        )
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  }, 30_000)
})
