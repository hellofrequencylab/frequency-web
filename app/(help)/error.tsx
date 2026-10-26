'use client'
import { SiteError } from '@/components/frequency/site/shell/site-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SiteError
      error={error}
      reset={reset}
      lead="This page didn’t load. Try again, or head back to the help home."
      homeHref="/help"
      homeLabel="Help home"
    />
  )
}
