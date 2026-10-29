import photos from './free-human-photos.json'

// THE FREE HUMAN PHOTO LIBRARY (design: photos/selects/manifest.json). The selects under public/sites/free-human/photos, each with its
// size and average colour (free-human-photos.json), which a frame uses as its loading background so it never flashes empty.
// RIGHTS ARE NOT CLEARED (owner ruling 2026-10-29: ship now, clear later): see the ledger row LIVE-1910.

interface FreeHumanPhoto {
  w: number
  h: number
  /** The average colour of the picture, for the frame behind it while it loads. */
  avg: string
}

export const FREE_HUMAN_PHOTOS: Record<string, FreeHumanPhoto> = photos

export function freeHumanPhotoSrc(name: string): string {
  return `/sites/free-human/photos/${name}.webp`
}

export function freeHumanPhoto(name: string): (FreeHumanPhoto & { src: string }) | null {
  const p = FREE_HUMAN_PHOTOS[name]
  return p ? { ...p, src: freeHumanPhotoSrc(name) } : null
}

/** The loading colour behind a picture served from the library (null for an owner's own photo from anywhere else). */
export function freeHumanAvg(src: string): string | null {
  const m = /\/sites\/free-human\/photos\/([a-z0-9-]+)\.webp$/.exec(src)
  return m ? (FREE_HUMAN_PHOTOS[m[1]]?.avg ?? null) : null
}
