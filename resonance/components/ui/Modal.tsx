"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Modal — a controlled overlay dialog with a mobile Sheet variant (DESIGN.md §8).
 *
 * Accessibility is the point of this component:
 *   - `role="dialog"` + `aria-modal="true"` + a labelled title (`aria-labelledby`).
 *   - Focus moves into the dialog on open and is TRAPPED inside (Tab / Shift+Tab
 *     cycle the focusable children).
 *   - Closes on Escape and on a click of the dim scrim.
 *   - Restores focus to the element that was focused before it opened, on close.
 *   - Locks body scroll while open.
 *
 * Visual: a dim scrim over the room; the panel is a raised surface with the soft
 * shadow (no heavy drop shadow). On small screens it renders as a bottom Sheet
 * that slides up with a rounded-lg top; on larger screens a centered dialog.
 * Entrance uses `var(--dur-base) var(--ease-out)` and collapses under the global
 * reduced-motion guard.
 *
 * Props (controlled):
 *   - `open`     — whether the dialog is shown.
 *   - `onClose`  — called on Escape, scrim click, or close affordance.
 *   - `title`    — the accessible, visible title (required for labelling).
 *   - `children` — the dialog body.
 *   - `footer`   — optional actions row pinned at the bottom.
 *   - `variant`  — `auto` (default: Sheet on mobile, centered above) | `dialog` |
 *                  `sheet`. Force a shape when the content calls for it.
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  variant?: "auto" | "dialog" | "sheet";
}

const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, variant = "auto" }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Capture the previously focused element and move focus into the dialog.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }

    return () => {
      // Restore focus to the trigger on close/unmount.
      restoreRef.current?.focus?.();
    };
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  const asSheet = variant === "sheet" || variant === "auto";
  const asDialog = variant === "dialog" || variant === "auto";

  return (
    <div
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center"
      // align to bottom for the sheet shape, recentred at >=sm below
      style={{ alignItems: asSheet ? "flex-end" : undefined }}
    >
      {/* Dim scrim — click to close. */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[oklch(0_0_0_/_0.6)] motion-safe:animate-[rs-modal-fade_var(--dur-base)_var(--ease-out)]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col bg-raised text-text shadow-[var(--shadow-soft)] outline-none",
          // Mobile sheet shape
          asSheet && "rounded-t-lg border-t",
          // Desktop centered dialog shape
          asDialog && "sm:max-w-md sm:rounded-lg sm:border",
          // Reset the mobile sheet roundedness at >=sm when auto
          variant === "auto" && "sm:rounded-lg sm:border-t-0",
          "motion-safe:animate-[rs-sheet-in_var(--dur-base)_var(--ease-out)]",
          asDialog && "sm:motion-safe:animate-[rs-modal-in_var(--dur-base)_var(--ease-out)]",
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <h2 id={titleId} className="font-display text-lg text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-mute transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-hover hover:text-text"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4">{children}</div>

        {footer && <footer className="flex justify-end gap-2 border-t px-5 py-4">{footer}</footer>}
      </div>

      {/* Local keyframes; tokens drive timing, the global guard zeroes them out. */}
      <style>{`
        @keyframes rs-modal-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rs-modal-in { from { opacity: 0; transform: translateY(8px) scale(0.98) } to { opacity: 1; transform: none } }
        @keyframes rs-sheet-in { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  );
}

/**
 * Sheet — a thin alias that forces the bottom-sheet shape on every breakpoint.
 * Same controlled API and the same focus trap / Escape / scrim behaviour as
 * Modal; use it when the content is mobile-style on desktop too.
 */
export function Sheet(props: Omit<ModalProps, "variant">) {
  return <Modal {...props} variant="sheet" />;
}
