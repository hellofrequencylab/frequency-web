"use client";

import { cloneElement, isValidElement, useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Tooltip — a small label that appears on hover AND keyboard focus (DESIGN.md §8).
 *
 * Wraps a single focusable child (a button, link, IconButton, ...). It is not
 * hover-only: it shows on focus too, and the child is wired to the tip via
 * `aria-describedby`, so screen-reader and keyboard users get the same hint.
 *
 * Props:
 *   - `content`  — the tip text/nodes (required).
 *   - `children` — exactly one focusable React element.
 *   - `side`     — `top` (default) | `bottom` | `left` | `right`.
 *
 * a11y: the tip has `role="tooltip"` and a stable id; the child gains
 * `aria-describedby` pointing at it. The tip is always rendered (for SR access)
 * and only visually shown while open. Entrance uses the fast motion token and
 * collapses under the global reduced-motion guard.
 */
export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}

const SIDE: Record<NonNullable<TooltipProps["side"]>, string> = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  if (!isValidElement(children)) {
    return children;
  }

  const childProps = children.props as Record<string, unknown>;
  const describedBy = [childProps["aria-describedby"], id].filter(Boolean).join(" ");

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  const trigger = cloneElement(children, {
    "aria-describedby": describedBy,
    onMouseEnter: (e: React.MouseEvent) => {
      (childProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (childProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      (childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      (childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
      hide();
    },
  } as Record<string, unknown>);

  return (
    <span
      className="relative inline-flex"
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
    >
      {trigger}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-xs",
          "rounded-sm border bg-raised px-2 py-1 text-xs text-soft",
          "shadow-[var(--shadow-soft)]",
          "transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out)]",
          SIDE[side],
          open ? "opacity-100" : "opacity-0",
        )}
        // Hidden from the a11y tree only when it has no useful text rendered; we
        // keep it in the tree so aria-describedby always resolves.
        aria-hidden={open ? undefined : "true"}
      >
        {content}
      </span>
    </span>
  );
}
