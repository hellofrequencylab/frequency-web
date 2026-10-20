'use client'

import { useRef, useState } from 'react'
import { Nfc, Check, X, Loader2 } from 'lucide-react'
import { nfcTagMessage, tagMatches, type NdefRecordLike } from '@/lib/qr/nfc-tag'

// Writes the check-in link to an NFC tag from the browser (LIVE-1113). Web NFC is
// Chrome-for-Android only, so anywhere else we say where to program the tag instead of
// showing a dead button. After the write we ask for one more tap and read the tag back,
// so the owner knows the tag holds the exact link before it goes on the wall.

interface NdefReaderLike {
  write(message: ReturnType<typeof nfcTagMessage>): Promise<void>
  scan(options?: { signal?: AbortSignal }): Promise<void>
  onreading: ((event: { message: { records: NdefRecordLike[] } }) => void) | null
  onreadingerror: (() => void) | null
}
type NdefReaderCtor = new () => NdefReaderLike

type Step = 'idle' | 'writing' | 'verifying' | 'done' | 'error'

export function CheckinNfcWriter({ link }: { link: string }) {
  const [step, setStep] = useState<Step>('idle')
  const [note, setNote] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const supported = typeof window !== 'undefined' && 'NDEFReader' in window
  const btn =
    'inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60'

  function fail(msg: string) {
    abort.current?.abort()
    setStep('error')
    setNote(msg)
  }

  async function run() {
    const Ctor = (window as unknown as { NDEFReader: NdefReaderCtor }).NDEFReader
    try {
      setStep('writing')
      setNote('Hold a blank tag to the back of your phone.')
      await new Ctor().write(nfcTagMessage(link))

      setStep('verifying')
      setNote('Written. Tap the tag once more to check it.')
      const ctrl = new AbortController()
      abort.current = ctrl
      const timer = setTimeout(() => fail('Could not read the tag back. Tap Write to NFC tag to try again.'), 20000)
      const reader = new Ctor()
      reader.onreading = (e) => {
        clearTimeout(timer)
        ctrl.abort()
        if (tagMatches(e.message.records, link)) {
          setStep('done')
          setNote('Verified. The tag holds the check-in link.')
        } else {
          fail('The tag does not match the check-in link. Write it again.')
        }
      }
      reader.onreadingerror = () => {
        clearTimeout(timer)
        fail('Could not read the tag back. Write it again.')
      }
      await reader.scan({ signal: ctrl.signal })
    } catch (e) {
      fail(e instanceof Error && e.name === 'NotAllowedError' ? 'NFC permission was denied.' : 'Write failed. Try again.')
    }
  }

  if (!supported) {
    return (
      <p className="text-meta text-muted">
        To write a tag, open this page in Chrome on an Android phone, or use the Frequency app on Android or a tag-writer
        app.
      </p>
    )
  }

  const busy = step === 'writing' || step === 'verifying'
  return (
    <div className="space-y-1">
      <button type="button" onClick={run} disabled={busy} className={btn}>
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : step === 'done' ? (
          <Check className="h-3.5 w-3.5 text-success" aria-hidden />
        ) : step === 'error' ? (
          <X className="h-3.5 w-3.5 text-danger" aria-hidden />
        ) : (
          <Nfc className="h-3.5 w-3.5" aria-hidden />
        )}
        Write to NFC tag
      </button>
      {note && (
        <p className={`text-meta ${step === 'error' ? 'text-danger' : 'text-muted'}`} role="status">
          {note}
        </p>
      )}
    </div>
  )
}
