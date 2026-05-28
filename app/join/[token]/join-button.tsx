'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { joinViaInviteLink } from '@/app/(main)/admin/actions'

export function JoinButton({ token, circleName }: { token: string; circleName: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleJoin() {
    startTransition(async () => {
      try {
        await joinViaInviteLink(token)
        router.push('/circles')
      } catch (err: any) {
        alert(err?.message ?? 'Something went wrong. Please try again.')
      }
    })
  }

  return (
    <button
      onClick={handleJoin}
      disabled={isPending}
      className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
    >
      {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
      {isPending ? 'Joining…' : `Join ${circleName}`}
    </button>
  )
}
