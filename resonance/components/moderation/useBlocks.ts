"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/fetch";

/**
 * Loads the caller's block list and exposes block/unblock/isBlocked. Reusable
 * primitive: room and space UIs can call isBlocked(userId) to filter people the
 * caller has hidden. Self-contained; it owns its own fetch and state.
 */
export function useBlocks() {
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const res = await authedFetch("/api/blocks", { cache: "no-store" });
    if (!res.ok) {
      setBlocked([]);
      setLoading(false);
      return;
    }
    const j = (await res.json()) as { blocked: string[] };
    setBlocked(j.blocked ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await authedFetch("/api/blocks", { cache: "no-store" });
      if (!active) return;
      if (!res.ok) {
        setBlocked([]);
        setLoading(false);
        return;
      }
      const j = (await res.json()) as { blocked: string[] };
      setBlocked(j.blocked ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const block = useCallback(
    async (userId: string) => {
      await authedFetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedUserId: userId }),
      });
      await reload();
    },
    [reload],
  );

  const unblock = useCallback(
    async (userId: string) => {
      await authedFetch("/api/blocks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedUserId: userId }),
      });
      await reload();
    },
    [reload],
  );

  const isBlocked = useCallback((userId: string) => blocked.includes(userId), [blocked]);

  return { blocked, loading, block, unblock, isBlocked, reload };
}
