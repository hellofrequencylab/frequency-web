import type { DecorItem } from "@/lib/dj/types";

/** Default board dimensions. The editor and the live Room both render at this size. */
export const BOARD_WIDTH = 720;
export const BOARD_HEIGHT = 460;

/** Glyph drawn for each decor kind. Unknown kinds fall back to a neutral marker. */
export const DECOR_GLYPHS: Record<string, string> = {
  disco: "🪩",
  palm: "🌴",
  couch: "🛋️",
  speaker: "🔊",
  arcade: "🕹️",
  sign: "🪧",
  window: "🪟",
  candle: "🕯️",
  balloon: "🎈",
  art: "🖼️",
};

export function glyphFor(kind: string): string {
  return DECOR_GLYPHS[kind] ?? "❓";
}

export interface DecorCanvasProps {
  decor: DecorItem[];
  width?: number;
  height?: number;
}

/**
 * Pure, presentational decor board (build plan §13). Renders each placed item as
 * a glyph absolutely positioned at its x,y, sized by scale. No state, no
 * fetching, React-only — the live Room reuses this as a backdrop.
 */
export function DecorCanvas({ decor, width = BOARD_WIDTH, height = BOARD_HEIGHT }: DecorCanvasProps) {
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        border: "1px solid #e4e4e7",
        borderRadius: 8,
        background: "#fafafa",
        overflow: "hidden",
      }}
    >
      {decor.map((item) => (
        <span
          key={item.id}
          aria-hidden
          style={{
            position: "absolute",
            left: item.x,
            top: item.y,
            transform: "translate(-50%, -50%)",
            fontSize: 32 * (item.scale ?? 1),
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {glyphFor(item.kind)}
        </span>
      ))}
    </div>
  );
}
