import { cn } from '@/lib/utils'

// CHIP (SCAN-1133). The kit's `.chip` for a button or link that is a choice, not an action: the
// idle chip is a quiet 4% ink pill, the selected one `.chip.on` is solid ink
// (design_handoff/frequency/templates/members/app/app.css). A selected chip is a state, so it never
// paints the action fill (`bg-primary`); that is `buttonClasses('primary')` and only for the one thing
// the page wants done. Segmented rows of several choices use SegmentedControl instead.
export function chipClasses(selected: boolean, className?: string): string {
  return cn('chip', selected && 'on', className)
}
