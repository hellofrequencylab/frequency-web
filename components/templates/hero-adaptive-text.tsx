'use client'

import { useEffect, useRef, useState } from 'react'
import {
  parseCssColor,
  relativeLuminance,
  resolveMediaTone,
  sampleCoverRegionLuminance,
  type HeroOverlayMode,
} from '@/lib/images/hero-contrast'

// The content-aware hero SENSOR (ADR-830) — an invisible probe PageHero mounts when
// `adaptiveText` is on. It samples the cover pixels behind the text block (factoring the
// active overlay mode/color), then stamps the hero <section> with:
//
//   data-media-tone  — 'dark' (light copy) | 'light' (dark copy); drives --color-on-media
//   data-media-scrim — 'on' when even the better tone misses the readability floor, which
//                      fades in the token-based .hero-text-scrim gradient
//
// The CSS side lives in globals.css (.hero-adaptive-text). Server-rendered copy starts on
// the light-text default (the safe read over the shadow overlay and most photos); this
// corrects it right after hydration and RE-RUNS whenever the cover, focal point, or overlay
// props change — the profile rail's edits revalidate the page, so a new photo / focus drag /
// overlay switch flows straight back through here. A theme flip re-runs it too (the fade
// overlay's default color is the canvas token, which changes with the mode).

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

      // The pixels behind the lockup — or the gradient placeholder's surface tone when the
      // profile has no cover yet.
      const mediaLuminance = coverImage
        ? await sampleCoverRegionLuminance(coverImage, {
            containerWidth: el.clientWidth || 1200,
            containerHeight: el.clientHeight || 280,
            focus: coverFocus,
          })
        : tokenLuminance('--color-surface-elevated', 0.9)
      if (cancelled) return

      if (mediaLuminance === null) {
        // Sampling failed (no CORS grant on the image host, decode error). Fall back to the
        // overlay-only read and keep the scrim on so readability is guaranteed regardless.
        const fallback = resolveMediaTone({
          mediaLuminance: 0.5,
          overlayStyle,
          overlayLuminance,
          lightTextLuminance,
          darkTextLuminance,
        })
        el.dataset.mediaTone = overlayStyle === 'none' ? 'dark' : fallback.tone
        el.dataset.mediaScrim = 'on'
        return
      }

      const result = resolveMediaTone({
        mediaLuminance,
        overlayStyle,
        overlayLuminance,
        lightTextLuminance,
        darkTextLuminance,
      })
      el.dataset.mediaTone = result.tone
      el.dataset.mediaScrim = result.scrim ? 'on' : 'off'
    }

    void run(host)
    return () => {
      cancelled = true
    }
  }, [coverImage, coverFocus, overlayStyle, overlayColor, themeTick])

  return <span ref={ref} hidden aria-hidden />
}
