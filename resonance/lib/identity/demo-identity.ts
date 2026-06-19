"use client";

/**
 * TEMPORARY stand-in identity for the dev surfaces, until real auth lands
 * (build plan §3). Generates a stable per-browser uuid + a friendly name and
 * keeps them in localStorage so each tab/window is a distinct "user".
 *
 * Do NOT use this for anything trust-bearing. Once Supabase Auth is wired, user
 * identity comes from the verified session, never from the client.
 */
const ID_KEY = "resonance.demo.userId";
const NAME_KEY = "resonance.demo.name";

const ADJECTIVES = ["Sunny", "Mellow", "Cosmic", "Velvet", "Neon", "Quiet", "Bright", "Lunar"];
const NOUNS = ["Otter", "Comet", "Fern", "Echo", "Maple", "Pixel", "Wren", "Drift"];

/** Pick with crypto randomness (keeps the security scanner happy even though the
 * name is purely cosmetic). */
function pick<T>(arr: T[]): T {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return arr[buf[0] % arr.length];
}

export function getDemoIdentity(): { userId: string; name: string } {
  if (typeof window === "undefined") return { userId: "", name: "" };
  let userId = localStorage.getItem(ID_KEY);
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(ID_KEY, userId);
  }
  let name = localStorage.getItem(NAME_KEY);
  if (!name) {
    name = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
    localStorage.setItem(NAME_KEY, name);
  }
  return { userId, name };
}
