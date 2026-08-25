'use client'

import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

// The one door on Vera's profile (ADR-238): opens the same chat panel as her
// edge tab, via the established open-vera window event.
export function AskVeraButton() {
  return (
    <Button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-vera'))}
    >
      <Sparkles className="h-4 w-4" aria-hidden />
      Ask Vera
    </Button>
  )
}
