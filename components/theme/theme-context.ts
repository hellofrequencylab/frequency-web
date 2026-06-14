'use client'

import { createContext } from 'react'
import type { ResolvedTheme } from '@/lib/theme'
import { DEFAULT_GENERATION } from '@/lib/theme'
import { DEFAULT_SKIN } from '@/lib/theme'
import { DEFAULT_OCCASION } from '@/lib/theme'

// The React context that carries the request's ResolvedTheme (skin / generation /
// occasion) down to client + structural components that need to READ the resolved axes —
// e.g. a component that renders differently per generation, or the theme toggle reading
// the current selection. The axes are SET as data-attributes on the shell by the layout
// (server) agent; this context never writes the DOM, it only surfaces the same resolved
// values to React land. The provider/consumer hook live in theme-provider.tsx.

/**
 * The safe fallback theme. `null` would force every consumer to null-check; instead the
 * context defaults to the system defaults (balanced / default skin / no occasion) so a
 * component rendered outside a provider degrades to the neutral baseline rather than
 * crashing. The provider's useResolvedTheme hook still flags genuine out-of-provider use.
 */
export const FALLBACK_THEME: ResolvedTheme = {
  skin: DEFAULT_SKIN,
  generation: DEFAULT_GENERATION,
  occasion: DEFAULT_OCCASION,
}

/** The context object. Defaults to FALLBACK_THEME (see above). */
export const ThemeContext = createContext<ResolvedTheme>(FALLBACK_THEME)
