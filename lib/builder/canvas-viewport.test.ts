import { expect, it } from 'vitest'
import { bubbleEvent, canvasViewportWidth, toParentViewport, type CanvasPointerEvent } from './canvas-viewport'

const frame = { left: 100, top: 50, width: 820, height: 700, layoutWidth: 820, layoutHeight: 700, borderLeft: 2, borderTop: 3 }
const point = { clientX: 40, clientY: 60 }

it.each([
  [frame, { clientX: 142, clientY: 113 }],
  [{ ...frame, width: 410, height: 175 }, { clientX: 121, clientY: 65.75 }],
  [{ ...frame, left: -25, top: -40, borderLeft: 0, borderTop: 0 }, { clientX: 15, clientY: 20 }],
  [{ ...frame, layoutWidth: 0 }, null],
  [{ ...frame, top: Infinity }, null],
] as const)('maps a child viewport point through frame geometry %#', (geometry, expected) => {
  expect(toParentViewport(point, geometry)).toEqual(expected)
})

it('relays mapped coordinates and modifiers without changing the source event', () => {
  const event = Object.freeze({
    ...point, type: 'contextmenu', button: 2, altKey: false, ctrlKey: true, metaKey: false, shiftKey: true,
  }) satisfies CanvasPointerEvent
  expect(bubbleEvent(event, frame)).toEqual({ ...event, clientX: 142, clientY: 113 })
  expect(event.clientX).toBe(40)
  expect(bubbleEvent(event, { ...frame, height: 0 })).toBeNull()
})

it.each([
  ['site', 'desktop', 1280],
  ['site', 'tablet', 820],
  ['site', 'phone', 390],
  ['profile', 'desktop', 840],
  ['spotlight', 'tablet', 820],
  ['email', 'tablet', 600],
  ['email', 'phone', 390],
] as const)('uses the existing %s and %s width contracts', (surface, device, width) => {
  expect(canvasViewportWidth(surface, device)).toBe(width)
})
