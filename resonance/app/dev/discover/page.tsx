"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DiscoverFeed, WorldActivity } from "@/lib/worlds/types";

async function fetchFeed(): Promise<WorldActivity[]> {
  const res = await fetch("/api/discover", { cache: "no-store" });
  if (!res.ok) return [];
  const j = (await res.json()) as DiscoverFeed;
  return j.worlds;
}

/**
 * Cross-world discovery (build plan §18). One feed of what's happening now
 * across every world: who's here, how many rooms are live, and what's coming up.
 * The most active world leads. Per-world surfaces stay scoped; this only reads.
 */
export default function DiscoverPage() {
  const [worlds, setWorlds] = useState<WorldActivity[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const w = await fetchFeed();
      if (active) setWorlds(w);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Discover</h1>
      <p style={{ fontSize: 13 }}>
        <Link href="/">Home</Link>
      </p>

      <div style={{ display: "grid", gap: "0.75rem", margin: "1rem 0" }}>
        {worlds.map((w) => {
          const active = w.hereNow > 0 || w.liveVenues > 0;
          return (
            <div
              key={w.world.id}
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                padding: "0.75rem 1rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b>{w.world.name}</b>
                <span style={{ fontSize: 13, color: active ? "#16a34a" : "#999" }}>
                  {active
                    ? `● ${w.hereNow} here · ${w.liveVenues} live rooms`
                    : "○ quiet"}
                </span>
              </div>
              {w.upcoming.length > 0 && (
                <ul style={{ margin: "0.5rem 0 0", padding: 0, listStyle: "none" }}>
                  {w.upcoming.map((e) => (
                    <li key={e.id} style={{ fontSize: 12, color: "#888", marginTop: "0.2rem" }}>
                      {e.title}{" "}
                      <span>· {new Date(e.startsAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {worlds.length === 0 && (
          <p style={{ color: "#888" }}>Nothing happening across worlds yet.</p>
        )}
      </div>
    </main>
  );
}
