"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/api/fetch";
import type { DecorItem } from "@/lib/dj/types";
import { DecorCanvas, BOARD_WIDTH, glyphFor } from "./DecorCanvas";

/** The decor palette, in unlock order. `level` gates how many entries are usable. */
const PALETTE: Array<{ kind: string; label: string }> = [
  { kind: "disco", label: "disco ball" },
  { kind: "palm", label: "palm" },
  { kind: "couch", label: "couch" },
  { kind: "speaker", label: "speaker" },
  { kind: "sign", label: "sign" },
  { kind: "arcade", label: "arcade" },
  { kind: "window", label: "window" },
  { kind: "candle", label: "candle" },
  { kind: "balloon", label: "balloon" },
  { kind: "art", label: "art" },
];

/** How many palette entries a venue level unlocks. */
function unlockedCount(level: number): number {
  if (level >= 3) return PALETTE.length;
  if (level >= 2) return 8;
  return 5;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function newId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface DecorEditorProps {
  venueId: string;
  initialDecor: DecorItem[];
  level: number;
}

/**
 * Decor editor (build plan §13). Pick a palette item, then click the board to
 * place it. Placed items list with a remove control. Save persists the layout.
 */
export function DecorEditor({ venueId, initialDecor, level }: DecorEditorProps) {
  const [decor, setDecor] = useState<DecorItem[]>(initialDecor);
  const [selected, setSelected] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");

  const unlocked = unlockedCount(level);

  const place = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selected) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    setDecor((d) => [...d, { id: newId(), kind: selected, x, y }]);
    setSave("idle");
  };

  const remove = (id: string) => {
    setDecor((d) => d.filter((item) => item.id !== id));
    setSave("idle");
  };

  const persist = async () => {
    setSave("saving");
    const res = await authedFetch(`/api/venues/${venueId}/decor`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decor }),
    });
    if (res.ok) {
      const j = (await res.json()) as { decor: DecorItem[] };
      setDecor(j.decor);
      setSave("saved");
    } else {
      setSave("error");
    }
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div>
        <h3 style={{ margin: "0 0 0.5rem" }}>Palette</h3>
        <p style={{ margin: "0 0 0.5rem", color: "#888", fontSize: 13 }}>
          Pick an item, then click the board to place it. Level {level} unlocks {unlocked} of{" "}
          {PALETTE.length} items.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {PALETTE.map((p, i) => {
            const locked = i >= unlocked;
            const isSelected = selected === p.kind;
            return (
              <button
                key={p.kind}
                type="button"
                disabled={locked}
                onClick={() => setSelected(isSelected ? null : p.kind)}
                title={locked ? `${p.label} (locked)` : p.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "0.4rem 0.6rem",
                  border: `2px solid ${isSelected ? "#16a34a" : "#e4e4e7"}`,
                  borderRadius: 8,
                  background: "#fff",
                  cursor: locked ? "not-allowed" : "pointer",
                  opacity: locked ? 0.35 : 1,
                  fontFamily: "system-ui",
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{glyphFor(p.kind)}</span>
                <span style={{ fontSize: 11, color: "#666" }}>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 style={{ margin: "0 0 0.5rem" }}>Board</h3>
        <div
          onClick={place}
          style={{ width: BOARD_WIDTH, maxWidth: "100%", cursor: selected ? "crosshair" : "default" }}
        >
          <DecorCanvas decor={decor} />
        </div>
      </div>

      <div>
        <h3 style={{ margin: "0 0 0.5rem" }}>Placed ({decor.length})</h3>
        {decor.length === 0 ? (
          <p style={{ color: "#888", fontSize: 13 }}>Nothing placed yet. Pick an item above.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.25rem" }}>
            {decor.map((item) => (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  border: "1px solid #e4e4e7",
                  borderRadius: 6,
                  padding: "0.3rem 0.6rem",
                  fontSize: 13,
                }}
              >
                <span>
                  {glyphFor(item.kind)} {item.kind}{" "}
                  <span style={{ color: "#aaa" }}>
                    ({item.x}, {item.y})
                  </span>
                </span>
                <button type="button" onClick={() => remove(item.id)} style={{ fontSize: 12 }}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button type="button" onClick={() => void persist()} disabled={save === "saving"}>
          {save === "saving" ? "Saving..." : "Save decor"}
        </button>
        {save === "saved" && <span style={{ color: "#16a34a", fontSize: 13 }}>Saved</span>}
        {save === "error" && (
          <span style={{ color: "#dc2626", fontSize: 13 }}>Save failed. Try again.</span>
        )}
      </div>
    </div>
  );
}
