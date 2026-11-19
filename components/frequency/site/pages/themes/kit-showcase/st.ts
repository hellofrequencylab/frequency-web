// One CSS declaration string to a React style object. The Theme Kits page is a port of a design written as inline CSS strings
// with per-kit values spliced in, so the port keeps the strings and parses them here once each (cached by string).
import type { CSSProperties } from 'react'

const cache = new Map<string, CSSProperties>()

// Phone pictures (speed, 2026-11-19): every showcase picture under /themes-index has a half-width .sm.webp copy
// (scripts/render/theme-showcase-small.mjs). A declaration naming one picture becomes `var(--ks-u, url(full))` plus
// `--ks-sm: url(phone copy)`; kit-showcase.css sets --ks-u to --ks-sm under 900px, so a phone fetches only the small file and a
// desktop only the full one. The full-size view (`/contain`) always keeps the full file.
const PIC = /url\('(\/themes-index\/[^']+?)(?<!\.sm)\.webp'\)/g

function phonePicture(style: Record<string, string>, value: string): string {
  if (value.includes('/contain')) return value
  const hits = [...value.matchAll(PIC)]
  if (hits.length !== 1) return value
  style['--ks-sm'] = `url('${hits[0][1]}.sm.webp')`
  return value.replace(PIC, (m) => `var(--ks-u,${m})`)
}

function split(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ''
  let cur = ''
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ';' && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

function prop(name: string): string {
  if (name.startsWith('--')) return name
  const n = name.startsWith('-') ? name.slice(1) : name
  const camel = n.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
  return name.startsWith('-webkit-') || name.startsWith('-moz-') ? camel[0].toUpperCase() + camel.slice(1) : camel
}

export function st(css: string): CSSProperties {
  const hit = cache.get(css)
  if (hit) return hit
  const style: Record<string, string> = {}
  for (const decl of split(css)) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const name = decl.slice(0, i).trim()
    const value = decl.slice(i + 1).trim()
    if (!name || !value) continue
    style[prop(name)] = value.includes('/themes-index/') ? phonePicture(style, value) : value
  }
  cache.set(css, style)
  return style
}
