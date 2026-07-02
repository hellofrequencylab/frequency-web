// The Loom — rendition + crop-frame presets. Pure config (no IO), shared by the ingest
// pipeline, the on-the-fly transform resolver, and the Filerobot editor. Defining these in
// one place keeps "one master, many renditions" consistent everywhere. See docs/LIBRARY.md.

import type { LibraryRenditionKind } from './types'

/** The standard rendition set produced/served for every image. `source` is the untouched
 *  master; the rest are width-capped, format-negotiated derivatives. `custom` is reserved
 *  for editor-produced crops and is not part of the standard set. Transforms are on-the-fly
 *  (a width + format request against the master), so these are targets, not pre-baked sizes. */
export const RENDITION_PRESETS: Record<
  Exclude<LibraryRenditionKind, 'custom'>,
  { maxWidth: number | null; description: string }
> = {
  thumb: { maxWidth: 160, description: 'Tiny grid/list thumbnail' },
  grid: { maxWidth: 480, description: 'Browser gallery card' },
  hero: { maxWidth: 1600, description: 'Full-width page image' },
  og: { maxWidth: 1200, description: 'Social / OpenGraph card (1.91:1)' },
  source: { maxWidth: null, description: 'The untouched original master' },
}

/** Crop frames offered in the editor. `ratio` null = freeform. Covers the ratios the media
 *  blocks and social cards actually use, so a crop maps straight onto a rendition slot. */
export const CROP_FRAMES = [
  { key: 'free', label: 'Freeform', ratio: null },
  { key: 'square', label: 'Square (1:1)', ratio: 1 },
  { key: 'portrait', label: 'Portrait (4:5)', ratio: 4 / 5 },
  { key: 'landscape', label: 'Landscape (16:9)', ratio: 16 / 9 },
  { key: 'story', label: 'Story (9:16)', ratio: 9 / 16 },
  { key: 'og', label: 'Social (1.91:1)', ratio: 1.91 },
] as const
