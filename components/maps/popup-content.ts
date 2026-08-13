import type { MapPin } from './types'
import { resolvePinPaint } from '@/lib/maps/pin-kinds'

// THE CARD A PIN OPENS — real DOM nodes, shared by both providers (ADR-1027 extends ADR-901).
//
// 🔴 NODES AND `textContent`, NEVER AN HTML STRING. The old per-map implementations built popup HTML
// and hand-rolled an `escapeHtml` guard, because a pin title is fully attacker-controlled: an event
// titled `<img src=x onerror=…>` would be stored XSS for everyone who opened its popup. Building
// nodes removes the injection surface rather than escaping around it, because there is no HTML parse
// step left to subvert. Every string below goes through `textContent`. The ONE attribute that takes
// caller data is the image `src`, and it is filtered to http(s) first (see `safeImageSrc`).
//
// ── ONE LAYOUT, EVERY KIND ─────────────────────────────────────────────────────────────────────
//
// Owner instruction 2026-08-13: an Event and a Circle at the same venue are two different things and
// both keep their pin, so the card must make it obvious WHICH one you opened, and must not change
// shape between them. So every kind renders the identical stack:
//
//   cover image  ·  pill row  ·  title  ·  the quiet line  ·  the where line  ·  the way in
//
// 🔴 THE KIND PILL IS PAINTED IN THE PIN'S OWN TOKEN. A three-colour legend under a map still leaves
// a member decoding it to know whether the dot they just tapped is a gathering or a group. The pill
// says it in one word AND in the same colour as the dot, so the card and the pin are visibly the
// same object. That is the whole reason `resolvePinPaint` is imported here rather than the label
// being passed in as a string: the colour and the word have to come from one table or they drift.
//
// Colours are the DAWN custom properties directly. Map DOM sits outside Tailwind, but the variables
// cascade from :root, so the card tracks the active theme for free.

/** Popup width. Wide enough for a date line and a street address without wrapping to three rows,
 *  narrow enough to sit inside a phone viewport with the map still readable behind it. */
const CARD_WIDTH_PX = 264
/** Header image height. Close to 16:9 at the card's width, matching the `cover` band on the app's
 *  own browse cards (components/cards/entity-card.tsx) so a map card reads as the same furniture. */
const IMAGE_HEIGHT_PX = 148

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

/** One pill. `token` paints it; omitting the token gives the neutral notice treatment. */
function pill(text: string, token?: string): HTMLSpanElement {
  const el = document.createElement('span')
  el.textContent = text
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'padding:2px 8px',
    'border-radius:9999px',
    'font-size:11px',
    'font-weight:600',
    'line-height:1.45',
    'white-space:nowrap',
    // color-mix keeps the pill on the TOKEN layer: the fill is the pin's own colour at low alpha and
    // the ink is the same colour at full strength, so a new kind needs no new pair of tokens and a
    // theme switch moves both together.
    token
      ? `color:var(${token});background:color-mix(in srgb, var(${token}) 14%, transparent)`
      : 'color:var(--color-text-muted);background:var(--color-surface-elevated)',
  ].join(';')
  return el
}

/** Build the popup card for a pin, or null when the pin carries nothing to show. */
export function buildPopupContent(pin: MapPin): HTMLElement | null {
  const title = pin.title?.trim()
  const subtitle = pin.subtitle?.trim()
  const detail = pin.detail?.trim()
  const notice = pin.badge?.trim()
  const href = pin.href?.trim()
  const imageUrl = safeImageSrc(pin.imageUrl)
  if (!title && !subtitle && !detail && !href) return null

  const paint = resolvePinPaint(pin)
  const root = document.createElement('div')
  root.style.cssText = `width:${CARD_WIDTH_PX}px;max-width:100%`

  // ── Cover ───────────────────────────────────────────────────────────────────────────────────
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
      'border-radius:10px',
      'margin-bottom:8px',
      // The basemap shows through a transparent PNG otherwise, which reads as a broken image rather
      // than a logo.
      'background:var(--color-surface-elevated)',
    ].join(';')
    // A cover that 404s should collapse the band, not leave a broken-image glyph in the card.
    img.addEventListener('error', () => img.remove())
    root.appendChild(img)
  }

  // ── Pill row ────────────────────────────────────────────────────────────────────────────────
  // ABOVE the title, deliberately, and in this order: WHAT it is, then what is qualified about it.
  // A member reads the kind first and the caveat second, which is the order they need them in.
  const pills = document.createElement('div')
  pills.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px'
  pills.appendChild(pill(paint.noun, paint.token))
  if (notice) pills.appendChild(pill(notice))
  root.appendChild(pills)

  if (title) {
    root.appendChild(
      line(title, 'font-weight:700;font-size:14px;color:var(--color-text);line-height:1.3'),
    )
  }
  // The quiet line, then WHERE. Two rows rather than one joined sentence: they answer different
  // questions, and the joined version is the run-on line this card replaced.
  if (subtitle) {
    root.appendChild(line(subtitle, 'font-size:12px;color:var(--color-text-muted);margin-top:3px'))
  }
  if (detail) {
    root.appendChild(line(detail, 'font-size:12px;color:var(--color-text-muted);margin-top:2px'))
  }

  if (href) {
    const a = document.createElement('a')
    a.href = href
    a.textContent = pin.hrefLabel?.trim() || 'Open'
    a.style.cssText =
      'font-size:13px;font-weight:600;color:var(--color-primary-strong);text-decoration:none;display:inline-block;margin-top:8px'
    root.appendChild(a)
  }

  return root
}
