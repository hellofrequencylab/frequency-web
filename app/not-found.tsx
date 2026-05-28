import Link from 'next/link'
import { Radio } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-primary-bg flex items-center justify-center">
            <Radio className="w-8 h-8 text-primary-strong" strokeWidth={2} />
          </div>
        </div>
        <p className="text-5xl font-bold text-subtle/60 dark:text-text mb-4 tabular-nums">
          404
        </p>
        <h1 className="text-xl font-semibold text-text mb-2">
          Page not found
        </h1>
        <p className="text-sm text-muted leading-relaxed mb-8">
          This page doesn&apos;t exist or may have moved.
        </p>
        <Link
          href="/feed"
          className="inline-flex items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
        >
          Back to feed
        </Link>
      </div>
    </div>
  )
}
