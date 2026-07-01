// Strict allowlist validator for AI-generated SVG before it is stored or rendered via
// dangerouslySetInnerHTML. This is defense-in-depth: Vera is prompted to emit only flat
// shapes + DAWN token classes, but generated markup is semi-trusted, so we FAIL CLOSED —
// any disallowed tag/attribute/pattern rejects the whole SVG rather than trying to "clean"
// it. Runs on the server (no DOM), so it is a careful string/regex scan. See docs/LIBRARY.md.

const ALLOWED_TAGS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'title',
])

const MAX_BYTES = 24_000

export type SvgCheck = { ok: true; svg: string } | { ok: false; error: string }

/** Pull the first <svg>…</svg> out of a model response (it may wrap it in prose or fences). */
export function extractSvg(raw: string): string | null {
  const m = raw.match(/<svg[\s\S]*?<\/svg>/i)
  return m ? m[0].trim() : null
}

/**
 * Validate an SVG string against the allowlist. Returns the trimmed SVG when safe, or an
 * error. Rejects scripts, event handlers, external/href refs, styles, entities, and any tag
 * outside the shape/structure allowlist.
 */
export function sanitizeSvg(input: string): SvgCheck {
  const svg = (extractSvg(input) ?? input).trim()

  if (!svg.toLowerCase().startsWith('<svg')) return { ok: false, error: 'Not an SVG.' }
  if (svg.length > MAX_BYTES) return { ok: false, error: 'SVG is too large.' }
  if (!/<\/svg>\s*$/i.test(svg)) return { ok: false, error: 'Malformed SVG.' }

  // Hard-reject dangerous constructs anywhere in the string.
  const banned: [RegExp, string][] = [
    [/<\s*script/i, 'script tag'],
    [/<\s*foreignobject/i, 'foreignObject'],
    [/<\s*image/i, 'image tag'],
    [/<\s*use\b/i, 'use tag'],
    [/<\s*a\b/i, 'anchor tag'],
    [/<\s*style/i, 'style tag'],
    [/<\s*animate/i, 'animation tag'],
    [/<!/, 'doctype/entity'],
    [/<\?(?!xml)/i, 'processing instruction'],
    [/\son[a-z]+\s*=/i, 'event handler attribute'],
    [/(?:xlink:)?href\s*=/i, 'href reference'],
    [/\bstyle\s*=/i, 'inline style attribute'],
    [/\bsrc\s*=/i, 'src attribute'],
    [/javascript:/i, 'javascript: url'],
    [/url\s*\(/i, 'css url()'],
    [/&#/, 'numeric entity'],
  ]
  for (const [re, what] of banned) {
    if (re.test(svg)) return { ok: false, error: `Rejected: ${what}.` }
  }

  // Every tag must be in the allowlist.
  const tagRe = /<\/?\s*([a-zA-Z][\w:-]*)/g
  let match: RegExpExecArray | null
  while ((match = tagRe.exec(svg)) !== null) {
    const tag = match[1].toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return { ok: false, error: `Rejected tag: <${tag}>.` }
  }

  return { ok: true, svg }
}
