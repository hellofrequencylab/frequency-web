'use client'

import { useEffect } from 'react'

export default function GlobalError({
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
    <html lang="en">
      <body className="min-h-screen bg-gray-50 flex items-center justify-center px-4 font-sans">
        <div className="text-center max-w-sm">
          <p className="text-5xl font-bold text-gray-200 mb-4">500</p>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-8">
            A critical error occurred. Please refresh the page.
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  )
}
