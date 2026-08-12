import 'server-only'

// Site icons for the Loom picker's Icons view. The house icon system (docs/ICONS.md, ADR-505) ships
// Lucide (primary) + Phosphor + Tabler as BUILD-TIME @iconify-json data. This turns any of those glyphs
// into a self-contained SVG DATA URL, so picking a site icon stores exactly like picking an uploaded
// image (the field always holds a URL) and renders anywhere with no runtime icon dependency.
//
// 🔴 THE ONLY THING ALLOWED TO IMPORT THIS IS app/api/site-icons/route.ts (ADR-1002 follow-up,
// docs/DEPLOY-SAFETY.md rule 2). It statically imports the full collections — ~6.9MB once bundled —
// and Vercel copies every traced file into EVERY function that can reach it. This used to be a
// `'use server'` action imported by components/loom/loom-picker.tsx, and because a server action is
// imported by the CLIENT module, it fanned out with the picker: the universal image popup put 6.87MB
// into 337 serverless functions, 2.3GB, the largest single line in the build's disk budget.
//
// Behind a route handler the data lands in ONE function. The browser side is lib/loom/site-icons-client.ts
// (the contract plus a fetch, nothing heavy); scripts/build-fanout.test.ts fails if a second importer
// appears or if the measured fan-out creeps back.

import { getIconData, iconToSVG } from '@iconify/utils'
import type { IconifyJSON } from '@iconify/types'
import lucideIcons from '@iconify-json/lucide/icons.json'
import phIcons from '@iconify-json/ph/icons.json'
import tablerIcons from '@iconify-json/tabler/icons.json'
import { ICONS } from '@/lib/ui/icon-catalog'
import type { SiteIcon } from '@/lib/loom/site-icons-client'

const COLLECTIONS: Record<string, IconifyJSON> = {
  lucide: lucideIcons as IconifyJSON,
  ph: phIcons as IconifyJSON,
  tabler: tablerIcons as IconifyJSON,
}

// The wire shape lives with the client half so the picker never has to import this module for it,
// not even type-only. Re-exported here so a server-side caller has one import to make.
export type { SiteIcon }

/** Build a standalone SVG data URL for one glyph, or null if the name doesn't resolve. The glyph keeps
 *  `currentColor` (renders as the default ink in an <img>); recolor/tint is a later enhancement. */
function iconDataUrl(prefix: string, iconName: string): string | null {
  const collection = COLLECTIONS[prefix]
  if (!collection) return null
  const data = getIconData(collection, iconName)
  if (!data) return null
  const { attributes, body } = iconToSVG(data, { height: 48 })
  const attrs = Object.entries(attributes)
    .map(([k, v]) => `${k}="${String(v)}"`)
    .join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Split an Iconify name ('lucide:zap') into [prefix, name], defaulting to the house set (lucide). */
function splitName(raw: string): [string, string] {
  const at = raw.indexOf(':')
  return at === -1 ? ['lucide', raw] : [raw.slice(0, at), raw.slice(at + 1)]
}

/**
 * Search the installed site icon sets. With no query, returns the house semantic palette (the meanings
 * the site actually uses, lib/ui/icon-catalog.ts) as a sensible default. With a query, matches glyph
 * names across Lucide → Phosphor → Tabler by substring, capped at `limit`. FAIL-SAFE to [].
 */
export async function searchSiteIcons(query = '', limit = 60): Promise<SiteIcon[]> {
  try {
    const q = query.trim().toLowerCase()
    const out: SiteIcon[] = []
    const seen = new Set<string>()
    const push = (prefix: string, iconName: string) => {
      const key = `${prefix}:${iconName}`
      if (seen.has(key) || out.length >= limit) return
      const dataUrl = iconDataUrl(prefix, iconName)
      if (!dataUrl) return
      seen.add(key)
      out.push({ name: key, label: iconName.replace(/-/g, ' '), dataUrl })
    }

    if (!q) {
      // The curated house palette first — the icons the product already uses by meaning.
      for (const raw of Object.values(ICONS)) {
        const [prefix, iconName] = splitName(String(raw))
        push(prefix, iconName)
        if (out.length >= limit) break
      }
      return out
    }

    // Substring match across the sets, house family (lucide) first.
    for (const prefix of ['lucide', 'ph', 'tabler']) {
      const collection = COLLECTIONS[prefix]
      if (!collection) continue
      for (const iconName of Object.keys(collection.icons)) {
        if (out.length >= limit) break
        if (iconName.includes(q)) push(prefix, iconName)
      }
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
}
