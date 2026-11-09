import { BREAKPOINTS } from '@/lib/theme/breakpoints'

// THE RAIL STATE MACHINE (BLD-102; spec docs/EDITOR-NEXT.md#bld-102). The builder has two rails: the outline on the
// left and the settings panel on the right. Each one is in exactly one of four modes:
//   hidden   not drawn at all (phones, focus mode)
//   strip    a thin bar with its toggle; the canvas keeps the room
//   overlay  open over the canvas; a canvas click or Esc closes it
//   pinned   open beside the canvas; the canvas gives up the room
// Which modes a width allows comes from the shared breakpoints (BLD-002), and the owner's pins and the right rail's
// width are kept per person. Pure functions only: the shell renders what `railModes` says and dispatches the rest.

type RailMode = 'hidden' | 'strip' | 'overlay' | 'pinned'
export type RailSide = 'left' | 'right'

export const RAIL_WIDTH = { min: 300, max: 420, initial: 320 } as const

/** What a person chose, kept across visits. */
interface RailPrefs {
  leftPinned: boolean
  rightPinned: boolean
  rightWidth: number
}

/** The rails right now: the person's prefs, which rail is open as an overlay, focus mode, and what opened it. */
export interface RailState {
  prefs: RailPrefs
  open: RailSide | null
  focus: boolean
  /** The id of the control that opened the overlay, so closing it can hand focus back. */
  trigger: string | null
}

type RailAction =
  | { type: 'toggle'; side: RailSide; width: number; trigger?: string }
  | { type: 'pin'; side: RailSide; pinned: boolean }
  | { type: 'resize'; width: number }
  | { type: 'close' }
  | { type: 'focus'; on: boolean }

const RAIL_PREFS_DEFAULT: RailPrefs = { leftPinned: true, rightPinned: true, rightWidth: RAIL_WIDTH.initial }

const clampWidth = (w: unknown) => {
  const n = typeof w === 'number' && Number.isFinite(w) ? Math.round(w) : RAIL_WIDTH.initial
  return Math.min(RAIL_WIDTH.max, Math.max(RAIL_WIDTH.min, n))
}

/** Which rails may pin at this width. Wide: both. Medium: the settings panel only (the outline folds to a strip).
 *  Narrow and phone: neither, every open rail is an overlay. */
export function railPinnable(width: number): Record<RailSide, boolean> {
  if (width >= BREAKPOINTS.lg) return { left: true, right: true }
  if (width >= BREAKPOINTS.md) return { left: false, right: true }
  return { left: false, right: false }
}

/** The mode each rail is drawn in, for this state at this width. */
export function railModes(state: RailState, width: number): Record<RailSide, RailMode> {
  if (state.focus) return { left: 'hidden', right: 'hidden' }
  const pinnable = railPinnable(width)
  const closed: RailMode = width < BREAKPOINTS.sm ? 'hidden' : 'strip'
  const mode = (side: RailSide): RailMode => {
    if (pinnable[side] && state.prefs[side === 'left' ? 'leftPinned' : 'rightPinned']) return 'pinned'
    return state.open === side ? 'overlay' : closed
  }
  return { left: mode('left'), right: mode('right') }
}

export function railInit(prefs?: Partial<RailPrefs> | null): RailState {
  return { prefs: railPrefs(prefs), open: null, focus: false, trigger: null }
}

export function railReducer(state: RailState, action: RailAction): RailState {
  switch (action.type) {
    case 'toggle': {
      const modes = railModes(state, action.width)
      // A pinned rail's toggle unpins it; an overlay's toggle closes it; a strip or hidden rail opens over the canvas.
      if (modes[action.side] === 'pinned') return railReducer(state, { type: 'pin', side: action.side, pinned: false })
      if (state.open === action.side) return { ...state, open: null }
      return { ...state, focus: false, open: action.side, trigger: action.trigger ?? null }
    }
    case 'pin': {
      const key = action.side === 'left' ? 'leftPinned' : 'rightPinned'
      return { ...state, prefs: { ...state.prefs, [key]: action.pinned }, open: action.pinned && state.open === action.side ? null : state.open }
    }
    case 'resize':
      return { ...state, prefs: { ...state.prefs, rightWidth: clampWidth(action.width) } }
    case 'close':
      return state.open ? { ...state, open: null } : state
    case 'focus':
      return { ...state, focus: action.on, open: action.on ? null : state.open }
  }
}

/** Read stored prefs, never trusting the shape: anything missing or wrong falls back to the default. */
export function railPrefs(raw: unknown): RailPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    leftPinned: typeof r.leftPinned === 'boolean' ? r.leftPinned : RAIL_PREFS_DEFAULT.leftPinned,
    rightPinned: typeof r.rightPinned === 'boolean' ? r.rightPinned : RAIL_PREFS_DEFAULT.rightPinned,
    rightWidth: clampWidth(r.rightWidth ?? RAIL_PREFS_DEFAULT.rightWidth),
  }
}

/** The browser storage key for a person's rail prefs. Storage is per browser profile, so per person. */
export const RAIL_PREFS_KEY = 'frequency.builder.rails.v1'
