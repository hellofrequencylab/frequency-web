import { getIconData, iconToSVG } from '@iconify/utils'
import type { IconifyJSON } from '@iconify/types'
import phIcons from '@iconify-json/ph/icons.json'
import tablerIcons from '@iconify-json/tabler/icons.json'

// The house Icon primitive (docs/ICONS.md, ADR-505). Renders any installed Iconify set by name as
// INLINE SVG on the server, via @iconify/utils — the same way Lucide emits inline SVG, so it drops
// into a Server Component with no client boundary and ships zero icon JS to the browser (only the
// rendered <svg> markup for the icons actually used). Phosphor (`ph`) is the house family; Tabler
// (`tabler`) is the coverage escape hatch. Reference icons by MEANING through lib/ui/icon-catalog.ts
// (`icon('energy')`), not by raw name, so the house family stays swappable.
//
// RSC-FIRST: this statically imports the full `ph` + `tabler` collections, so it belongs in Server
// Components. Do NOT import it into a `'use client'` module — that would bundle the whole collection
// JSON into client JS. The client-side path (per-icon build-time tree-shaking) is a later phase
// (docs/ICONS.md §Migration).
//
// SECURITY: `body` passed to dangerouslySetInnerHTML comes ONLY from the resolved, build-time icon
// data in the installed @iconify-json packages — never from `name` or any caller input. An unknown
// `name` resolves to null and renders nothing, so there is no injection surface (js/html-injection).

const COLLECTIONS: Record<string, IconifyJSON> = {
  ph: phIcons as IconifyJSON,
  tabler: tablerIcons as IconifyJSON,
}

export interface IconProps {
  /** "prefix:icon-name", e.g. "ph:flower-lotus". Prefer icon('key') from the semantic catalog. */
  name: string
  /** CSS size (default '1em' so it inherits the text size). A `size-*` class overrides this. */
  size?: number | string
  className?: string
  /** When set, the icon is announced to assistive tech; otherwise it is decorative (aria-hidden). */
  'aria-label'?: string
  /** Optional <title> for tooltip/SVG accessibility. Escaped. */
  title?: string
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&#39;',
  )
}

/** An icon rendered as inline SVG. Fail-safe: an unknown set/name renders nothing. */
export function Icon({ name, size = '1em', className, title, ...rest }: IconProps) {
  const label = rest['aria-label']
  const colonAt = name.indexOf(':')
  const prefix = colonAt === -1 ? '' : name.slice(0, colonAt)
  const iconName = colonAt === -1 ? name : name.slice(colonAt + 1)
  const collection = COLLECTIONS[prefix]
  const data = collection ? getIconData(collection, iconName) : null
  if (!data) return null

  const dims = typeof size === 'number' ? `${size}px` : size
  const { attributes, body } = iconToSVG(data, { height: dims })
  const inner = (title ? `<title>${escapeXml(title)}</title>` : '') + body

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
      className={className}
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true, focusable: false })}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  )
}
