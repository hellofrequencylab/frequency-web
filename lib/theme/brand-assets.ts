import { SITE_DESIGN, type DesignId } from '@/lib/theme/design'

// THE BRAND ASSETS, per design system (ADR-1737). The wordmark and the round icon are raster files,
// so no token can restyle them: a design that brings new marks swaps them HERE, by value, and every
// chrome surface that draws the brand (components/layout/wordmark.tsx, brand-mark.tsx) follows.
//
// Keep this module a leaf: it is reachable from components/layout/app-shell.tsx, which
// check:shell-weight budgets, so it imports one constant and holds data only.

export interface BrandAssets {
  wordmark: {
    /** A file under /public. */
    src: string
    /**
     * The asset's real pixel size. next/image reads these as an ASPECT RATIO, not a display size:
     * callers size the mark with `h-* w-auto`, so a wrong pair stretches the letterforms.
     */
    width: number
    height: number
  }
  /** The round app icon (the mark alone), as used by the PWA manifest and structured data. */
  icon: {
    src: string
    size: number
  }
}

/** DAWN's wordmark. `.brandmark` in app/globals.css masks this same file, so it is the CSS default. */
export const DEFAULT_WORDMARK_SRC = '/frequency-wordmark.png'

export const BRAND_ASSETS: Record<DesignId, BrandAssets> = {
  dawn: {
    wordmark: { src: DEFAULT_WORDMARK_SRC, width: 963, height: 130 },
    icon: { src: '/icons/icon-512.png', size: 512 },
  },
  // Frequency's own marks, copied from the export by `pnpm design:install` (ADR-1740). The wordmark's
  // aspect is the export's own (1920 x 389, its .fq-logo aspect-ratio).
  frequency: {
    wordmark: { src: '/brand/frequency/frequency-wordmark.png', width: 1920, height: 389 },
    icon: { src: '/brand/frequency/frequency-icon-round.png', size: 600 },
  },
}

export function brandAssets(design: DesignId = SITE_DESIGN): BrandAssets {
  return BRAND_ASSETS[design] ?? BRAND_ASSETS.dawn
}

/** The assets this deploy wears. SITE_DESIGN is inlined at build, so this is static. */
export const SITE_BRAND: BrandAssets = brandAssets(SITE_DESIGN)

/**
 * The inline override `.brandmark` needs when a design's wordmark is NOT the file the stylesheet
 * already masks. Undefined for DAWN (and for any design still on DAWN's file), so the header's markup
 * is unchanged until a design actually brings a new mark.
 */
export function brandmarkMaskStyle(assets: BrandAssets = SITE_BRAND): Record<string, string> | undefined {
  const { src, width, height } = assets.wordmark
  if (src === DEFAULT_WORDMARK_SRC) return undefined
  const url = `url('${src}')`
  return { WebkitMaskImage: url, maskImage: url, aspectRatio: `${width} / ${height}` }
}
