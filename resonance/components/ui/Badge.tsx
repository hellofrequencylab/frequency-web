import { cn } from "@/components/ui/cn";

/**
 * Badge — a small, static status token (DESIGN.md §10).
 *
 * Non-interactive. Never signals by color alone: the caller always passes text
 * (and may pass a leading icon), so the meaning survives without the hue.
 *
 * tone:
 *   - `neutral` — raised surface, muted (default)
 *   - `pulse`   — live / now / you
 *   - `signal`  — presence, "N here", success
 *   - `spark`   — Zaps, currency, rewards
 *   - `alert`   — destructive / error
 *
 * Light accents (signal, spark) take dark on-accent text per DESIGN.md §3.3.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "pulse" | "signal" | "spark" | "alert";
}

const TONES: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-raised text-soft border",
  pulse: "bg-pulse text-text border border-transparent",
  signal: "bg-signal text-base border border-transparent",
  spark: "bg-spark text-base border border-transparent",
  alert: "bg-alert text-text border border-transparent",
};

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5",
        "text-2xs font-medium leading-none [&>svg]:h-3 [&>svg]:w-3",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
