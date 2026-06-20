"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/fetch";
import type { CreatorSummary } from "@/lib/creator/types";
import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge, EmptyState } from "@/components/ui";

const EMPTY: CreatorSummary = { totalZaps: 0, sales: 0, recent: [] };

async function fetchEarnings(): Promise<CreatorSummary> {
  const res = await authedFetch("/api/creator/earnings", { cache: "no-store" });
  if (!res.ok) return EMPTY;
  return (await res.json()) as CreatorSummary;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * Creator earnings (build plan §17). Shows the Zaps you have earned from other
 * people buying cosmetics you made, how many sales that is, and your recent
 * sales. Cash-out (real money) is coming later; for now earnings stay in Zaps.
 */
export default function EarningsPage() {
  const [summary, setSummary] = useState<CreatorSummary>(EMPTY);

  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await fetchEarnings();
      if (active) setSummary(data);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell>
      <h1 className="font-display text-2xl text-text">Earnings</h1>
      <p className="mt-1 text-sm text-mute">
        You earn Zaps when other people buy cosmetics you made. Cash-out is coming later;
        for now earnings stay in Zaps.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card className="flex flex-col gap-1">
          <span className="text-xs text-mute">Earned</span>
          <span className="font-display text-2xl text-text">
            {summary.totalZaps}{" "}
            <span className="text-lg text-soft">Zaps</span>
          </span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-xs text-mute">Sales</span>
          <span className="font-display text-2xl text-text">{summary.sales}</span>
        </Card>
      </div>

      <h2 className="mt-8 font-display text-lg text-text">Recent sales</h2>
      <div className="mt-3 grid gap-3">
        {summary.recent.map((sale) => (
          <Card key={sale.id} className="flex items-center justify-between gap-3">
            <span className="text-xs text-mute">{when(sale.createdAt)}</span>
            <Badge tone="spark">+{sale.amountZaps} Zaps</Badge>
          </Card>
        ))}
        {summary.recent.length === 0 && (
          <EmptyState
            title="No sales yet"
            description="List a cosmetic and people can buy it."
          />
        )}
      </div>
    </AppShell>
  );
}
