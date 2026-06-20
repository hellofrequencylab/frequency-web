import { forwardRef } from "react";
import type { ElementType, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Card — the base surface container (DESIGN.md §5 depth, §10).
 *
 * Server-safe (no client state). A lit object that sits above the dark room:
 * a lighter surface plus a soft, cool shadow when raised, never a heavy drop
 * shadow. Renders any element via `as`.
 *
 * Props:
 *   - `as`          — element/component to render (default `div`)
 *   - `interactive` — adds a hover lift (border brightens + soft shadow). Use for
 *                     clickable tiles; pair with a real button/link via `as` so it
 *                     stays keyboard reachable.
 *   - `glow`        — applies `var(--glow-pulse)` for the live / now / you state.
 *                     This is the one surface that glows (DESIGN.md §2).
 *   - `padding`     — `none` | `sm` | `md` (default) | `lg`
 *
 * a11y: no implicit role; when `interactive`, render an actual interactive
 * element (`as="button"` / `as="a"`) so focus and keyboard work and the global
 * Pulse focus ring applies. The hover transition collapses under reduced motion.
 */
export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: ElementType;
  interactive?: boolean;
  glow?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  children?: ReactNode;
}

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as, interactive = false, glow = false, padding = "md", className, style, children, ...rest },
  ref,
) {
  const Component = (as ?? "div") as ElementType;
  return (
    <Component
      ref={ref}
      className={cn(
        "rounded-md border bg-surface text-text",
        interactive &&
          "transition-[border-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-[var(--color-hover)] hover:shadow-[var(--shadow-soft)]",
        PADDING[padding],
        className,
      )}
      style={glow ? { boxShadow: "var(--glow-pulse)", ...style } : style}
      {...rest}
    >
      {children}
    </Component>
  );
});
