'use client'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-fg-secondary">Something went wrong.</p>
      <button onClick={reset} className="text-sm underline">Try again</button>
    </div>
  )
}
