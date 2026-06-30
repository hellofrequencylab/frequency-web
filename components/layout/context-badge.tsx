import { Building2, ShieldCheck } from 'lucide-react'
import type { AvailableContext, OperatorContext } from '@/lib/context/operator-context'

// THE CONTEXT BADGE — the identity treatment on the account chip FACE. It makes the hat the person
// is wearing legible at a glance, so the business identity (the "Daniel Tyack" SPACE) reads
// distinctly from the person of the same name.
//
// FRAMING ONLY (lib/context/operator-context.ts): purely presentational. It sits ALONGSIDE the real
// role badge (the context is an ADDITIONAL, clearly-labelled signal), and never replaces it.
//   • Personal  → nothing extra (the member identity is the chip's default).
//   • Operator  → the Space's brand mark + brand name (so the business reads as itself).
//   • Admin     → a small "Admin" marker.
// DAWN semantic tokens only: no hardcoded hex, no text-[10/11px].

/** The operator option matching a context, if any (carries the Space brand name + logo). */
function operatorOptionFor(
  context: OperatorContext,
  available: AvailableContext[],
): Extract<AvailableContext, { kind: 'operator' }> | null {
  if (context.kind !== 'operator') return null
  const opt = available.find(
    (a): a is Extract<AvailableContext, { kind: 'operator' }> =>
      a.kind === 'operator' && a.spaceId === context.spaceId,
  )
  return opt ?? null
}

export function ContextBadge({
  context,
  available,
}: {
  context: OperatorContext
  available: AvailableContext[]
}) {
  // Personal is the chip's default identity — no extra badge.
  if (context.kind === 'personal') return null

  if (context.kind === 'admin') {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-signal-bg px-2 py-0.5 text-3xs font-semibold leading-tight text-signal-strong">
        <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
        Admin
      </span>
    )
  }

  // Operator — the Space brand: logo (or a neutral building chip) + the brand name.
  const opt = operatorOptionFor(context, available)
  if (!opt) return null
  return (
    <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-3xs font-semibold leading-tight text-muted">
      {opt.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / SpaceCard)
        <img src={opt.logoUrl} alt="" className="h-3 w-3 shrink-0 rounded-sm object-contain" />
      ) : (
        <Building2 className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">{opt.label}</span>
    </span>
  )
}
