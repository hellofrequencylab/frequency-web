import type { TuneField } from '@/lib/builder/tune'

// THE CANVAS PARTS (BLD-104; spec docs/EDITOR-NEXT.md#bld-104). A click on a picture in the canvas opens the
// picture's own field in Tune, the media picker with its focal point beside it, instead of a second picker on
// the canvas. These two pure lookups say which field that is: the one whose stored value is the picture that was
// clicked, and the focal field that crops it.

/** The forms a stored picture takes once it is on the page: as stored, URL-decoded, or behind the image proxy. */
function srcForms(src: string): string[] {
  const forms = new Set([src])
  try { forms.add(decodeURIComponent(src)) } catch { /* a malformed escape: the raw form still counts */ }
  try {
    const proxied = new URL(src, 'https://x.invalid').searchParams.get('url')
    if (proxied) forms.add(proxied)
  } catch { /* not a URL: the raw form still counts */ }
  return [...forms]
}

/** The Tune field holding the clicked picture: a field whose value is that picture, else the first picture field. */
export function pictureFieldFor(fields: readonly TuneField[], props: Record<string, unknown>, src: string): TuneField | null {
  const forms = srcForms(src)
  const pictures = fields.filter((f) => f.kind === 'custom')
  const match = pictures.find((f) => {
    const value = props[f.key]
    return typeof value === 'string' && value.length > 0 && forms.some((form) => form === value || form.endsWith(value) || value.endsWith(form))
  })
  return match ?? pictures[0] ?? null
}

/** The focal field that crops a picture field: `focal` beside `image`, or `<key>Focal` beside `<key>`. */
export function focalFieldFor(fields: readonly TuneField[], picture: string): TuneField | null {
  return fields.find((f) => f.key === `${picture}Focal`) ?? fields.find((f) => f.key === 'focal') ?? null
}
