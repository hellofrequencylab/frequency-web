import type { MapPin } from './types'
import { MAP_PIN_KINDS, resolvePinPaint } from '@/lib/maps/pin-kinds'

// THE CARD A PIN OPENS — real DOM nodes, shared by both providers (ADR-1027 extends ADR-901).
//
// 🔴 NODES AND `textContent`, NEVER AN HTML STRING. The old per-map implementations built popup HTML
// and hand-rolled an `escapeHtml` guard, because a pin title is fully attacker-controlled: an event
// titled `<img src=x onerror=…>` would be stored XSS for everyone who opened its popup. Building
// nodes removes the injection surface rather than escaping around it, because there is no HTML parse
// step left to subvert. Every string below goes through `textContent`. The ONE attribute that takes
// caller data is the image `src`, and it is filtered to http(s) first (see `safeImageSrc`).
//
// ── IT IS THE /events CARD, SHRUNK ────────────────────────────────────────────────────────────
//
// Owner instruction 2026-08-13: "make the cards look closer to the events cards". So the stack here
// is the SAME ORDER as components/events/event-card.tsx on /events, because a member who has browsed
// that grid already knows how to read it:
//
//   cover  ·  title  ·  when  ·  pills  ·  📍 where
//
// 🔴 THE PILLS MOVED BELOW THE TITLE, reversing my first pass. I had put them on top, arguing a
// member should read what the dot IS before reading its address. That argument is fine in isolation
// and wrong in context: /events puts "Public" and "Part of a series" under the time, and a card that
// leads with a pill reads as a different component rather than the same one. Consistency with the
// grid the member already knows beats a local optimisation.
//
// ── ONE LAYOUT, EVERY KIND ─────────────────────────────────────────────────────────────────────
//
// Owner instruction 2026-08-13: an Event and a Circle at the same venue are two different things and
// both keep their pin, so the card must make it obvious WHICH one you opened, and must not change
// shape between them. So every kind renders the identical stack:
//
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

function line(text: string, style: string, className?: string): HTMLDivElement {
  const el = document.createElement('div')
  if (className) el.className = className
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
  // Class hooks for the Frequency card (SCAN-918, app/themes/frequency/members-ui.css): the cover runs
  // edge to edge at the top under the close button, the body is padded, and every colour takes the
  // kit's surface and text tokens in light and dark. DAWN has no rules for them and renders as before.
  root.className = imageUrl ? 'fqm-card' : 'fqm-card fqm-card--plain'
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
    img.className = 'fqm-card__cover'
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
    img.addEventListener('error', () => {
      img.remove()
      root.classList.add('fqm-card--plain')
    })
    root.appendChild(img)
  }

  // Everything under the cover. A wrapper with no style of its own, so DAWN's card is unchanged; the
  // Frequency sheet pads it so the cover can run edge to edge.
  const body = document.createElement('div')
  body.className = 'fqm-card__body'
  root.appendChild(body)

  if (title) {
    body.appendChild(
      line(title, 'font-weight:700;font-size:14px;color:var(--color-text);line-height:1.3', 'fqm-card__title'),
    )
  }
  // WHEN, directly under the title, exactly where /events puts its time line.
  if (subtitle) {
    body.appendChild(line(subtitle, 'font-size:12px;color:var(--color-text-muted);margin-top:3px', 'fqm-card__meta'))
  }

  // ── Pill row ────────────────────────────────────────────────────────────────────────────────
  // Under the time, over the address: the /events card's order. Kind first, then the caveat — what
  // it is, then what is qualified about it.
  const pills = document.createElement('div')
  pills.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px'
  pills.appendChild(pill(paint.noun, paint.token))
  if (notice) pills.appendChild(pill(notice))
  body.appendChild(pills)

  // WHERE, with the same pin glyph /events uses, so the two read as one family.
  if (detail) {
    const where = document.createElement('div')
    where.className = 'fqm-card__meta'
    where.style.cssText =
      'display:flex;align-items:flex-start;gap:4px;font-size:12px;color:var(--color-text-muted);margin-top:6px'
    const glyph = document.createElement('span')
    // Decorative: the line beside it already says this is a place, and a screen reader announcing
    // "round pushpin" before every address is noise.
    glyph.setAttribute('aria-hidden', 'true')
    glyph.textContent = '\u{1F4CD}'
    glyph.style.cssText = 'flex:none;line-height:1.35;font-size:11px'
    const text = document.createElement('span')
    text.textContent = detail
    text.style.cssText = 'min-width:0;line-height:1.35'
    where.append(glyph, text)
    body.appendChild(where)
  }

  if (href) {
    const a = document.createElement('a')
    a.className = 'fqm-card__link'
    a.href = href
    a.textContent = pin.hrefLabel?.trim() || 'Open'
    a.style.cssText =
      'font-size:13px;font-weight:600;color:var(--color-primary-strong);text-decoration:none;display:inline-block;margin-top:8px'
    body.appendChild(a)
  }

  return root
}

