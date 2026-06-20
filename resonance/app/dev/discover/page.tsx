"use client";

import { useEffect, useState } from "react";
import type { DiscoverFeed, WorldActivity } from "@/lib/worlds/types";
import { AppShell } from "@/components/shell/AppShell";
import { Card, LiveBadge, EmptyState } from "@/components/ui";

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
    <AppShell>
      <h1 className="font-display text-2xl text-text">Discover</h1>
      <p className="mt-1 text-sm text-mute">What&apos;s live across every world right now.</p>

      <div className="mt-6 grid gap-3">
        {worlds.map((w) => {
          const isLive = w.hereNow > 0 || w.liveVenues > 0;
          return (
            <Card key={w.world.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg text-text">{w.world.name}</h2>
                {isLive ? (
                  <span className="flex items-center gap-2">
                    <LiveBadge
                      state="live"
                      count={w.hereNow}
                      aria-label={`${w.hereNow} here, ${w.liveVenues} live rooms`}
                    />
                    <span className="text-xs text-mute tabular-nums">
                      {w.liveVenues} live rooms
                    </span>
                  </span>
                ) : (
                  <LiveBadge state="quiet" />
                )}
              </div>
              {w.upcoming.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {w.upcoming.map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-x-2 text-sm text-soft">
                      <span className="text-text">{e.title}</span>
                      <span className="text-mute">{new Date(e.startsAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
        {worlds.length === 0 && (
          <EmptyState
            title="Quiet for now"
            description="Nothing happening across worlds yet. Check back soon."
          />
        )}
      </div>
    </AppShell>
  );
}
