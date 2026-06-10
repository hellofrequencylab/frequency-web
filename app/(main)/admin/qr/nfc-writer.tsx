'use client'

import { useState } from 'react'
import { Nfc, Check, X, Loader2 } from 'lucide-react'
import { withMedium } from '@/lib/qr/links'

// Web NFC writer — program a physical NFC tag with a code's URL, right from the
// browser. Uses the Web NFC API (NDEFReader), which is Chrome-for-Android only;
// everywhere else we degrade to a clear hint (the QR still covers those scanners).
// The written URL is medium-stamped (?m=nfc) so taps are attributed in the scan log.
//
// `url` is the code's absolute destination (a /q/<slug> short link or /n/<id>).
// `tagMedium` defaults to 'nfc' so dynamic-link codes record the channel; pass
// 'qr' for nodes, whose channel is already carried by the node's own type.

interface NDEFWriter {
  write(message: { records: { recordType: string; data: string }[] }): Promise<void>
}
type NDEFWriterCtor = new () => NDEFWriter

type WriteState = 'idle' | 'writing' | 'done' | 'error'

export function NfcWriter({
  url,
  tagMedium = 'nfc',
  className,
}: {
  url: string
  tagMedium?: 'nfc' | 'qr'
  className?: string
}) {
  const [state, setState] = useState<WriteState>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const supported = typeof window !== 'undefined' && 'NDEFReader' in window

  async function write() {
    if (!supported) return
    setState('writing')
    setMessage('Hold a blank tag to the back of your phone…')
    try {
      const Ctor = (window as unknown as { NDEFReader: NDEFWriterCtor }).NDEFReader
      const writer = new Ctor()
      await writer.write({ records: [{ recordType: 'url', data: withMedium(url, tagMedium) }] })
      setState('done')
      setMessage('Tag written. Give it a tap to test.')
      setTimeout(() => {
        setState('idle')
        setMessage(null)
      }, 4000)
    } catch (e) {
      setState('error')
      setMessage(e instanceof Error && e.name === 'NotAllowedError' ? 'Permission denied.' : 'Write failed. Try again.')
      setTimeout(() => {
        setState('idle')
        setMessage(null)
      }, 4000)
    }
  }

  if (!supported) {
    // Desktop / iOS Safari can't write tags — say so plainly rather than show a
    // dead button. The operator can program tags from an Android phone (Chrome).
    return (
      <span
        className={
          className ??
          'inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-subtle'
        }
        title="NFC writing needs Chrome on Android. Open this page on an Android phone to program a tag."
      >
        <Nfc className="h-3 w-3" /> NFC (Android)
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <button
        onClick={write}
        disabled={state === 'writing'}
        className={
          className ??
          'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-60'
        }
      >
        {state === 'writing' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : state === 'done' ? (
          <Check className="h-3 w-3 text-success" />
        ) : state === 'error' ? (
          <X className="h-3 w-3 text-danger" />
        ) : (
          <Nfc className="h-3 w-3" />
        )}
        {state === 'writing' ? 'Tap tag…' : state === 'done' ? 'Written' : 'Write NFC'}
      </button>
      {message && state !== 'idle' && (
        <span className={`text-2xs ${state === 'error' ? 'text-danger' : 'text-muted'}`}>{message}</span>
      )}
    </span>
  )
}
