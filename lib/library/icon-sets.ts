import phInfo from '@iconify-json/ph/info.json'
import tablerInfo from '@iconify-json/tabler/info.json'

// The Loom icon-set registry (docs/ICONS.md §Loom, ADR-505). Indexes the INSTALLED @iconify-json sets
// read-only, the same discipline as the element registry (lib/library/element-registry.tsx: code is
// source of truth, The Loom indexes it). It surfaces each set's LICENSE, count, author, and samples so
// the icon lane doubles as the per-set license audit the white-label product needs before shipping a
// set. Pure metadata (reads the packages' info.json) — safe to import anywhere.

/** A role in the house system: `house` = the primary family, `coverage` = the gap-filler. */
export type IconSetRole = 'house' | 'coverage'

/** One installed icon set as the lane shows it. Serializable. */
export interface IconSetInfo {
  /** Iconify prefix ('ph', 'tabler') — the namespace in an icon name `prefix:name`. */
  prefix: string
  name: string
  role: IconSetRole
  /** Total glyphs the set ships (all weights). */
  total: number
  version?: string
  license: { title: string; spdx?: string; url?: string }
  author: { name: string; url?: string }
  /** A few sample names (without prefix) the lane previews. */
  samples: string[]
}

// The raw info.json shape we read (a subset; the packages ship more).
interface RawInfo {
  prefix?: string
  name: string
  total?: number
  version?: string
  license: { title: string; spdx?: string; url?: string }
  author: { name: string; url?: string }
  samples?: string[]
}

function fromInfo(prefix: string, role: IconSetRole, raw: RawInfo): IconSetInfo {
  return {
    prefix,
    name: raw.name,
    role,
    total: raw.total ?? 0,
    ...(raw.version !== undefined ? { version: raw.version } : {}),
    license: raw.license,
    author: raw.author,
    samples: (raw.samples ?? []).slice(0, 6),
  }
}

/** THE installed sets, house family first. Add a set here when its @iconify-json package is installed. */
export const ICON_SETS: readonly IconSetInfo[] = [
  fromInfo('ph', 'house', phInfo as RawInfo),
  fromInfo('tabler', 'coverage', tablerInfo as RawInfo),
]

/** One set by prefix, or null. */
export function iconSetByPrefix(prefix: string): IconSetInfo | null {
  return ICON_SETS.find((s) => s.prefix === prefix) ?? null
}

/** The house family (the one `role: 'house'` set). */
export function houseIconSet(): IconSetInfo {
  return ICON_SETS.find((s) => s.role === 'house') ?? ICON_SETS[0]
}
