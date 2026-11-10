import { BUILDER_DEVICE_WIDTH, type BuilderDevice } from './state'
import { surfaceFrame, type BuilderSurface } from './surfaces'

export const CANVAS_DEVICES = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'phone', label: 'Phone' },
] as const satisfies readonly { id: BuilderDevice; label: string }[]

export function canvasViewportWidth(surface: BuilderSurface, device: BuilderDevice): number {
  return surfaceFrame(surface, BUILDER_DEVICE_WIDTH[device]).width
}

type Point = Readonly<{ clientX: number; clientY: number }>

type FrameGeometry = Readonly<{
  left: number
  top: number
  width: number
  height: number
  layoutWidth: number
  layoutHeight: number
  borderLeft: number
  borderTop: number
}>

export type CanvasPointerEvent = Point & Readonly<{
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'click' | 'contextmenu'
  button: number
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}>

/** Translate iframe client coordinates into parent client coordinates, including CSS scaling.
 * Frame bounds and both client coordinate systems already account for their own scroll.
 */
export function toParentViewport(point: Point, frame: FrameGeometry): Point | null {
  const { clientX, clientY } = point
  const { left, top, width, height, layoutWidth, layoutHeight, borderLeft, borderTop } = frame
  if (
    ![clientX, clientY, left, top, width, height, layoutWidth, layoutHeight, borderLeft, borderTop].every(Number.isFinite) ||
    width <= 0 || height <= 0 || layoutWidth <= 0 || layoutHeight <= 0
  ) return null

  return {
    clientX: left + (borderLeft + clientX) * (width / layoutWidth),
    clientY: top + (borderTop + clientY) * (height / layoutHeight),
  }
}

/** Relay only the mapped value to the parent editor. The original DOM event stays in its frame. */
export function bubbleEvent(event: CanvasPointerEvent, frame: FrameGeometry): CanvasPointerEvent | null {
  const point = toParentViewport(event, frame)
  return point ? { ...event, ...point } : null
}
