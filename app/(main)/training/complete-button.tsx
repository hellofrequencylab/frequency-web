'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { markTrainingComplete } from './actions'

export function CompleteButton({ reward }: { reward: number }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await markTrainingComplete()
          if (r.ok) router.refresh()
        })
      }
      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
    >
      <Check className="h-4 w-4" aria-hidden />
      {pending ? 'Saving…' : `I’ve done these — finish (+${reward} gems)`}
    </button>
  )
}
