"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { VenueSummary, MediaType } from "@/lib/dj/types";

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
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Lobby</h1>

      <div style={{ display: "grid", gap: "0.75rem", margin: "1rem 0" }}>
        {venues.map((v) => {
          const live = v.isPlaying || v.djs > 0;
          return (
            <Link
              key={v.id}
              href={`/dev/room/${v.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                padding: "0.75rem 1rem",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span>
                <b>{v.name}</b>{" "}
                <span style={{ color: "#888", fontSize: 12 }}>
                  {v.theme ? `· ${v.theme} ` : ""}· {v.mediaType}
                </span>
              </span>
              <span style={{ fontSize: 13, color: live ? "#16a34a" : "#999" }}>
                {live ? `● live · ${v.djs} on deck` : "○ quiet"}
              </span>
            </Link>
          );
        })}
        {venues.length === 0 && <p style={{ color: "#888" }}>No venues yet. Create one below.</p>}
      </div>

      <section
        style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: "1rem" }}
      >
        <h3>Open a room</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name (e.g. Synthwave Lounge)"
            style={{ flex: 2, minWidth: "12rem", padding: "0.4rem" }}
          />
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="theme"
            style={{ flex: 1, minWidth: "8rem", padding: "0.4rem" }}
          />
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as MediaType)}
            style={{ padding: "0.4rem" }}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="submit">Create</button>
        </form>
      </section>
    </main>
  );
}
