'use client'
import { SiteError } from '@/components/frequency/site/shell/site-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // The boundary renders inside the site shell, so it wears the kit's hero.
  return <SiteError error={error} reset={reset} lead="Something broke on our end. Try again, or head back home." />
}
