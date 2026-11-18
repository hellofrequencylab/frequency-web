import photos from './free-human-photos.json'
import { freeHumanPhotoSrc } from './free-human-photo-src'

// THE FREE HUMAN PHOTO LIBRARY (design: photos/selects/manifest.json). The selects under public/sites/free-human/photos, each with its
// size and average colour (free-human-photos.json), which a frame uses as its loading background so it never flashes empty.
// 2026-11-18 (owner: "Use photos from Frequency for Free Human Movement. Change the theme name to honey and keep a few of the honey
// shots."): the library is Frequency's own photos (fq-*, from public/brand/frequency/photos) plus five honey-light shots (light-*).

interface FreeHumanPhoto {
  w: number
  h: number
  /** The average colour of the picture, for the frame behind it while it loads. */
  avg: string
}

export const FREE_HUMAN_PHOTOS: Record<string, FreeHumanPhoto> = photos

export { freeHumanPhotoSrc }

export function freeHumanPhoto(name: string): (FreeHumanPhoto & { src: string }) | null {
  const p = FREE_HUMAN_PHOTOS[name]
  return p ? { ...p, src: freeHumanPhotoSrc(name) } : null
}

/** The loading colour behind a picture served from the library (null for an owner's own photo from anywhere else). */
export function freeHumanAvg(src: string): string | null {
  const m = /\/sites\/free-human\/photos\/([a-z0-9-]+)\.webp$/.exec(src) ?? /\/brand\/frequency\/photos\/([a-z0-9-]+)\.jpg$/.exec(src)
  if (!m) return null
  return (FREE_HUMAN_PHOTOS[m[1]] ?? FREE_HUMAN_PHOTOS[`fq-${m[1]}`])?.avg ?? null
}
