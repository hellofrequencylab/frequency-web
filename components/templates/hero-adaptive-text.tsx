'use client'

import { useEffect, useRef, useState } from 'react'
import {
  loadSampleSource,
  parseCssColor,
  relativeLuminance,
  resolveMediaTone,
  resolveZoneTone,
  sampleCoverRegionLuminance,
  tileLuminancesFrom,
  zoneRegion,
  type HeroOverlayMode,
  type HeroSampleSource,
} from '@/lib/images/hero-contrast'

// The content-aware hero SENSOR (ADR-830, per-zone since ADR-894) — an invisible probe PageHero
// mounts when `adaptiveText` is on. It reads the cover pixels behind EACH TEXT ZONE (factoring the
// active overlay mode/color) and stamps that zone with:
//
//   data-media-tone   — 'dark' (light copy) | 'light' (dark copy); drives --color-on-media
//   data-media-plate  — '0'..'3'; the legibility ladder (0 nothing · 1 halo · 2 plate · 3 strong)
//
// PER ZONE, because one tone for a whole header is a lie on a split cover. The owner's photo is a
// bright subject beside dark timber with the name over the timber: a single statistic over one band
// scored it "bright" and flipped the name to black on black wood. Each zone now answers only for
// the pixels behind its own words.
//
// WHAT THE SERVER RENDERS, AND WHEN THIS CORRECTS IT. The server renders every zone UNMEASURED —
// no data-media-tone, no data-media-plate — and the CSS answers that with the per-glyph halo and
// NO plate: the pre-ADR-830 baseline, known to read on real photos. It is deliberately not a tone
// guess, because --color-on-media defaults to the LIGHT copy and a bright cover would composite
// light-on-light at about 1.13:1. This effect runs on the first frame after hydration and replaces
// the baseline with the measured answer. On failure it puts the zone BACK to unmeasured rather
// than leaving a stale or invented value. It re-runs when the cover, focal point, overlay or theme
// changes (the rail's edits revalidate the page and flow straight back through here) and on a
// debounced resize, because a zone's box is where the words actually landed.
//
// ONE TREATMENT, NOT TWO PATCHES: if either zone needs a plate, both zones step to the same rung.
// Two pads on one photo reads as damage; one consistent treatment reads as design.
//
// The CSS side lives in app/globals.css (.hero-adaptive-text .hero-zone). A hero with adaptiveText
// but NO zones (the `minimal` variant, a legacy caller) still gets the original section-level tone
// plus the .hero-text-scrim gradient — that path is untouched.

/** Re-measure at most this often while a box is moving. The plate changes a zone's painted size,
 *  so the observer watches the SECTION, never the zones (that would be a feedback loop). */
const RESIZE_DEBOUNCE_MS = 150

