import type { MapPin } from './types'

// THE CARD A PIN OPENS — real DOM nodes, shared by both providers (ADR-1027 extends ADR-901).
//
// 🔴 NODES AND `textContent`, NEVER AN HTML STRING. The old per-map implementations built popup HTML
// and hand-rolled an `escapeHtml` guard, because a pin title is fully attacker-controlled: an event
// titled `<img src=x onerror=…>` would be stored XSS for everyone who opened its popup. Building
// nodes removes the injection surface rather than escaping around it, because there is no HTML parse
// step left to subvert. Every string below goes through `textContent`. The ONE attribute that takes
// caller data is the image `src`, and it is filtered to http(s) first (see `safeImageSrc`).
//
// ── WHY THIS IS A CARD NOW ─────────────────────────────────────────────────────────────────────
//
// It was three stacked lines. The owner asked for "a card with event info and header image", and the
// reason it is worth the pixels is that a pin popup is the ONLY place a member meets an event on
// this page: the map is full width, above the feed, and a dot with a title is not enough to decide
// whether to go. So: cover image, a pill when the location is qualified, the title, when it is, where
// it is, and the way in.
//
// Colours are the DAWN custom properties directly. Map DOM sits outside Tailwind, but the variables
// cascade from :root, so the card tracks the active theme for free.

/** Popup width. Wide enough for a date line and a street address without wrapping to three rows,
 *  narrow enough to sit inside a phone viewport with the map still readable behind it. */
const CARD_WIDTH_PX = 260
/** Header image height. A 16:9-ish band: enough to read the photo, not so much that the text is
 *  pushed under the fold of a small popup. */
const IMAGE_HEIGHT_PX = 120

function line(text: string, style: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = style
  el.textContent = text
  return el
}

/**
 * Only http(s) URLs reach an `src`.
 *
 * 🔴 THE ONE ATTRIBUTE IN THIS FILE THAT TAKES CALLER DATA. `javascript:` and `data:` in an image
 * src are the classic ways a "just an image URL" field becomes script execution, and a cover path
 * ultimately traces back to something a member uploaded or an importer wrote. Anything that is not
 * plainly http(s) renders NO image rather than an unchecked one: a missing header is a cosmetic
 * loss, and the alternative is not.
 */
function safeImageSrc(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed, 'https://invalid.example')
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null
  } catch {
    return null
  }
}

/** Build the popup card for a pin, or null when the pin carries nothing to show. */
export function buildPopupContent(pin: MapPin): HTMLElement | null {
  const title = pin.title?.trim()
  const subtitle = pin.subtitle?.trim()
  const detail = pin.detail?.trim()
  const badge = pin.badge?.trim()
  const href = pin.href?.trim()
  const imageUrl = safeImageSrc(pin.imageUrl)
  if (!title && !subtitle && !detail && !href) return null

  const root = document.createElement('div')
  root.style.cssText = `width:${CARD_WIDTH_PX}px;max-width:100%`

  // ── Header image ────────────────────────────────────────────────────────────────────────────
  if (imageUrl) {
    const img = document.createElement('img')
    img.src = imageUrl
    // Decorative: the title directly beneath says the same thing, so announcing the cover twice is
    // noise to a screen reader. Empty alt is the correct way to say "skip this".
    img.alt = ''
    // setAttribute, not the property: the property does not reflect to the attribute in every DOM
    // implementation, and the attribute is what both the browser and the test can see.
    img.setAttribute('loading', 'lazy')
    img.setAttribute('decoding', 'async')
    img.style.cssText = [
      'display:block',
      'width:100%',
      `height:${IMAGE_HEIGHT_PX}px`,
      'object-fit:cover',
      'border-radius:8px',
      'margin-bottom:8px',
      // The map's own basemap shows through a transparent PNG otherwise, which reads as a broken
      // image rather than a logo.
      'background:var(--color-surface-elevated)',
    ].join(';')
    // A cover that 404s should collapse the band, not leave a broken-image glyph in the card.
    img.addEventListener('error', () => img.remove())
    root.appendChild(img)
  }

  // ── Pill ────────────────────────────────────────────────────────────────────────────────────
  // ABOVE the title, deliberately. It qualifies the dot the member just tapped, so it has to be read
  // before the address underneath rather than discovered after it.
  if (badge) {
    const pill = document.createElement('span')
    pill.textContent = badge
    pill.style.cssText = [
      'display:inline-block',
      'padding:2px 8px',
      'margin-bottom:4px',
      'border-radius:9999px',
      'font-size:11px',
      'font-weight:600',
      'line-height:1.4',
      'color:var(--color-primary-strong)',
      'background:var(--color-primary-bg)',
    ].join(';')
    root.appendChild(pill)
  }

  if (title) {
    root.appendChild(line(title, 'font-weight:600;color:var(--color-text);line-height:1.3'))
  }
  // WHEN, then WHERE. Two rows rather than one joined sentence: they answer different questions and
  // the joined version is what produced the run-on line this card replaced.
  if (subtitle) {
    root.appendChild(line(subtitle, 'font-size:12px;color:var(--color-text-muted);margin-top:2px'))
  }
  if (detail) {
    root.appendChild(line(detail, 'font-size:12px;color:var(--color-text-muted);margin-top:2px'))
  }

  if (href) {
    const a = document.createElement('a')
    a.href = href
    a.textContent = pin.hrefLabel?.trim() || 'Open'
    a.style.cssText =
      'font-size:13px;font-weight:600;color:var(--color-primary-strong);text-decoration:none;display:inline-block;margin-top:6px'
    root.appendChild(a)
  }

  return root
}
