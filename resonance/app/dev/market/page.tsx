"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/fetch";
import type { MarketItem, MarketView } from "@/lib/market/types";
import { AppShell } from "@/components/shell/AppShell";
import { Card, Button, Badge, EmptyState } from "@/components/ui";

async function fetchMarket(): Promise<MarketView> {
  const res = await authedFetch("/api/market", { cache: "no-store" });
  if (!res.ok) return { items: [], owned: [], balance: 0 };
  return (await res.json()) as MarketView;
}

function isPremium(item: MarketItem): boolean {
  return item.priceCents != null && item.priceZaps === 0;
}

function priceLabel(item: MarketItem): string {
  if (isPremium(item)) {
    return `$${(item.priceCents! / 100).toFixed(2)} premium`;
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
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-text">Market</h1>
          <p className="mt-1 text-sm text-mute">
            Spend Zaps on frames, colors, badges, and decor.
          </p>
        </div>
        <Badge tone="spark" aria-label={`Balance: ${balance} Zaps`}>
          {balance} Zaps
        </Badge>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const isOwned = owned.includes(item.id);
          const err = errors[item.id];
          return (
            <Card key={item.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg text-text">{item.name}</h2>
                  <p className="text-xs text-mute">{item.kind}</p>
                </div>
                {isOwned && <Badge tone="signal">Owned</Badge>}
              </div>

              <div className="flex items-center justify-between gap-3">
                <Badge tone={isPremium(item) ? "neutral" : "spark"}>
                  {priceLabel(item)}
                </Badge>
                <Button size="sm" onClick={() => void buy(item)} disabled={isOwned}>
                  {isOwned ? "Owned" : "Buy"}
                </Button>
              </div>

              {err && (
                <p className="text-xs text-alert" role="alert">
                  {err}
                </p>
              )}
            </Card>
          );
        })}
        {items.length === 0 && (
          <div className="sm:col-span-2">
            <EmptyState
              title="The shelves are empty"
              description="Nothing for sale right now. Check back soon."
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
