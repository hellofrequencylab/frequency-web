// Where a Honey (Free Human) library photo is served from. Kept apart from the photo table so a reader that needs only the
// path (the Create a Space preview) never loads the JSON.

/** A library name to its file: an `fq-` name is a Frequency photo (public/brand/frequency/photos, served as it is), any other is
 *  one of the theme's own honey-light shots. */
export function freeHumanPhotoSrc(name: string): string {
  return name.startsWith('fq-') ? `/brand/frequency/photos/${name.slice(3)}.jpg` : `/sites/free-human/photos/${name}.webp`
}
