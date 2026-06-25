// Shared table chrome for the Pages-workspace layout modules (the one table look the
// In-app and Marketing blocks reuse). Kept in a no-JSX module so both server blocks
// import the same class strings. See lib/widgets/modules.ts for the module ids.

export const TABLE_WRAP = 'overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm'
export const HEAD_ROW = 'border-b border-border text-left text-xs uppercase tracking-wider text-subtle'
export const TH = 'px-4 py-2.5 font-semibold'
export const BODY_ROW = 'border-b border-border/60 last:border-0'
export const VIEW_LINK = 'inline-flex items-center gap-1 text-xs text-muted hover:text-text'
export const EDIT_BTN =
  'inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover'
