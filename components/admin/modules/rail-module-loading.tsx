import { Loader2 } from 'lucide-react'

// The shared "Working…" indicator every self-fetching rail module shows while its read-gated getter is in
// flight (bug 3: "show a Working indicator when a function is taking a moment"). A calm spinner + label,
// announced politely for screen readers. Replaces the bare pulse skeletons so a slow section reads as
// LOADING, not broken/empty. One component so every rail module (and every future standardized block)
// shows the same thing.
export function RailModuleLoading({ label = 'Working…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-2xl border border-border bg-surface-elevated/50 px-4 py-6 text-sm font-medium text-muted"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary-strong" aria-hidden />
      {label}
    </div>
  )
}
