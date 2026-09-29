'use client'

// DESCRIBE ON VIEW: the browser that opens a Loom grid fills the holes nobody else could (LIVE-588,
// ADR-1590; the last gap HYG-021 / ADR-1254 closed around).
//
// A blurhash and a palette are decoded in a BROWSER (lib/library/image-describe.ts), never on the
// server, because a server decode means `sharp` in a seam four surfaces reach (docs/DEPLOY-SAFETY.md,
// the 2026-08-11 fan-out). Every path where a person picks a file has that browser, and the two
// generators ask it one round-trip later (describe-generated.ts). Two paths have no browser at all:
// the importer's seeds (lib/importer/materialize.ts) and the event-photo copies
// (lib/library/event-loom.ts). Their rows sit with `blurhash` NULL until somebody LOOKS at them, and
// somebody does: the Loom Studio grid and the Space Loom Studio render those rows every day. So the
// grid asks the browser it is already running in.
//
// THE RULES, each one a cost somebody would otherwise pay:
//   · at most DESCRIBE_ON_VIEW_LIMIT rows per page view, so a 48-card page never fires 48 decodes;
//   · one at a time, after paint and when the browser is idle, so nothing a person is doing waits;
//   · a row is asked about ONCE per mount, success or not, so a failed decode does not loop;
//   · only a raster image whose `blurhash` is KNOWN to be NULL. A row whose blurhash the reader did
//     not carry (`undefined`) is left alone rather than guessed at;
//   · the write is the existing action behind the existing null-guarded backfill, so a client can
//     fill a hole and can never repaint an asset somebody already described.
//
// The surfaces pass `describeGeneratedAsset` in as `describe` rather than this module importing it,
// so each surface names the one path it rides and this file stays testable without a canvas.

import { useEffect, useRef } from 'react'
import { isVectorFile } from '@/lib/loom/urls'

/** The most rows one page view asks the browser to decode. */
export const DESCRIBE_ON_VIEW_LIMIT = 6

/** What a grid row must say for this to decide whether it still needs describing. */
export type DescribeOnViewRow = {
  id: string
  kind: string
  /** The url to DECODE: whatever the surface is already painting, so the bytes are usually cached. */
  url: string | null | undefined
  /** NULL means "known to be missing". `undefined` means "this reader did not carry it": skipped. */
  blurhash?: string | null
  mime?: string | null
}

/** The next rows to describe, in grid order: raster images with a known-missing blurhash that this
 *  mount has not already asked about. PURE. */
export function pickUndescribed(
  rows: readonly DescribeOnViewRow[],
  asked: ReadonlySet<string>,
  limit: number = DESCRIBE_ON_VIEW_LIMIT,
): { id: string; url: string }[] {
  const out: { id: string; url: string }[] = []
  for (const r of rows) {
    if (out.length >= limit) break
    if (r.kind !== 'image' || !r.url || r.blurhash !== null || asked.has(r.id)) continue
    // A vector has no pixels worth a blurhash, and fetching it to find that out is a wasted trip.
    if (isVectorFile(r.mime, r.url)) continue
    out.push({ id: r.id, url: r.url })
  }
  return out
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

/**
 * After paint, describe up to DESCRIBE_ON_VIEW_LIMIT of the rows on screen that still have no
 * placeholder, one at a time. Best-effort: every miss is silent, and nothing is ever re-asked.
 *
 * @param rows     the rows the surface is rendering, in order
 * @param describe the shared generated-asset path (`describeGeneratedAsset`); true when it wrote
 */
export function useDescribeOnView(
  rows: readonly DescribeOnViewRow[],
  describe: (id: string, url: string) => Promise<boolean>,
): void {
  const asked = useRef(new Set<string>())
  const running = useRef(false)
  const mounted = useRef(true)
  const latest = useRef({ rows, describe })

  // Declared before the scheduling effect so it has run by the time that one reads it.
  useEffect(() => {
    latest.current = { rows, describe }
  })

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Re-evaluate only when the SET of undescribed rows changes, not on every render (the surfaces
  // build their row lists inline, so the array identity changes each time).
  const key = rows
    .filter((r) => r.blurhash === null)
    .map((r) => r.id)
    .join(',')

  useEffect(() => {
    if (!key) return
    const run = async () => {
      if (running.current || !mounted.current) return
      const batch = pickUndescribed(latest.current.rows, asked.current)
      if (batch.length === 0) return
      running.current = true
      // Claimed up front, so a re-render mid-sequence can never ask about the same row twice.
      for (const b of batch) asked.current.add(b.id)
      try {
        for (const b of batch) {
          if (!mounted.current) return
          await latest.current.describe(b.id, b.url).catch(() => false)
        }
      } finally {
        running.current = false
      }
    }
    const w = window as IdleWindow
    if (typeof w.requestIdleCallback === 'function') {
      const handle = w.requestIdleCallback(() => void run(), { timeout: 4000 })
      return () => w.cancelIdleCallback?.(handle)
    }
    const handle = window.setTimeout(() => void run(), 1500)
    return () => window.clearTimeout(handle)
  }, [key])
}
