"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/api/fetch";
import type { DecorItem } from "@/lib/dj/types";
import { DecorCanvas, BOARD_WIDTH, glyphFor } from "./DecorCanvas";
import { Badge, Button, Card, EmptyState, Pill } from "@/components/ui";

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
    <div className="space-y-6">
      <Card as="section" padding="lg" className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-lg text-text">Palette</h2>
          <p className="text-sm text-mute">
            Pick an item, then click the board to place it. Level {level} unlocks{" "}
            {unlocked} of {PALETTE.length} items.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((p, i) => {
            const locked = i >= unlocked;
            const isSelected = selected === p.kind;
            return (
              <Pill
                key={p.kind}
                clickable
                selected={isSelected}
                aria-disabled={locked || undefined}
                onClick={() => {
                  if (locked) return;
                  setSelected(isSelected ? null : p.kind);
                }}
                aria-label={locked ? `${p.label}, locked` : p.label}
                title={locked ? `${p.label} (locked)` : p.label}
                className={locked ? "cursor-not-allowed opacity-40" : undefined}
              >
                <span aria-hidden className="text-base leading-none">
                  {glyphFor(p.kind)}
                </span>
                {p.label}
              </Pill>
            );
          })}
        </div>
      </Card>

      <Card as="section" padding="lg" className="space-y-3">
        <h2 className="font-display text-lg text-text">Board</h2>
        <div
          onClick={place}
          style={{ width: BOARD_WIDTH, maxWidth: "100%" }}
          className={selected ? "cursor-crosshair" : "cursor-default"}
        >
          <DecorCanvas decor={decor} />
        </div>
      </Card>

      <Card as="section" padding="lg" className="space-y-3">
        <h2 className="font-display text-lg text-text">Placed ({decor.length})</h2>
        {decor.length === 0 ? (
          <EmptyState
            title="Nothing placed yet"
            description="Pick an item from the palette, then click the board to place it."
          />
        ) : (
          <ul className="space-y-2">
            {decor.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-sm border bg-raised px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-soft">
                  <span aria-hidden className="text-base leading-none">
                    {glyphFor(item.kind)}
                  </span>
                  {item.kind}
                  <span className="text-mute">
                    ({item.x}, {item.y})
                  </span>
                </span>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.kind}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          loading={save === "saving"}
          onClick={() => void persist()}
        >
          {save === "saving" ? "Saving" : "Save decor"}
        </Button>
        {save === "saved" && <Badge tone="signal">Saved</Badge>}
        {save === "error" && (
          <span className="text-sm text-alert">Save failed. Try again.</span>
        )}
      </div>
    </div>
  );
}
