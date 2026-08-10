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

const DIR = join('test', 'e2e', '__screenshots__', 'visual.spec.ts')

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

  it('every baseline is a real PNG with a plausible full-page height', () => {
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
      const expectedWidth = file.includes('-mobile') ? 390 : 1280
      if (width !== expectedWidth) bad.push(`${file}: width ${width}, expected ${expectedWidth}`)
      // A viewport-tall capture is the signature of a wall (Vercel Deployment Protection,
      // an error page) rather than a full-page render of a real surface.
      if (height <= 900) bad.push(`${file}: height ${height} — viewport-tall, likely a wall`)
    }
    expect(bad, bad.join('\n')).toEqual([])
  })
})
