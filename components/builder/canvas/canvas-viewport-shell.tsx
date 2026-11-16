'use client'

import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { bubbleEvent, CANVAS_DEVICES, canvasViewportWidth, type CanvasPointerEvent } from '@/lib/builder/canvas-viewport'
import type { BuilderDevice } from '@/lib/builder/state'
import type { BuilderSurface } from '@/lib/builder/surfaces'

const FRAME_DOCUMENT = '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"></body></html>'

export function CanvasViewportShell({
  surface, device, onDeviceChange, onCanvasEvent, children, height = 720,
}: {
  surface: BuilderSurface
  device: BuilderDevice
  onDeviceChange: (device: BuilderDevice) => void
  onCanvasEvent?: (event: CanvasPointerEvent) => void
  children: ReactNode
  height?: number
}) {
  const frame = useRef<HTMLIFrameElement | null>(null)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  // The frame is in the server's markup, so its document can finish loading before React is listening for `load`
  // and the event is then never seen: the frame stayed empty in a real browser (found taking PROG-E6B's pictures).
  // When React takes hold of the element, a frame document that is already there is used at once.
  const hold = useCallback((el: HTMLIFrameElement | null) => {
    frame.current = el
    const loaded = el?.contentDocument
    if (loaded?.readyState === 'complete' && loaded.URL === 'about:srcdoc' && loaded.body) setMount(loaded.body)
  }, [])
  const width = canvasViewportWidth(surface, device)

  const relay = (type: CanvasPointerEvent['type'], event: MouseEvent) => {
    if (!frame.current || !onCanvasEvent) return
    const { left, top, width, height } = frame.current.getBoundingClientRect()
    const { offsetWidth, offsetHeight, clientLeft, clientTop } = frame.current
    const { clientX, clientY, button, altKey, ctrlKey, metaKey, shiftKey } = event
    const mapped = bubbleEvent({ type, clientX, clientY, button, altKey, ctrlKey, metaKey, shiftKey }, {
      left, top, width, height,
      layoutWidth: offsetWidth, layoutHeight: offsetHeight, borderLeft: clientLeft, borderTop: clientTop,
    })
    if (mapped) onCanvasEvent(mapped)
  }

  return (
    <section aria-label="Editor canvas" className="min-w-0 space-y-3">
      <div role="group" aria-label="Preview device" className="flex flex-wrap gap-2">
        {CANVAS_DEVICES.map(({ id, label }) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={device === id ? 'primarySoft' : 'secondary'}
            className="min-h-11"
            aria-pressed={device === id}
            onClick={() => onDeviceChange(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <iframe
          ref={hold}
          title="Page preview"
          sandbox="allow-same-origin"
          srcDoc={FRAME_DOCUMENT}
          width={width}
          height={height}
          className="mx-auto block border-0"
          onLoad={(event) => setMount(event.currentTarget.contentDocument?.body ?? null)}
        />
      </div>
      {mount && createPortal(
        <div
          onPointerDown={(event) => relay('pointerdown', event)}
          onPointerMove={(event) => relay('pointermove', event)}
          onPointerUp={(event) => relay('pointerup', event)}
          onClick={(event) => relay('click', event)}
          onContextMenu={(event) => relay('contextmenu', event)}
        >
          {children}
        </div>,
        mount,
      )}
    </section>
  )
}
