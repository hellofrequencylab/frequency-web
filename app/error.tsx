'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-danger-bg dark:bg-danger-bg flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-danger" strokeWidth={2} />
          </div>
        </div>
        <h1 className="text-xl font-semibold text-text mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-muted leading-relaxed mb-8">
          Something broke on our end. Try again, and if it keeps happening, refresh the page.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
          >
            Try again
          </button>
          <a
            href="/feed"
            className="inline-flex items-center justify-center rounded-xl border border-border-strong px-5 py-2.5 text-sm font-semibold text-text hover:bg-surface-elevated transition-colors"
          >
            Go to feed
          </a>
        </div>
      </div>
    </div>
  )
}
