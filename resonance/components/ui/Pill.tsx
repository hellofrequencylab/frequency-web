import { forwardRef } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Pill — a larger rounded-pill container for chips and filters (DESIGN.md §10).
 *
 * Renders as a static `<span>` by default. Pass `clickable` (or `onClick`) to
 * render a real `<button>` with a 44px touch target, hover fill, and a
 * `selected` state. Selection is shown with a Pulse border AND `aria-pressed`
 * plus a font-weight shift, never by color alone.
 *
 * selected: highlights the pill (border-pulse + subtle pulse tint)
 * clickable: forces the interactive `<button>` rendering
 */
export interface PillProps extends React.HTMLAttributes<HTMLElement> {
  selected?: boolean;
  clickable?: boolean;
}

export const Pill = forwardRef<HTMLElement, PillProps>(function Pill(
  { selected = false, clickable = false, className, children, onClick, ...rest },
  ref,
) {
  const interactive = clickable || typeof onClick === "function";

  const base = cn(
    "inline-flex items-center gap-1.5 rounded-pill px-3 text-sm",
    "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
    selected
      ? "border border-pulse bg-pulse/15 text-text font-medium"
      : "border bg-raised text-soft font-normal",
    className,
  );

  if (interactive) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
        aria-pressed={selected}
        className={cn(base, "min-h-11 hover:bg-hover")}
        {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    );
  }

  return (
    <span ref={ref as React.Ref<HTMLSpanElement>} className={cn(base, "py-1")} {...rest}>
      {children}
    </span>
  );
});
