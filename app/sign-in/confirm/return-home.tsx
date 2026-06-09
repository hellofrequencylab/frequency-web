'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

// After sending the magic link there's nothing more to do on this page, so we offer
// a way back home — an immediate button plus a gentle visible countdown that returns
// the visitor automatically (they're heading to their inbox anyway).
const REDIRECT_SECONDS = 15

export function ReturnHome() {
  const router = useRouter()
  const [remaining, setRemaining] = useState(REDIRECT_SECONDS)

  useEffect(() => {
    if (remaining <= 0) {
      router.push('/')
      return
    }
    const t = setTimeout(() => setRemaining((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, router])

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={() => router.push('/')}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </button>
      <p className="text-xs text-subtle" aria-live="polite">
        Returning home in {remaining}s…
      </p>
    </div>
  )
}