/** The pin fields the area list reads. */
type AreaPin = Pick<MapPin, 'kind' | 'place' | 'title' | 'label'>

/**
 * The heading of a "general area" list (SCAN-918): "93 events around Encinitas". Pins that share one
 * exact coordinate are a city-centre fallback, so the honest thing to say is the town, not a spot.
 * The noun is the layer's own plural when every pin is one kind, else "places"; the town is the one
 * most of them name (first named wins a tie), else "here". Plain words, no em dash.
 */
export function areaHeadline(points: readonly AreaPin[]): string {
  const n = points.length
  const kinds = new Set(points.map((p) => p.kind ?? 'place'))
  const only = kinds.size === 1 ? [...kinds][0]! : 'place'
  const noun = n === 1 ? MAP_PIN_KINDS[only].noun.toLowerCase() : MAP_PIN_KINDS[only].legend.toLowerCase()
  const tally = new Map<string, number>()
  for (const p of points) {
    const place = p.place?.trim()
    if (place) tally.set(place, (tally.get(place) ?? 0) + 1)
  }
  let town: string | null = null
  let best = 0
  for (const [place, count] of tally) {
    if (count > best) {
      town = place
      best = count
    }
  }
  return town ? `${n} ${noun} around ${town}` : `${n} ${noun} here`
}

/** The accessible name of an area badge: the headline, and what a tap does. */
export function areaAccessibleLabel(points: readonly AreaPin[]): string {
  return `${areaHeadline(points)}. Open the list.`
}

/**
 * The card a "general area" badge opens (SCAN-918): the headline, then one row per pin with its title
 * and when, each linking to the pin's page. A caller that owns its card (`onPick`) gets buttons that
 * hand it the pin instead. Nodes and `textContent` only, like the pin card above.
 */
export function buildAreaPopupContent(points: readonly MapPin[], onPick?: (pin: MapPin) => void): HTMLElement {
  const root = document.createElement('div')
  root.className = 'fqm-card fqm-card--plain fqm-card--area'
  root.style.cssText = `width:${CARD_WIDTH_PX}px;max-width:100%`
  const body = document.createElement('div')
  body.className = 'fqm-card__body'
  root.appendChild(body)
  body.appendChild(
    line(areaHeadline(points), 'font-weight:700;font-size:14px;color:var(--color-text);line-height:1.3', 'fqm-card__title'),
  )
  body.appendChild(
    line(
      'They share a town centre, not exact spots.',
      'font-size:12px;color:var(--color-text-muted);margin-top:3px',
      'fqm-card__meta',
    ),
  )

  const list = document.createElement('ul')
  list.className = 'fqm-card__list'
  list.style.cssText = 'list-style:none;margin:8px 0 0;padding:0;max-height:240px;overflow-y:auto'
  for (const pin of points) {
    const title = pin.title?.trim() || pin.label?.trim()
    if (!title) continue
    const li = document.createElement('li')
    const href = pin.href?.trim()
    // A link to the pin's page; a button when the caller owns the card; plain text when there is neither.
    const row = onPick ? document.createElement('button') : href ? document.createElement('a') : document.createElement('div')
    row.className = 'fqm-card__row'
    row.style.cssText =
      'display:block;width:100%;text-align:left;padding:6px 0;border:0;background:none;color:inherit;text-decoration:none;cursor:pointer'
    if (row instanceof HTMLAnchorElement) row.href = href!
    else if (row instanceof HTMLButtonElement && onPick) {
      row.type = 'button'
      row.addEventListener('click', () => onPick(pin))
    }
    row.appendChild(line(title, 'font-weight:600;font-size:13px;color:var(--color-text);line-height:1.3', 'fqm-card__row-title'))
    const when = pin.subtitle?.trim()
    if (when) row.appendChild(line(when, 'font-size:12px;color:var(--color-text-muted)', 'fqm-card__meta'))
    li.appendChild(row)
    list.appendChild(li)
  }
  body.appendChild(list)
  return root
}
