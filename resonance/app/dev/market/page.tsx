"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/api/fetch";
import type { MarketItem, MarketView } from "@/lib/market/types";

async function fetchMarket(): Promise<MarketView> {
  const res = await authedFetch("/api/market", { cache: "no-store" });
  if (!res.ok) return { items: [], owned: [], balance: 0 };
  return (await res.json()) as MarketView;
}

function priceLabel(item: MarketItem): string {
  if (item.priceCents != null && item.priceZaps === 0) {
    return `$${(item.priceCents / 100).toFixed(2)} premium`;
  }
  return `${item.priceZaps} Zaps`;
}

/**
 * Cosmetics market (build plan §14). Spend Zaps on frames, colors, badges, and
 * decor. Premium items run on a card payment that is not live yet. Buying debits
 * your Zaps and drops the item into your inventory.
 */
export default function MarketPage() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [balance, setBalance] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reload = () => {
    void (async () => {
      const view = await fetchMarket();
      setItems(view.items);
      setOwned(view.owned);
      setBalance(view.balance);
    })();
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const view = await fetchMarket();
      if (active) {
        setItems(view.items);
        setOwned(view.owned);
        setBalance(view.balance);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const buy = async (item: MarketItem) => {
    setErrors((e) => ({ ...e, [item.id]: "" }));
    const res = await authedFetch(`/api/market/${item.id}/purchase`, {
      method: "POST",
    });
    if (res.ok) {
      reload();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setErrors((e) => ({ ...e, [item.id]: body.error ?? "Something went wrong." }));
    // A failed spend may still have moved the balance; refresh the header.
    if (res.status === 402 || res.status === 409) reload();
  };

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Market</h1>
      <p style={{ fontSize: 13 }}>
        <Link href="/">Home</Link> · <Link href="/dev/lobby">Lobby</Link>
      </p>
      <p style={{ fontSize: 14, color: "#555" }}>
        Balance: <b>{balance} Zaps</b>
      </p>

      <div style={{ display: "grid", gap: "0.75rem", margin: "1rem 0" }}>
        {items.map((item) => {
          const isOwned = owned.includes(item.id);
          const err = errors[item.id];
          return (
            <div
              key={item.id}
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                padding: "0.75rem 1rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  <b>{item.name}</b>{" "}
                  <span style={{ color: "#888", fontSize: 12 }}>
                    · {item.kind} · {priceLabel(item)}
                  </span>
                </span>
                {isOwned ? (
                  <span style={{ fontSize: 13, color: "#16a34a" }}>Owned</span>
                ) : (
                  <button onClick={() => void buy(item)}>Buy</button>
                )}
              </div>
              {err && (
                <div style={{ color: "#dc2626", fontSize: 12, marginTop: "0.35rem" }}>{err}</div>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <p style={{ color: "#888" }}>The shelves are empty right now.</p>
        )}
      </div>
    </main>
  );
}
