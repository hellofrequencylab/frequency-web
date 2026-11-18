// HOW THE CANVAS INSPECTOR READS AND WRITES RICH TEXT AND IMAGES (PROG-E5, item 4). Client safe: no block registry,
// no sanitizer import. The server stays the authority on what is stored (sanitizeBlockContent runs on every save);
// this module only decides what the inspector SHOWS and what it SENDS.
//
// Rich text: a content block's long text is stored as a small allowlist of inline HTML (bold, italic, links, line
// breaks; lib/entity-blocks/block-content.ts sanitizeInlineHtml), with its characters escaped. The inspector never
// shows that markup. It reads the value as runs of words with their marks and draws the marks as formatting, or as
// plain words for editing. What it sends back from a plain edit is the same escaped form, so a save stores words.
//
// Images: an image field holds a URL string or a library reference `{ assetId, url }` (lib/library/asset-ref.ts).
// Either draws from its URL. The reference is never sent: the inspector only sends strings, and the save keeps a
// stored value it was not sent (lib/builder/canvas-document.ts mergeBag), so the library link survives until the
// owner replaces or removes the picture.

import { isAssetRef } from '@/lib/library/asset-ref'

/** One stretch of words with the marks that apply to it. */
interface RichRun {
  text: string
  bold?: true
  italic?: true
  link?: true
}

const ENTITIES: [RegExp, string][] = [[/&lt;/g, '<'], [/&gt;/g, '>'], [/&quot;/g, '"'], [/&#39;/g, "'"], [/&amp;/g, '&']]
const decode = (value: string) => ENTITIES.reduce((text, [pattern, char]) => text.replace(pattern, char), value)
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:"[^"]*"|'[^']*'|[^"'>])*>/g

/** A stored rich value as runs of words and marks. Every tag outside the allowlist is dropped and its words kept,
 *  `<br>` becomes a line break, and entities become their characters. The runs are only ever React text. */
export function richRuns(value: unknown): RichRun[] {
  if (typeof value !== 'string' || !value) return []
  const runs: RichRun[] = []
  const open = { bold: 0, italic: 0, link: 0 }
  const push = (raw: string) => {
    const text = decode(raw)
    if (!text) return
    runs.push({ text, ...(open.bold ? { bold: true as const } : {}), ...(open.italic ? { italic: true as const } : {}), ...(open.link ? { link: true as const } : {}) })
  }
  let last = 0
  for (const match of value.matchAll(TAG)) {
    push(value.slice(last, match.index))
    last = match.index + match[0].length
    const name = match[2].toLowerCase()
    const step = match[1] === '/' ? -1 : 1
    if (name === 'br') { if (step > 0) push('\n'); continue }
    const mark = name === 'b' || name === 'strong' ? 'bold' : name === 'i' || name === 'em' ? 'italic' : name === 'a' ? 'link' : null
    if (mark) open[mark] = Math.max(0, open[mark] + step)
  }
  push(value.slice(last))
  return runs
}

/** The words of a stored rich value, without any markup. */
export function richWords(value: unknown): string {
  return richRuns(value).map((run) => run.text).join('')
}

/** Whether a stored rich value carries formatting (bold, italic or a link) a plain edit would drop. */
export function richHasMarks(value: unknown): boolean {
  return richRuns(value).some((run) => run.bold || run.italic || run.link)
}

/** Plain words as the stored rich form: characters escaped, line breaks as `<br>`. */
export function plainToRich(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r?\n/g, '<br>')
}

/** What an image field draws: a URL the inspector may load (https or a path on this site), whether it is held in
 *  the library, and the library's alt text when there is one. */
export function inspectorImage(value: unknown): { src: string | null; library: boolean; alt: string } {
  const library = isAssetRef(value)
  const raw = library ? value.url : typeof value === 'string' ? value : ''
  const url = raw.trim()
  const src = /^https:\/\/[^\s]+$/i.test(url) || /^\/(?!\/)[^\s]*$/.test(url) ? url : null
  return { src, library, alt: library && typeof value.alt === 'string' ? value.alt : '' }
}

/** The text an image field's address box shows: the URL, whether it is typed or held by a library reference. */
export function imageAddress(value: unknown): string {
  return isAssetRef(value) ? value.url : typeof value === 'string' ? value : ''
}
