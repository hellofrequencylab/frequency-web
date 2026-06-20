"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV } from "@/lib/layout/nav";
import { Avatar, Badge, cn } from "@/components/ui";

/**
 * The app's top bar (docs/DESIGN.md §11): brand, primary nav with active state,
 * a Zaps balance, and the account avatar. Sticky and translucent so the room
 * shows through. Identity is a placeholder until a session is wired in.
 */
export function TopBar() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b bg-base/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="font-display text-lg text-text">
          Resonance
        </Link>
        <nav className="hidden items-center gap-1 sm:flex">
          {PRIMARY_NAV.map((it) => {
            const active = path.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-sm px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-hover font-medium text-text" : "text-soft hover:bg-hover",
                )}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Badge tone="spark">⚡ 240</Badge>
          <Link href="/dev/account" aria-label="Your account" className="rounded-pill">
            <Avatar name="You" emoji="🙂" color="#d4d4d8" size="sm" />
          </Link>
        </div>
      </div>
    </header>
  );
}
