// The DOM half of the mode law. Pairs with mode.ts, which holds the pure decision and the ES5
// bootstrap that runs before this file's bundle exists.
//
// Everything here is browser-only and guarded: called during SSR these are no-ops rather than
// crashes, so a component may call them from a lazy `useState` initializer or an effect without
// branching on `typeof window` at every site.

import {
  THEME_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  DEFAULT_THEME_MODE,
  type ThemeMode,
  hasAccountSignal,
  isThemeMode,
  parseThemeMode,
  resolveDarkMode,
  themeColorFor,
} from './mode'

/** Whether we are in a browser with a DOM. */
function inBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * The member's stored mode, with the one-time legacy-key migration the bootstrap also performs.
 * Returns the DEFAULT when storage is unreadable (private mode, a strict cookie policy) — a locked
 * jar is not a reason to strand somebody in the wrong theme.
 */
export function readStoredMode(): ThemeMode {
  if (!inBrowser()) return DEFAULT_THEME_MODE
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeMode(saved)) return saved
    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
    if (isThemeMode(legacy)) {
      localStorage.setItem(THEME_STORAGE_KEY, legacy)
      return legacy
    }
    return DEFAULT_THEME_MODE
  } catch {
    return DEFAULT_THEME_MODE
  }
}

/** Persist a chosen mode. Silently no-ops on a blocked jar — the DOM is still applied by the caller. */
export function writeStoredMode(mode: ThemeMode): void {
  if (!inBrowser()) return
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // A blocked jar costs persistence across reloads, not the current page.
  }
}

/** Does this browser belong to someone with an account? See ACCOUNT_COOKIE in mode.ts. */
export function hasAccount(): boolean {
  if (!inBrowser()) return false
  try {
    return hasAccountSignal(document.cookie)
  } catch {
    return false
  }
}

/** `prefers-color-scheme: dark`. */
export function systemPrefersDark(): boolean {
  if (!inBrowser()) return false
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/**
 * Resolve the mode for RIGHT NOW — this path, this viewport, this browser — from the live
 * environment, through the same `resolveDarkMode` the pre-paint bootstrap restates.
 */
export function resolveCurrentDark(pathname?: string): boolean {
  if (!inBrowser()) return false
  return resolveDarkMode({
    stored: readStoredMode(),
    systemDark: systemPrefersDark(),
    hasAccount: hasAccount(),
    pathname: pathname ?? window.location.pathname,
    viewportWidth: window.innerWidth,
  })
}

/**
 * Put the resolved mode on the document: the `.dark` class and the browser-chrome colour.
 *
 * The theme-color literal comes from mode.ts rather than the live CSS variable. The app shell used
 * to read `getComputedStyle(...).getPropertyValue('--color-canvas')` here, which is a nice idea that
 * gives a DIFFERENT answer under a skin — `[data-skin="midnight"]` redefines the canvas — so the
 * status bar drifted from the pre-paint value for skinned members. One pair of literals, one answer,
 * matching what the bootstrap already painted.
 */
export function applyResolvedDark(dark: boolean): void {
  if (!inBrowser()) return
  document.documentElement.classList.toggle('dark', dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', themeColorFor(dark))
}

/** Re-resolve from the live environment and apply. The whole sync loop in one call. */
export function syncMode(pathname?: string): boolean {
  const dark = resolveCurrentDark(pathname)
  applyResolvedDark(dark)
  return dark
}

/** Narrow an untrusted value to a mode. Re-exported so callers need only this module. */
export { parseThemeMode, isThemeMode }
export type { ThemeMode }
