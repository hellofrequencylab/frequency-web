import type { MapPin } from './types'

// Popup bodies as REAL DOM NODES, shared by both providers.
//
// The old per-map implementations built popup HTML strings and hand-rolled an `escapeHtml`
// guard, because a pin title is fully attacker-controlled (an event titled
// `<img src=x onerror=…>` would otherwise be stored XSS for everyone who opened its popup).
// Building nodes and assigning `textContent` removes the injection surface entirely rather
// than escaping around it — there is no HTML parse step to subvert.
//
// Colours come from the DAWN custom properties directly. Map DOM sits outside Tailwind, but
// the variables cascade from :root, so a popup still tracks the active theme.

function line(text: string, style: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = style
  el.textContent = text
  return el
}

/** Build the popup body for a pin, or null when the pin carries nothing to show. */
export function buildPopupContent(pin: MapPin): HTMLElement | null {
  const title = pin.title?.trim()
  const subtitle = pin.subtitle?.trim()
  const href = pin.href?.trim()
  if (!title && !subtitle && !href) return null

  const root = document.createElement('div')

  if (title) root.appendChild(line(title, 'font-weight:600;color:var(--color-text)'))
  if (subtitle) {
    root.appendChild(
      line(subtitle, 'font-size:12px;color:var(--color-text-muted);margin-top:2px'),
    )
  }
  if (href) {
    const a = document.createElement('a')
    a.href = href
    a.textContent = pin.hrefLabel?.trim() || 'Open'
    a.style.cssText =
      'font-size:13px;color:var(--color-primary-strong);text-decoration:none;display:inline-block;margin-top:4px'
    root.appendChild(a)
  }

  return root
}
