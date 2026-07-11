// Image focal point — the shared math behind ImageFocalPicker and every cropped-image
// render site that adopts it. A focal point is stored and applied as a CSS
// `object-position` string ("x% y%", top-left origin), so an image cropped with
// `object-cover` keeps the important part (a face, a horizon) in frame instead of the
// default center crop.
//
// Kept dependency-free so it is unit-tested and safe to import from server code (the save
// actions normalize/validate a stored value through here) as well as the client picker.
// VERTICAL is the axis creators care about most, but the helpers carry full 2D (x + y);
// horizontal defaults to 50%.

/** The centered default — today's `object-cover` behavior. Unset focal point === this. */
export const DEFAULT_OBJECT_POSITION = '50% 50%'

export interface FocalXY {
  /** Horizontal position, 0 (left) → 100 (right). */
  x: number
  /** Vertical position, 0 (top) → 100 (bottom). The primary axis. */
  y: number
}

/** Clamp a number to the 0–100 percent range, rounding to a whole percent so stored strings
 *  stay clean. Non-finite input falls back to 50 (center). */
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 50
  return Math.min(100, Math.max(0, Math.round(n)))
}

/** Parse a stored `object-position` string ("50% 30%") into {x, y} percentages. Anything
 *  unparseable (empty, malformed, non-percent) falls back to dead center, so a bad value can
 *  never break a render — it just crops centered, exactly as today. */
export function objectPositionToXY(value: string | null | undefined): FocalXY {
  const parts = (value ?? '').trim().split(/\s+/)
  if (parts.length !== 2) return { x: 50, y: 50 }
  const x = Number.parseFloat(parts[0])
  const y = Number.parseFloat(parts[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 50, y: 50 }
  return { x: clampPercent(x), y: clampPercent(y) }
}

/** Build a storable `object-position` string from x/y percentages (both clamped 0–100). */
export function xyToObjectPosition(x: number, y: number): string {
  return `${clampPercent(x)}% ${clampPercent(y)}%`
}

/** True when a value is absent or resolves to the centered default — the case where nothing
 *  should be stored and the render keeps its plain centered crop. */
export function isDefaultObjectPosition(value: string | null | undefined): boolean {
  const s = (value ?? '').trim()
  if (!s) return true
  const { x, y } = objectPositionToXY(s)
  return x === 50 && y === 50
}

/** Normalize a focal value for STORAGE: a clean "x% y%" string, or null when it is empty or
 *  the centered default (so a plain image stores nothing and stays backward compatible). Use in
 *  a save path so only a deliberately-moved focal point is ever persisted. */
export function normalizeObjectPosition(value: string | null | undefined): string | null {
  if (isDefaultObjectPosition(value)) return null
  const { x, y } = objectPositionToXY(value)
  return xyToObjectPosition(x, y)
}
