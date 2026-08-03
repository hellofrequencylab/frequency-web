import React from 'react'

/**
 * Glyph — a React-owned Lucide icon.
 *
 * Why this exists: `lucide.createIcons()` REPLACES an `<i data-lucide>` node with a
 * fresh `<svg>`. When React created that `<i>`, the next re-render tries to remove a
 * node that no longer exists and the whole tree unmounts. So no component in this
 * system may render `<i data-lucide>` — we read Lucide's icon DATA and render our
 * own SVG, which React owns end to end.
 *
 * The page only needs `<script src="…/lucide.min.js">` present. If it is missing, or
 * the name is unknown, Glyph renders an empty box of the right size rather than
 * throwing — an icon is never worth a blank screen.
 */
export function Glyph({ name, size = 16, stroke = 2, className = '', style, ...rest }) {
  const inner = React.useMemo(() => {
    const L = typeof window !== 'undefined' ? window.lucide : null
    if (!L || !L.icons || !name) return ''
    const key = String(name).split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('')
    const node = L.icons[key]
    if (!node) return ''
    // Lucide ships nodes as either `[tag, attrs, children]` triples or
    // `{tag, attrs, children}` objects, depending on version. Handle both.
    const kids = Array.isArray(node)
      ? (typeof node[0] === 'string' ? (Array.isArray(node[2]) ? node[2] : []) : node)
      : (Array.isArray(node.children) ? node.children : [])
    const ser = (p) => {
      if (!p) return ''
      const tag = Array.isArray(p) ? p[0] : p.tag
      if (typeof tag !== 'string') return ''
      const attrs = (Array.isArray(p) ? p[1] : p.attrs) || {}
      const sub = Array.isArray(p) && Array.isArray(p[2]) ? p[2] : (p.children || [])
      const a = Object.keys(attrs)
        .filter((k) => /^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(k) && attrs[k] != null && typeof attrs[k] !== 'object')
        .map((k) => `${k}="${String(attrs[k]).replace(/"/g, '&quot;')}"`).join(' ')
      const open = `<${tag}${a ? ' ' + a : ''}`
      return sub.length ? `${open}>${sub.map(ser).join('')}</${tag}>` : `${open}/>`
    }
    return kids.map(ser).join('')
  }, [name])
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0, ...style, width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: inner }} {...rest} />
  )
}
