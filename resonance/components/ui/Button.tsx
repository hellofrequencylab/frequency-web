import { forwardRef } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Button — the primary text action of the kit (DESIGN.md §10).
 *
 * Token-driven, server-safe (no client state). Forwards a ref and all native
 * `<button>` attributes.
 *
 * variant:
 *   - `primary` — filled Pulse accent, the one obvious move (hover → pulse-strong)
 *   - `ghost`   — transparent with a line border, hover fills with the hover token
 *   - `quiet`   — no border, hover fills (low-emphasis inline action)
 *   - `danger`  — destructive; alert text on a subtle alert tint
 * size: `sm` | `md` (both keep a 44px minimum touch target)
 * loading: shows a spinner and disables the button (also sets aria-busy)
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "quiet" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-pulse text-text border border-transparent hover:bg-[var(--color-pulse-strong)]",
  ghost: "bg-transparent text-soft border hover:bg-hover hover:text-text",
  quiet: "bg-transparent text-soft border border-transparent hover:bg-hover hover:text-text",
  danger:
    "bg-alert/15 text-alert border border-alert/30 hover:bg-alert/25",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "min-h-11 px-3 text-sm gap-1.5",
  md: "min-h-11 px-4 text-sm gap-2",
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-pill border-2 border-current border-r-transparent opacity-80"
    />
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, type, ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-medium",
        "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});
