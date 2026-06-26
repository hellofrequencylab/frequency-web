// Associate posted images with a classified listing / event. In a media-included
// export, people post a photo (or three) right next to the text that describes it —
// "Sunny room, $1200" followed by two room photos, or an event flyer with a one-line
// caption. The classifier reads the TEXT; this pure step gathers the IMAGE filenames
// that belong with each item, by adjacency + same author, so the dry run can show the
// listing with its photos and the writer can attach them. No I/O — unit-tested.

import type { ClassifiedItem, WhatsAppMessage } from './types'

// Only still images become listing photos / flyers (skip audio, video, pdf, vcf).
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i

export interface GatherOptions {
  /** How many messages on each side of the item's own messages to sweep for photos. */
  window?: number
  /** Cap the images attached to any one item. */
  cap?: number
}

/**
 * Filenames of the images that belong with `item`: any image attachment within
 * `window` messages of the item's own messages, posted by one of the item's authors.
 * Order-preserving and deduped. Same-author keeps a neighbour's unrelated photo from
 * bleeding in; the window keeps a multi-photo post together.
 */
export function gatherImageNames(
  messages: WhatsAppMessage[],
  item: Pick<ClassifiedItem, 'refs'>,
  opts: GatherOptions = {},
): string[] {
  const window = opts.window ?? 5
  const cap = opts.cap ?? 12

  const indexByRef = new Map<number, number>()
  messages.forEach((m, i) => indexByRef.set(m.ref, i))

  const idxs = item.refs
    .map((r) => indexByRef.get(r))
    .filter((x): x is number => x !== undefined)
  if (idxs.length === 0) return []

  const lo = Math.max(0, Math.min(...idxs) - window)
  const hi = Math.min(messages.length - 1, Math.max(...idxs) + window)
  const authors = new Set(idxs.map((i) => messages[i].author).filter(Boolean))

  const names: string[] = []
  for (let j = lo; j <= hi && names.length < cap; j++) {
    const m = messages[j]
    if (!m.attachmentName || !IMAGE_EXT.test(m.attachmentName)) continue
    // When the item's author is known, only take that author's photos; if the item
    // somehow has no author, fall through and take adjacent photos regardless.
    if (authors.size > 0 && m.author && !authors.has(m.author)) continue
    if (!names.includes(m.attachmentName)) names.push(m.attachmentName)
  }
  return names
}
