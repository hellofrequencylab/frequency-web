"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/fetch";
import type { Profile } from "@/lib/profiles/types";

// undefined = fetch failed; null = no profile yet (guest); Profile = exists.
async function fetchProfile(): Promise<Profile | null | undefined> {
  const res = await authedFetch("/api/profile");
  if (!res.ok) return undefined;
  const j = (await res.json()) as { profile: Profile | null };
  return j.profile;
}

/** Loads the caller's profile once they're signed in, and saves edits. */
export function useProfile(ready: boolean) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      const p = await fetchProfile();
      if (!active) return;
      if (p !== undefined) setProfile(p);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [ready]);

  const save = useCallback(async (displayName: string) => {
    const res = await authedFetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    if (res.ok) {
      const j = (await res.json()) as { profile: Profile };
      setProfile(j.profile);
    }
  }, []);

  return { profile, loaded, save };
}
