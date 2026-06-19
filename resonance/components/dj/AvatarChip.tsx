/** A small identity pill: colored disc + emoji + name. Shared by the profile
 * bar, presence roster, and floating emotes. */
export function AvatarChip({
  emoji,
  color,
  name,
}: {
  emoji: string;
  color: string;
  name: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: 13 }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: color,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
        }}
      >
        {emoji}
      </span>
      <b>{name}</b>
    </span>
  );
}

export const AVATAR_EMOJIS = ["🙂", "😎", "🦊", "🐙", "🤖", "👽", "🐳", "🔥"];
export const AVATAR_COLORS = [
  "#fca5a5",
  "#fdba74",
  "#fde047",
  "#86efac",
  "#93c5fd",
  "#c4b5fd",
  "#f9a8d4",
  "#d4d4d8",
];

/** Read an avatar config into renderable emoji + color, with fallbacks. */
export function avatarOf(config: Record<string, unknown> | null | undefined): {
  emoji: string;
  color: string;
} {
  const c = (config ?? {}) as { emoji?: string; color?: string };
  return { emoji: c.emoji ?? AVATAR_EMOJIS[0], color: c.color ?? AVATAR_COLORS[7] };
}
