'use client'

// The in-app QR scanner (ADR-235) — a full camera takeover in the Mindless
// overlay grammar: live viewfinder, a framing reticle, one quiet close. Decode
// prefers the native BarcodeDetector (zero bundle); iOS Safari falls back to a
// lazily-imported jsQR loop over downscaled canvas frames. On a Frequency code
// it buzzes and NAVIGATES — the /q resolver, /n claim page, and profile pages
// already own every flow (check-in, node capture, connect cookies), so the
// scanner never pays or writes anything itself.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'
import { resolveScannedText } from '@/lib/scan/resolve'

type ScanState =
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'navigating' }
  | { kind: 'foreign'; host: string }
  | { kind: 'denied' }
  | { kind: 'unsupported' }

const HINT_COPY: Record<string, { title: string; line: string }> = {
  checkin: { title: 'Check in', line: 'Point at the event code at the door.' },
  node: { title: 'Ghost Node', line: 'Found one? Point at the node to capture it.' },
  partner: { title: 'Partners', line: 'Point at the partner\u2019s plaque or code.' },
  default: { title: 'Scan', line: 'Point at any Frequency code.' },
}

export function Scanner({ hint = 'default' }: { hint?: string }) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const handled = useRef(false)
  const [state, setState] = useState<ScanState>({ kind: 'starting' })
  // Re-arms the camera effect after a "foreign code" miss.
  const [attempt, setAttempt] = useState(0)
  const copy = HINT_COPY[hint] ?? HINT_COPY.default

  function leave() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.replace('/feed')
  }

  useEffect(() => {
    handled.current = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    let cancelled = false

    function stop() {
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
    }

    function onText(raw: string) {
      if (handled.current) return
      const result = resolveScannedText(raw, window.location.host)
      if (result.ok) {
        handled.current = true
        try {
          navigator.vibrate?.(20)
        } catch {
          // no vibration on this device
        }
        setState({ kind: 'navigating' })
        stop()
        router.push(result.path)
      } else if (result.reason === 'foreign') {
        handled.current = true
        setState({ kind: 'foreign', host: result.host })
        stop()
      }
      // unreadable frames are just noise — keep scanning
    }

    async function run() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({ kind: 'unsupported' })
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch {
        if (!cancelled) setState({ kind: 'denied' })
        return
      }
      const video = videoRef.current
      if (!video || cancelled) {
        stop()
        return
      }
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // navigating away mid-start
      }
      if (cancelled) return
      setState({ kind: 'scanning' })

      // Native detector where it exists; otherwise the jsQR canvas loop.
      const Detector = (
        window as Window & {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]>
          }
        }
      ).BarcodeDetector
      if (Detector) {
        const detector = new Detector({ formats: ['qr_code'] })
        timer = setInterval(() => {
          void (async () => {
            try {
              const codes = await detector.detect(video)
              if (codes[0]?.rawValue) onText(codes[0].rawValue)
            } catch {
              // a bad frame is not an error state
            }
          })()
        }, 300)
      } else {
        const { default: jsQR } = await import('jsqr')
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        timer = setInterval(() => {
          if (!ctx || video.readyState < 2) return
          // Downscale for decode speed; QR finds itself fine at ~640px.
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, 1))
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const hit = jsQR(img.data, img.width, img.height)
          if (hit?.data) onText(hit.data)
        }, 300)
      }
    }

    void run()
    return () => {
      cancelled = true
      stop()
    }
  }, [router, attempt])

  const scanning = state.kind === 'scanning' || state.kind === 'starting'

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Viewfinder */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          scanning ? 'opacity-100' : 'opacity-20'
        }`}
      />

      {/* Chrome: title up top, reticle center, status at the bottom. */}
      <div className="absolute inset-0 flex flex-col items-center justify-between px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="relative flex w-full max-w-md items-center justify-center">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-white/90">{copy.title}</p>
          <button
            type="button"
            onClick={leave}
            aria-label="Close"
            className="absolute right-0 rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {scanning && (
          <div aria-hidden className="relative h-60 w-60">
            {/* Four corner brackets — the universal "QR goes here". */}
            {(['top-0 left-0 border-t-2 border-l-2 rounded-tl-2xl',
              'top-0 right-0 border-t-2 border-r-2 rounded-tr-2xl',
              'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-2xl',
              'bottom-0 right-0 border-b-2 border-r-2 rounded-br-2xl'] as const).map((pos) => (
              <span key={pos} className={`absolute h-10 w-10 border-white/80 ${pos}`} />
            ))}
          </div>
        )}

        <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
          {scanning && <p className="text-sm text-white/85">{copy.line}</p>}
          {state.kind === 'navigating' && (
            <p className="text-sm font-semibold text-white">Got it. One sec…</p>
          )}
          {state.kind === 'foreign' && (
            <>
              <p className="text-sm text-white/90">
                That code points to <span className="font-semibold">{state.host}</span>. Not a
                Frequency code.
              </p>
              <button
                type="button"
                onClick={() => {
                  setState({ kind: 'starting' })
                  setAttempt((a) => a + 1)
                }}
                className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
              >
                Scan again
              </button>
            </>
          )}
          {state.kind === 'denied' && (
            <p className="text-sm text-white/90">
              The camera needs your permission. Allow it in your browser settings, then come back.
            </p>
          )}
          {state.kind === 'unsupported' && (
            <p className="text-sm text-white/90">
              This browser can’t open the camera. Your phone’s own camera app works too — Frequency
              codes are plain links.
            </p>
          )}
          {(state.kind === 'denied' || state.kind === 'unsupported') && (
            <Link
              href="/feed"
              className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
            >
              Back home
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
