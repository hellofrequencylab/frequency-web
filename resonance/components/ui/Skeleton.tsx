import type { CSSProperties } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Skeleton — a loading placeholder block (DESIGN.md §7).
 *
 * Server-safe. Every list and card gets one of these instead of a bare spinner
 * or a blank. A slow pulse on a raised surface reads as "content is coming."
 *
 * Props:
 *   - `width` / `height` — number (px) or any CSS length string. Default: full
 *     width, a line's height.
 *   - `rounded`          — `sm` | `md` | `lg` | `pill` (default `sm`). Use `pill`
 *     for avatar/disc placeholders.
 *
 * a11y / motion: marked `aria-hidden` (it carries no information). The pulse
 * animation collapses to a static block under `prefers-reduced-motion` via the
 * global guard in globals.css.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number | string;
  height?: number | string;
  rounded?: "sm" | "md" | "lg" | "pill";
}

const ROUNDED: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  pill: "rounded-pill",
};

function toLength(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

export function Skeleton({ width, height, rounded = "sm", className, style, ...rest }: SkeletonProps) {
  const dims: CSSProperties = {
    width: toLength(width),
    height: toLength(height),
    ...style,
  };
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse bg-raised",
        height === undefined && "h-4",
        width === undefined && "w-full",
        ROUNDED[rounded],
        className,
      )}
      style={dims}
      {...rest}
    />
  );
}
