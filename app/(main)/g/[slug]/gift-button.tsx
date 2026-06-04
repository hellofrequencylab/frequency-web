'use client'

import { useState, useTransition } from 'react'
import { Zap, Check } from 'lucide-react'
import { giftZap } from './actions'

export function GiftButton({ slug }: { slug: string }) {
  const [pending, start] = useTransition()
  const [state, setState] = useState<'idle' | 'sent' | 'already' | string>('idle')

  function send() {
    start(async () => {
      const r = await giftZap(slug)
      if ('error' in r) setState(r.error)
      else setState(r.data.awarded ? 'sent' : 'already')
    })
  }

  if (state === 'sent' || state === 'already') {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
        <Check className="w-4 h-4" />
        {state === 'sent' ? 'Zap sent!' : 'Already gifted today'}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={send}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-4 py-2 text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
      >
        <Zap className="w-4 h-4" />
        {pending ? 'Sending…' : 'Give a zap'}
      </button>
      {state !== 'idle' && <p className="text-xs text-danger">{state}</p>}
    </div>
  )
}
