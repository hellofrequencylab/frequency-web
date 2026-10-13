// Shared table chrome for the Pages-workspace layout modules (the one table look the
// In-app and Marketing blocks reuse). Kept in a no-JSX module so both server blocks
// import the same class strings. See lib/widgets/modules.ts for the module ids.

import { buttonClasses } from '@/components/ui/button'
import { capsLabel } from '@/components/ui/caps-label'

export const TABLE_WRAP = 'overflow-x-auto rounded-card border border-border bg-surface lift-1'
export const HEAD_ROW = capsLabel('border-b border-border text-left text-meta text-subtle', 'wider')
export const TH = 'px-4 py-2.5 font-semibold'
export const BODY_ROW = 'border-b border-border/60 last:border-0'
export const VIEW_LINK = 'inline-flex items-center gap-1 text-meta text-muted hover:text-text'
export const EDIT_BTN = buttonClasses('primary', 'sm')
