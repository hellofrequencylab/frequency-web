'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { joinViaInviteLink } from '@/app/(main)/admin/actions'
import { buttonClasses } from '@/components/ui/button'

export function JoinButton({ token, circleName, frequency = false }: { token: string; circleName: string; frequency?: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleJoin() {
    startTransition(async () => {
      try {
        await joinViaInviteLink(token)
        router.push('/circles')
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
    })
  }

  return (
    <button
      onClick={handleJoin}
      disabled={isPending}
      className={frequency ? 'btn fq-iri-btn' : buttonClasses('primary', 'md', 'w-full')}
    >
      {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
      {isPending ? 'Joining…' : `Join ${circleName}`}
    </button>
  )
}
