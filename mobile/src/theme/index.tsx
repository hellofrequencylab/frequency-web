import { createContext, useContext, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { palettes, type ColorScheme, type Palette } from './tokens'

export * from './tokens'

type Theme = { scheme: ColorScheme; c: Palette }

const ThemeContext = createContext<Theme>({ scheme: 'light', c: palettes.light })

/** Commons by day, the Thermal night room when the phone is in dark mode (the web's `data-time="night"`). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  return <ThemeContext.Provider value={{ scheme, c: palettes[scheme] }}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  return useContext(ThemeContext)
}
