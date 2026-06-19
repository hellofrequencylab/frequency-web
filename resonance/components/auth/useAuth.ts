"use client";

import { useEffect, useState } from "react";
import { ensureSession } from "@/lib/auth/client";

/** Ensures an anonymous (or existing) session on mount and exposes the user id. */
export function useAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const id = await ensureSession();
      if (active) {
        setUserId(id);
        setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { userId, ready };
}
