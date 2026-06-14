'use client'

import { useContext } from 'react'
import type { ResolvedTheme } from '@/lib/theme'
import { ThemeContext, FALLBACK_THEME } from './theme-context'

// The ThemeProvider + useResolvedTheme hook. The layout (server) agent resolves the theme
// once per request (lib/theme/server/resolve.ts) and sets the axes as data-attributes on
// the shell root; it ALSO passes the same ResolvedTheme into this provider so client +
// structural components can READ the resolved axes in React (the data-attributes drive the
// CSS; this context drives any React-side branching). This component does NOT write the
// DOM — there is no useEffect setting attributes here, by design.

/**
 * Provide the request's ResolvedTheme to the React subtree. Mounted high in the app shell
 * by the layout agent with the server-resolved value.
 */
export function ThemeProvider({
  value,
  children,
}: {
  value: ResolvedTheme
  children: React.ReactNode
}) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * Read the resolved theme (skin / generation / occasion) in a client component. Returns
 * the provided value inside a ThemeProvider, or the neutral FALLBACK_THEME (balanced /
 * default / none) when rendered outside one, so a stray consumer degrades gracefully
 * instead of crashing.
 */
export function useResolvedTheme(): ResolvedTheme {
  const value = useContext(ThemeContext)
  return value ?? FALLBACK_THEME
}
