"use client";

import { useEffect, useState } from "react";
import type { VenueSummary, MediaType } from "@/lib/dj/types";
import { AppShell } from "@/components/shell/AppShell";
import { Card, Field, Input, Select, Button, EmptyState } from "@/components/ui";
import { RoomCard } from "@/components/lobby/RoomCard";

async function fetchVenues(): Promise<VenueSummary[]> {
  const res = await fetch("/api/venues", { cache: "no-store" });
  if (!res.ok) return [];
  const j = (await res.json()) as { venues: VenueSummary[] };
  return j.venues;
}

const TYPES: MediaType[] = ["dj", "watch", "lounge", "event"];

/**
 * Venue lobby (build plan §6). Browse themed rooms and enter one. Activity
 * signals (who's spinning, whether something's playing) keep rooms from looking
 * dead. Watch-party and ambient-lounge surfaces arrive in later sections; for
 * now every room opens the DJ Room.
 */
export default function LobbyPage() {
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("dj");

  const reload = () => {
    void (async () => {
      const v = await fetchVenues();
      setVenues(v);
    })();
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const v = await fetchVenues();
      if (active) setVenues(v);
    })();
    return () => {
      active = false;
    };
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        theme: theme.trim() || undefined,
        mediaType,
      }),
    });
    setName("");
    setTheme("");
    reload();
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="space-y-1">
          <h1 className="font-display text-2xl text-text">Lobby</h1>
          <p className="text-sm text-mute">
            Pick a room and step inside, or open one of your own.
          </p>
        </header>

        {venues.length === 0 ? (
          <Card padding="none">
            <EmptyState
              title="No rooms yet"
              description="Nothing is open right now. Start one below and the floor fills in."
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {venues.map((v) => (
              <RoomCard key={v.id} venue={v} />
            ))}
          </div>
        )}

        <Card as="section" className="space-y-4">
          <h2 className="font-display text-lg text-text">Open a room</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Name" className="sm:col-span-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Synthwave Lounge"
              />
            </Field>
            <Field label="Theme">
              <Input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="optional"
              />
            </Field>
            <Field label="Type">
              <Select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as MediaType)}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Create</Button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
