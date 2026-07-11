'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { Columns2, Columns3, Columns4, Square, type LucideIcon } from 'lucide-react'

// Card COLUMN density for every Marketplace surface. A member picks how many cards sit across a row;
// the choice PERSISTS (localStorage) and applies INSTANTLY with no server round-trip. The grid is driven
// by CSS variables (--mp-cols-mobile / --mp-cols-desktop) that the provider sets on a wrapper, so the
// shared `.mp-grid` class (app/globals.css) repaints the moment the value changes — no Tailwind rebuild.
//
// Desktop (>= the large breakpoint): 2 / 3 / 4, DEFAULT 3. Mobile: 1 / 2, DEFAULT 2. The preference lives
// in a module store read through useSyncExternalStore: the server snapshot is always the defaults, so the
// first paint matches SSR (no hydration mismatch, no flash beyond the default) and the stored value is
// applied on the client's next render.

const DESKTOP_OPTIONS = [2, 3, 4] as const
const MOBILE_OPTIONS = [1, 2] as const
type DesktopCols = (typeof DESKTOP_OPTIONS)[number]
type MobileCols = (typeof MOBILE_OPTIONS)[number]

const DEFAULT_DESKTOP: DesktopCols = 3
const DEFAULT_MOBILE: MobileCols = 2

const STORAGE_DESKTOP = 'mp-cols-desktop'
const STORAGE_MOBILE = 'mp-cols-mobile'

function clampDesktop(n: unknown): DesktopCols {
  return DESKTOP_OPTIONS.includes(n as DesktopCols) ? (n as DesktopCols) : DEFAULT_DESKTOP
}
function clampMobile(n: unknown): MobileCols {
  return MOBILE_OPTIONS.includes(n as MobileCols) ? (n as MobileCols) : DEFAULT_MOBILE
}

// ── Module store ────────────────────────────────────────────────────────────
// One shared, localStorage-backed preference for the whole page. Any number of
// providers/controls stay in sync, and a write repaints every grid at once.

type Prefs = { desktop: DesktopCols; mobile: MobileCols }

const SERVER_PREFS: Prefs = { desktop: DEFAULT_DESKTOP, mobile: DEFAULT_MOBILE }
let clientPrefs: Prefs | null = null
const listeners = new Set<() => void>()

/** Lazily read the stored preference on first client access; cached thereafter for a stable snapshot. */
function getSnapshot(): Prefs {
  if (clientPrefs) return clientPrefs
  let prefs: Prefs = { ...SERVER_PREFS }
  try {
    const d = window.localStorage.getItem(STORAGE_DESKTOP)
    const m = window.localStorage.getItem(STORAGE_MOBILE)
    prefs = {
      desktop: d != null ? clampDesktop(Number(d)) : DEFAULT_DESKTOP,
      mobile: m != null ? clampMobile(Number(m)) : DEFAULT_MOBILE,
    }
  } catch {
    // localStorage unavailable (private mode) — fall back to defaults.
  }
  clientPrefs = prefs
  return clientPrefs
}

function getServerSnapshot(): Prefs {
  return SERVER_PREFS
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function write(next: Prefs, key: string, value: number) {
  clientPrefs = next
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // ignore write failures
  }
  listeners.forEach((l) => l())
}

function setDesktop(n: DesktopCols) {
  const next = clampDesktop(n)
  write({ ...getSnapshot(), desktop: next }, STORAGE_DESKTOP, next)
}
function setMobile(n: MobileCols) {
  const next = clampMobile(n)
  write({ ...getSnapshot(), mobile: next }, STORAGE_MOBILE, next)
}

function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// ── Provider ─────────────────────────────────────────────────────────────────

/**
 * Wraps a Marketplace surface's grid area. Renders a container carrying the `--mp-cols-*` CSS variables
 * that the shared `.mp-grid` class reads, and re-renders instantly when the density changes.
 */
export function MarketplaceColumnsProvider({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { desktop, mobile } = usePrefs()
  const style = {
    '--mp-cols-desktop': String(desktop),
    '--mp-cols-mobile': String(mobile),
  } as React.CSSProperties
  return (
    <div style={style} className={className}>
      {children}
    </div>
  )
}

// ── Control ──────────────────────────────────────────────────────────────────

const DESKTOP_ICON: Record<DesktopCols, LucideIcon> = {
  2: Columns2,
  3: Columns3,
  4: Columns4,
}
const MOBILE_ICON: Record<MobileCols, LucideIcon> = {
  1: Square,
  2: Columns2,
}

function Segment<T extends number>({
  label,
  value,
  options,
  icons,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  icons: Record<number, LucideIcon>
  onChange: (n: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-sm"
    >
      {options.map((n) => {
        const Icon: LucideIcon = icons[n]
        const on = n === value
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${n} ${n === 1 ? 'column' : 'columns'}`}
            title={`${n} ${n === 1 ? 'column' : 'columns'}`}
            onClick={() => onChange(n)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors motion-reduce:transition-none ${
              on ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

/**
 * The density control. Shows a 2 / 3 / 4 radiogroup on the large breakpoint and up, and a compact
 * 1 / 2 radiogroup on small screens — each persists independently. Place it near the top of the grid
 * (a right-aligned toggle in the filter row is conventional).
 */
export function MarketplaceColumns({ className }: { className?: string }) {
  const { desktop, mobile } = usePrefs()
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <span className="text-sm font-medium text-muted">Columns</span>
      {/* Desktop: 2 / 3 / 4 */}
      <div className="hidden lg:block">
        <Segment
          label="Cards per row"
          value={desktop}
          options={DESKTOP_OPTIONS}
          icons={DESKTOP_ICON}
          onChange={setDesktop}
        />
      </div>
      {/* Mobile: 1 / 2 */}
      <div className="block lg:hidden">
        <Segment
          label="Cards per row"
          value={mobile}
          options={MOBILE_OPTIONS}
          icons={MOBILE_ICON}
          onChange={setMobile}
        />
      </div>
    </div>
  )
}
