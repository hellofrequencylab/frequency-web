"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV, ACCOUNT_NAV } from "@/lib/layout/nav";
import { cn } from "@/components/ui";

const TABS = [...PRIMARY_NAV, ACCOUNT_NAV];

/** Bottom tab bar for phones (docs/DESIGN.md §11/§12). Hidden at sm and up. */
export function MobileTabBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex h-14 border-t bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {TABS.map((t) => {
        const active = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-2xs",
              active ? "text-pulse" : "text-mute",
            )}
          >
            <span className="text-base" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
