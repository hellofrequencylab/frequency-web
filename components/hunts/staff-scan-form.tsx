'use client'

// The venue staff's proof check (FH-020T): scan the player's one-time code with the camera where the
// browser can, or type it. Either way the code goes to POST /api/hunts/staff/verify, which decides.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorCtor = new (options: { formats: string[] }) => Detector

const REASON_WORDS: Record<string, string> = {
  expired: 'That code has expired. Ask the player for a new one.',
  already_used: 'That code was already used.',
  already_credited: 'That stop is already credited.',
}

const subscribeNever = () => () => {}
const cameraScanSupported = () => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia

export function StaffScanForm() {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const canScan = useSyncExternalStore(subscribeNever, cameraScanSupported, () => false)
  const video = useRef<HTMLVideoElement>(null)

  async function check(token: string) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/hunts/staff/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; replayed?: boolean }
      if (json.ok === true) {
        setMessage(json.replayed ? 'Already checked. The player has their credit.' : 'Checked. The player gets credit for this stop.')
        setCode('')
      } else if (res.status === 401) {
        setMessage('Sign in first.')
      } else if (res.status === 404) {
        setMessage('We could not check that code.')
      } else {
        setMessage((json.reason && REASON_WORDS[json.reason]) || 'That code did not check out.')
      }
    } catch {
      setMessage('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!scanning) return
    let stopped = false
    let stream: MediaStream | null = null
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
    async function run() {
      try {
        if (!Ctor) return
        const detector = new Ctor({ formats: ['qr_code'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (video.current) {
          video.current.srcObject = stream
          await video.current.play()
        }
        while (!stopped && video.current) {
          const found = await detector.detect(video.current).catch(() => [])
          if (found[0]?.rawValue) {
            setScanning(false)
            setCode(found[0].rawValue)
            await check(found[0].rawValue)
            return
          }
          await new Promise((r) => setTimeout(r, 300))
        }
      } catch {
        setScanning(false)
        setMessage('We could not open the camera. Enter the code by hand.')
      }
    }
    void run()
    return () => {
      stopped = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [scanning])

  return (
    <div className="space-y-4">
      {canScan && (
        <Button type="button" disabled={busy} onClick={() => setScanning((s) => !s)}>{scanning ? 'Stop scanning' : 'Scan player code'}</Button>
      )}
      {scanning && <video ref={video} muted playsInline aria-label="Camera view" className="w-full rounded-card border border-border" />}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void check(code)
        }}
      >
        <Field label="Player code">
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        <Button type="submit" variant="secondary" disabled={busy || code.trim().length < 10}>Check code</Button>
      </form>
      {message && <p role="status" className="text-body-sm">{message}</p>}
    </div>
  )
}
