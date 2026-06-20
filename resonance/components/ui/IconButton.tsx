import { forwardRef } from "react";
import { cn } from "@/components/ui/cn";

/**
 * IconButton — a square, icon-only control (DESIGN.md §10).
 *
 * Always 44x44px minimum (the kit's touch target). An `aria-label` is required
 * by the type, because an icon carries no accessible name on its own. Server-safe.
 *
 * variant: `ghost` (line border) | `quiet` (no border) | `primary` (filled Pulse)
 * shape:   `rounded` (radius-sm) | `pill` (round, for on-rail controls)
 */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: the icon's accessible name (e.g. "Mute", "Add to queue"). */
  "aria-label": string;
  variant?: "ghost" | "quiet" | "primary";
  shape?: "rounded" | "pill";
}

const VARIANTS: Record<NonNullable<IconButtonProps["variant"]>, string> = {
  primary: "bg-pulse text-text border border-transparent hover:bg-[var(--color-pulse-strong)]",
  ghost: "bg-transparent text-soft border hover:bg-hover hover:text-text",
  quiet: "bg-transparent text-soft border border-transparent hover:bg-hover hover:text-text",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "ghost", shape = "rounded", disabled, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center",
        "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        shape === "pill" ? "rounded-pill" : "rounded-sm",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
