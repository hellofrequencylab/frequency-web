import Link from 'next/link'
import { Radio } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center">
            <Radio className="w-8 h-8 text-indigo-500" strokeWidth={2} />
          </div>
        </div>
        <p className="text-5xl font-bold text-gray-200 dark:text-gray-800 mb-4 tabular-nums">
          404
        </p>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50 mb-2">
          Page not found
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-8">
          This page doesn&apos;t exist or may have moved.
        </p>
        <Link
          href="/feed"
          className="inline-flex items-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          Back to feed
        </Link>
      </div>
    </div>
  )
}
