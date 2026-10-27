'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
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
      className={buttonClasses('primary')}
    >
      <Check className="h-4 w-4" aria-hidden />
      {pending ? 'Saving…' : `I’ve done these. Finish (+${reward} Gems)`}
    </button>
  )
}
