import { cn } from "@/components/ui/cn";

/**
 * LiveBadge — the "N here" / "live" status token (DESIGN.md §10).
 *
 * Shows whether a room is alive and, optionally, how many people are in it. When
 * live it renders a Signal-green dot next to a label; when quiet it goes muted.
 * The state is always carried by the dot AND the words ("live", "quiet"), never
 * by color alone (DESIGN.md §8).
 *
 * Props:
 *   - `state` — `'live'` or `'quiet'`. Default `'quiet'`.
 *   - `count` — people here. When given, the label leads with the headcount
 *               ("12 here"); the bare state word is the fallback.
 *
 * a11y: non-interactive `<span>`. The dot is `aria-hidden`; the label text gives
 * a screen reader the full status, so the green never stands alone.
 */
export interface LiveBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  state?: "live" | "quiet";
  count?: number;
}

export function LiveBadge({ state = "quiet", count, className, ...rest }: LiveBadgeProps) {
  const isLive = state === "live";

  // Visible label: lead with the headcount when given, else the bare state word.
  const text = typeof count === "number" ? `${count} here` : isLive ? "live" : "quiet";

  // Accessible label: name the state so the meaning never rides on color alone.
  const label = typeof count === "number" ? `${count} here, ${state}` : state;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5",
        "text-2xs font-medium leading-none tabular-nums",
        isLive ? "bg-signal/15 border-transparent text-signal" : "bg-raised text-mute",
        className,
      )}
      aria-label={label}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-pill",
          isLive ? "bg-signal" : "bg-mute/60",
        )}
        style={isLive ? { boxShadow: "var(--glow-signal)" } : undefined}
      />
      {text}
    </span>
  );
}
