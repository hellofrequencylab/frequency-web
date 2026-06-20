import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/components/ui/cn";

/**
 * PresenceChip — one person in a roster or on the stage (DESIGN.md §10).
 *
 * The per-person unit: an Avatar, a name, an optional subtitle ("on the decks"),
 * and a live dot, in a rounded-pill `bg-raised` container. Static by default;
 * pass `onClick` to render a real `<button>` with a 44px touch target and a
 * hover fill.
 *
 * Props:
 *   - `name`     — the person's name (also the Avatar's accessible label).
 *   - `config`   — avatar config (`{emoji,color}`), read via `avatarOf`.
 *   - `live`     — shows the Avatar's Signal presence dot.
 *   - `subtitle` — a small role/status line under the name (e.g. "on the decks").
 *   - `onClick`  — makes the chip a button.
 *
 * a11y: the Avatar already carries the accessible name and folds live state into
 * its label, so live is never color alone. When interactive, the `<button>`
 * keeps the kit's visible focus ring and a 44px minimum target.
 */
export interface PresenceChipProps {
  name: string;
  config?: Record<string, unknown> | null;
  live?: boolean;
  subtitle?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

export function PresenceChip({
  name,
  config,
  live = false,
  subtitle,
  onClick,
  className,
}: PresenceChipProps) {
  const interactive = typeof onClick === "function";

  const body = (
    <>
      <Avatar name={name} config={config} size="sm" live={live} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-text">{name}</span>
        {subtitle && <span className="truncate text-2xs text-mute">{subtitle}</span>}
      </span>
    </>
  );

  const base = cn(
    "inline-flex items-center gap-2 rounded-pill bg-raised border px-2.5 py-1.5 text-left",
    className,
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          base,
          "min-h-11 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-hover",
        )}
      >
        {body}
      </button>
    );
  }

  return <span className={base}>{body}</span>;
}
