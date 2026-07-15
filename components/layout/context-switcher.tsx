'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Building2, User, ShieldCheck, ArrowUpRight } from 'lucide-react'
import { setOperatorContext } from '@/app/(main)/context-actions'
import type { AvailableContext, OperatorContext } from '@/lib/context/operator-context'
import { sameContext, serializeContext, OPERATING_HUB } from '@/lib/context/operator-context'

// THE OPERATOR-IDENTITY CONTEXT SWITCHER — "You're in". Lives in the left profile dock's slide-up
// menu, beneath the view-as control. It lets one person (a platform admin who also OWNS a Space and
// is a personal member elsewhere) frame WHICH HAT they are wearing, so the business identity reads
// distinctly from the person of the same name.
//
// FRAMING ONLY (lib/context/operator-context.ts): picking a context records a presentational cookie
// and routes to that identity's home — it grants NO power. The server resolves the available set
// from real authority and passes it down; this island only ever renders what the server allowed.
//
// The dock panel clips its children (overflow-hidden, for the rise/collapse animation), so the menu
// is rendered through a portal pinned above the trigger — it can't be clipped and opens upward, just
// like ViewAsControl.

/** The per-kind glyph + the row label treatment. */
function ContextIcon({ option }: { option: AvailableContext }) {
  if (option.kind === 'personal') return <User className="h-4 w-4 shrink-0 text-muted" aria-hidden />
  if (option.kind === 'admin') return <ShieldCheck className="h-4 w-4 shrink-0 text-muted" aria-hidden />
  // Operator: the Space's brand logo when present, else a neutral building chip.
  if (option.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / SpaceCard)
      <img
        src={option.logoUrl}
        alt=""
        className="h-4 w-4 shrink-0 rounded-sm border border-border object-contain"
      />
    )
  }
  return <Building2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
}

/** The active-context label shown on the trigger ("Personal" / a Space brand / "Admin"). */
function activeLabel(context: OperatorContext, available: AvailableContext[]): string {
  if (context.kind === 'operator') {
    const opt = available.find((a) => a.kind === 'operator' && a.spaceId === context.spaceId)
    return opt?.label ?? 'Personal'
  }
  if (context.kind === 'admin') return available.find((a) => a.kind === 'admin')?.label ?? 'Admin'
  return 'Personal'
}

export function ContextSwitcher({
  context,
  available,
}: {
  /** The server-resolved EFFECTIVE context (already re-validated). */
  context: OperatorContext
  /** Every context the caller may switch into (server-derived from real authority). */
  available: AvailableContext[]
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null)
  const [isPending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Position the portal menu, and pick the direction by where the trigger sits: open DOWNWARD when the
  // trigger is in the top half of the viewport (the mobile drawer, where opening up runs off the top),
  // else upward (a bottom-anchored rail). Keeps it in view on resize.
  function place() {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight / 2) {
      setAnchor({ left: r.left, top: r.bottom + 6, width: r.width })
    } else {
      setAnchor({ left: r.left, bottom: window.innerHeight - r.top + 6, width: r.width })
    }
  }

  useEffect(() => {
    if (!open) return
    place()
    function onOutside(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // Only one context (Personal) means nothing to switch — render nothing (no empty control).
  if (available.length <= 1) return null

  const operatorOptions = available.filter((a) => a.kind === 'operator')

  function choose(target: OperatorContext) {
    setOpen(false)
    startTransition(async () => {
      const { href } = await setOperatorContext(serializeContext(target))
      // Full navigation so the new identity's framing + landing is reflected everywhere.
      window.location.href = href
    })
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
      >
        <span className="text-3xs font-semibold uppercase tracking-wider text-subtle">In</span>
        <span className="flex-1 truncate text-left">{activeLabel(context, available)}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        anchor &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              left: anchor.left,
              ...(anchor.top != null ? { top: anchor.top } : { bottom: anchor.bottom }),
              width: Math.max(anchor.width, 208),
            }}
            className="z-[60] rounded-xl border border-border bg-surface-elevated py-1 shadow-xl shadow-black/10"
          >
            <p className="px-3 py-1.5 text-3xs font-semibold uppercase tracking-wider text-subtle">
              You&apos;re in
            </p>
            {available.map((option) => {
              const target: OperatorContext =
                option.kind === 'operator'
                  ? { kind: 'operator', spaceId: option.spaceId }
                  : option.kind === 'admin'
                    ? { kind: 'admin' }
                    : { kind: 'personal' }
              const active = sameContext(context, target)
              const key = serializeContext(target)
              return (
                <button
                  key={key}
                  role="menuitem"
                  onClick={() => choose(target)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text transition-colors hover:bg-surface"
                >
                  <ContextIcon option={option} />
                  <span className="flex-1 truncate text-left">{option.label}</span>
                  {active && <Check className="ml-auto h-3.5 w-3.5 text-primary-strong" />}
                </button>
              )
            })}

            {/* The operator's front door — only when they run at least one Space. */}
            {operatorOptions.length > 0 && (
              <div className="mt-1 border-t border-border pt-1">
                <a
                  role="menuitem"
                  href={OPERATING_HUB}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface"
                >
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted" />
                  Manage your spaces
                </a>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