export function HeroAdaptiveText({
  coverImage,
  coverFocus,
  overlayStyle,
  overlayColor,
}: {
  coverImage: string | null
  coverFocus: string | null
  overlayStyle: HeroOverlayMode
  /** The member's custom overlay color (strict hex) or null for the token default. */
  overlayColor: string | null
}) {
  const ref = useRef<HTMLSpanElement>(null)
  // Theme flips (the .dark class on <html>) change the token values behind the fade/none
  // math, so bump a tick to recompute. Attribute-scoped observer; disconnects on unmount.
  const [themeTick, setThemeTick] = useState(0)
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((t) => t + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const host = ref.current?.closest('section')
    if (!host) return
    let cancelled = false
    // One decode per src, reused across zones AND across resize re-runs. Two zones behind a
    // debounced observer would otherwise mean a decode cycle per frame of a window drag, which
    // cancels out the whole saving of reading the already-cached bytes.
    let decoded: { src: string; source: HeroSampleSource | null } | null = null

    /** Leave a zone with no attributes at all. Absent IS the signal the CSS keys its safe
     *  baseline on, so a failed measurement must remove them, never freeze the last answer. */
    function unmeasure(zone: HTMLElement) {
      delete zone.dataset.mediaTone
      delete zone.dataset.mediaPlate
    }

    async function run(el: HTMLElement) {
      const styles = getComputedStyle(el)
      const tokenLuminance = (name: string, fallback: number): number => {
        const rgb = parseCssColor(styles.getPropertyValue(name))
        return rgb ? relativeLuminance(rgb[0], rgb[1], rgb[2]) : fallback
      }
      // The two text options (the on-media token pair) and the active overlay color.
      const lightTextLuminance = tokenLuminance('--color-on-media-light', 0.83)
      const darkTextLuminance = tokenLuminance('--color-on-media-dark', 0.01)
      const customOverlay = parseCssColor(overlayColor)
      const overlayLuminance = customOverlay
        ? relativeLuminance(customOverlay[0], customOverlay[1], customOverlay[2])
        : overlayStyle === 'fade'
          ? tokenLuminance('--color-canvas', 0.95)
          : tokenLuminance('--color-ink', 0.01)

      // The gradient placeholder PageHero paints when there is no cover.
      const placeholderLuminance = tokenLuminance('--color-surface-elevated', 0.9)

      const zones = Array.from(el.querySelectorAll<HTMLElement>('[data-hero-zone]'))
      if (!zones.length) {
        await runSectionFallback(el, { lightTextLuminance, darkTextLuminance, overlayLuminance }, placeholderLuminance)
        return
      }

      // THE COVER, not "the first image in the section". With no cover PageHero renders a gradient
      // <div> and the `leading` slot's avatar becomes the only <img> here, so a bare
      // querySelector('img') would resolve the whole header from the member's own face. Gate on
      // the PROP; read `currentSrc` off the rendered element so the bytes sampled are the exact
      // srcset entry on screen — same-origin /_next/image, already cached, canvas-readable with no
      // CORS grant and no second full-resolution download.
      const rendered = coverImage ? el.querySelector<HTMLImageElement>('img[data-hero-cover]') : null
      const src = rendered?.currentSrc || rendered?.src || coverImage

      // No cover at all: the backdrop is PageHero's token gradient placeholder, so every zone
      // measures the same single surface tone. Still a real measurement, not a guess.
      let source: HeroSampleSource | null = null
      if (src) {
        if (decoded?.src !== src) decoded = { src, source: await loadSampleSource(src) }
        if (cancelled) return
        source = decoded.source
      }
      const placeholderTiles = src ? null : [placeholderLuminance]

      const width = el.clientWidth || 1200
      const height = el.clientHeight || 280
      const hostBox = { left: 0, top: 0, width, height }
      const hostRect = el.getBoundingClientRect()

      const results = zones.map((zone) => {
        const rect = zone.getBoundingClientRect()
        const region = zoneRegion(
          { left: rect.left - hostRect.left, top: rect.top - hostRect.top, width: rect.width, height: rect.height },
          hostBox,
        )
        const tiles =
          placeholderTiles ??
          (source && region
            ? tileLuminancesFrom(source, { region, containerWidth: width, containerHeight: height, focus: coverFocus })
            : null)
        return {
          zone,
          result: tiles
            ? resolveZoneTone({ tiles, overlayStyle, overlayLuminance, lightTextLuminance, darkTextLuminance })
            : null,
        }
      })
      if (cancelled) return

      // ONE TREATMENT: the header steps to the highest rung any zone asked for.
      const rung = results.reduce((max, r) => (r.result && r.result.plate > max ? r.result.plate : max), 0)
      for (const { zone, result } of results) {
        if (!result) {
          unmeasure(zone)
          continue
        }
        zone.dataset.mediaTone = result.tone
        zone.dataset.mediaPlate = String(rung)
      }

      // The SECTION keeps a tone too, taken from the lockup: on-cover copy that lives outside a
      // zone (a caller's inline error line, a future slot) inherits from here rather than from the
      // light default. The section never carries a plate; plates are local by definition.
      const lockup = results.find((r) => r.zone.dataset.heroZone === 'lockup') ?? results[0]
      if (lockup?.result) el.dataset.mediaTone = lockup.result.tone
      else delete el.dataset.mediaTone
      el.dataset.mediaScrim = 'off'
    }

    /** The pre-zone path, kept live and unchanged in behaviour for a hero that renders no zones
     *  (the `minimal` variant, any caller that has not composed the zone markup). One band, the
     *  p85 statistic, the section-wide .hero-text-scrim. */
    async function runSectionFallback(
      el: HTMLElement,
      tokens: { lightTextLuminance: number; darkTextLuminance: number; overlayLuminance: number },
      placeholderLuminance: number,
    ) {
      const mediaLuminance = coverImage
        ? await sampleCoverRegionLuminance(coverImage, {
            containerWidth: el.clientWidth || 1200,
            containerHeight: el.clientHeight || 280,
            focus: coverFocus,
          })
        : placeholderLuminance
      if (cancelled) return
      if (mediaLuminance === null) {
        const fallback = resolveMediaTone({ mediaLuminance: 0.5, overlayStyle, ...tokens })
        el.dataset.mediaTone = overlayStyle === 'none' ? 'dark' : fallback.tone
        el.dataset.mediaScrim = 'on'
        return
      }
      const result = resolveMediaTone({ mediaLuminance, overlayStyle, ...tokens })
      el.dataset.mediaTone = result.tone
      el.dataset.mediaScrim = result.scrim ? 'on' : 'off'
    }

    void run(host)

    // Boxes move: a rail mounts, a window is dragged, a long name rewraps. The zone geometry IS
    // the measurement, so re-measure. Debounced, and on the SECTION only.
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
              if (!cancelled) void run(host)
            }, RESIZE_DEBOUNCE_MS)
          })
    observer?.observe(host)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      observer?.disconnect()
    }
  }, [coverImage, coverFocus, overlayStyle, overlayColor, themeTick])

  return <span ref={ref} hidden aria-hidden />
}
