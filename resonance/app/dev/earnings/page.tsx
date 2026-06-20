"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/api/fetch";
import type { CreatorSummary } from "@/lib/creator/types";

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
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Earnings</h1>
      <p style={{ fontSize: 13 }}>
        <Link href="/">Home</Link> · <Link href="/dev/market">Market</Link>
      </p>
      <p style={{ fontSize: 14, color: "#555" }}>
        You earn Zaps when other people buy cosmetics you made. Cash-out is coming later;
        for now earnings stay in Zaps.
      </p>

      <div style={{ display: "flex", gap: "1.5rem", margin: "1rem 0" }}>
        <div>
          <div style={{ fontSize: 12, color: "#888" }}>Earned</div>
          <div style={{ fontSize: 22 }}>
            <b>{summary.totalZaps}</b> Zaps
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#888" }}>Sales</div>
          <div style={{ fontSize: 22 }}>
            <b>{summary.sales}</b>
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: 16 }}>Recent sales</h2>
      <div style={{ display: "grid", gap: "0.75rem", margin: "1rem 0" }}>
        {summary.recent.map((sale) => (
          <div
            key={sale.id}
            style={{
              border: "1px solid #e4e4e7",
              borderRadius: 8,
              padding: "0.75rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ color: "#888", fontSize: 12 }}>{when(sale.createdAt)}</span>
            <span>
              <b>+{sale.amountZaps}</b> Zaps
            </span>
          </div>
        ))}
        {summary.recent.length === 0 && (
          <p style={{ color: "#888" }}>No sales yet. List a cosmetic and people can buy it.</p>
        )}
      </div>
    </main>
  );
}
