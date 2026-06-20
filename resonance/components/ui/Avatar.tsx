import { avatarOf } from "@/components/dj/AvatarChip";
import { cn } from "@/components/ui/cn";

/**
 * Avatar + AvatarStack — the identity disc (DESIGN.md §7).
 *
 * People are the UI, so this is the base identity unit: a colored disc with an
 * emoji, scaling from a 16px presence dot to a 96px profile. The disc color is
 * the member's own avatar color (data from their config, not a design token), so
 * it is applied via inline `background`. Everything else is tokens.
 *
 * Props:
 *   - `name`   — the person's name. Used as the accessible label when the avatar
 *                stands alone (it renders as `role="img"` with an `aria-label`).
 *   - `config` — an avatar config (`{emoji,color}`), read through `avatarOf`.
 *   - `emoji` / `color` — explicit overrides (win over `config`).
 *   - `size`   — `xs`(16) `sm`(24) `md`(32) `lg`(48) `xl`(96). Default `md`.
 *   - `live`   — adds the Signal presence dot + a `var(--glow-signal)` ring.
 *   - `ring`   — draws a thin base-bg ring (used by AvatarStack to separate discs).
 *
 * a11y: the avatar is decorative-with-label. `name` becomes the accessible name
 * so the identity survives without sight of the emoji/color. Live state is shown
 * with a dot AND folded into the label ("Ada, here now"), never color alone. The
 * disc itself is not interactive; wrap it (e.g. in PresenceChip) when it needs to
 * click, and that wrapper owns the 44px target.
 */

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

/** px diameter per size step (DESIGN.md §7: 16 → 96). */
export const AVATAR_SIZES: Record<AvatarSize, number> = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 96,
};

/** The emoji is sized as a fraction of the disc so it reads at every scale. */
function emojiPx(diameter: number): number {
  return Math.round(diameter * 0.56);
}

/** Presence-dot diameter scales with the disc, with a legible floor. */
function dotPx(diameter: number): number {
  return Math.max(8, Math.round(diameter * 0.28));
}

export interface AvatarProps {
  name: string;
  config?: Record<string, unknown> | null;
  emoji?: string;
  color?: string;
  size?: AvatarSize;
  live?: boolean;
  ring?: boolean;
  className?: string;
}

export function Avatar({
  name,
  config,
  emoji,
  color,
  size = "md",
  live = false,
  ring = false,
  className,
}: AvatarProps) {
  const resolved = avatarOf(config);
  const finalEmoji = emoji ?? resolved.emoji;
  const finalColor = color ?? resolved.color;
  const diameter = AVATAR_SIZES[size];
  const dot = dotPx(diameter);

  const label = live ? `${name}, here now` : name;

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: diameter, height: diameter }}
    >
      <span
        role="img"
        aria-label={label}
        className={cn(
          "flex items-center justify-center rounded-pill leading-none select-none",
          ring && "ring-2 ring-[var(--color-base)]",
        )}
        style={{
          width: diameter,
          height: diameter,
          background: finalColor,
          fontSize: emojiPx(diameter),
          boxShadow: live ? "var(--glow-signal)" : undefined,
        }}
      >
        {finalEmoji}
      </span>
      {live && (
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 rounded-pill bg-signal ring-2 ring-[var(--color-base)]"
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  );
}

export interface AvatarStackPerson {
  userId: string;
  name: string;
  config?: Record<string, unknown> | null;
}

export interface AvatarStackProps {
  people: AvatarStackPerson[];
  size?: AvatarSize;
  /** How many discs to show before collapsing the rest into a `+N` chip. */
  max?: number;
  className?: string;
}

/**
 * AvatarStack — overlapping discs for a roster.
 *
 * Discs overlap with a negative margin and each carries a thin base-bg `ring` so
 * they read as separate people. Beyond `max`, the remainder collapses into a
 * `+N` overflow chip. The whole stack is one labelled group ("12 people here")
 * so a screen reader hears the headcount, not a dozen names in a row.
 */
export function AvatarStack({ people, size = "md", max = 5, className }: AvatarStackProps) {
  const diameter = AVATAR_SIZES[size];
  const overlap = Math.round(diameter * 0.32);
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <span
      role="group"
      aria-label={`${people.length} ${people.length === 1 ? "person" : "people"} here`}
      className={cn("inline-flex items-center", className)}
    >
      {shown.map((person, i) => (
        <span key={person.userId} style={{ marginLeft: i === 0 ? 0 : -overlap }}>
          <Avatar name={person.name} config={person.config} size={size} ring />
        </span>
      ))}
      {overflow > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "flex items-center justify-center rounded-pill bg-raised text-soft font-medium tabular-nums",
            "ring-2 ring-[var(--color-base)]",
          )}
          style={{
            width: diameter,
            height: diameter,
            marginLeft: -overlap,
            fontSize: Math.round(diameter * 0.34),
          }}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
