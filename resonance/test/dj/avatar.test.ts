import { describe, it, expect } from "vitest";
import { avatarOf, AVATAR_EMOJIS, AVATAR_COLORS } from "@/components/dj/AvatarChip";

describe("avatarOf", () => {
  it("returns the provided emoji and color", () => {
    expect(avatarOf({ emoji: "🦊", color: "#abcdef" })).toEqual({
      emoji: "🦊",
      color: "#abcdef",
    });
  });

  it("falls back to defaults when config is null", () => {
    expect(avatarOf(null)).toEqual({
      emoji: AVATAR_EMOJIS[0],
      color: AVATAR_COLORS[7],
    });
  });

  it("falls back to defaults when config is undefined", () => {
    expect(avatarOf(undefined)).toEqual({
      emoji: AVATAR_EMOJIS[0],
      color: AVATAR_COLORS[7],
    });
  });

  it("falls back to defaults for an empty config", () => {
    expect(avatarOf({})).toEqual({
      emoji: AVATAR_EMOJIS[0],
      color: AVATAR_COLORS[7],
    });
  });

  it("fills only the missing half", () => {
    expect(avatarOf({ emoji: "👽" })).toEqual({
      emoji: "👽",
      color: AVATAR_COLORS[7],
    });
    expect(avatarOf({ color: "#123456" })).toEqual({
      emoji: AVATAR_EMOJIS[0],
      color: "#123456",
    });
  });
});
