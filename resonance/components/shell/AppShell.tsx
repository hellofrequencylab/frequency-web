import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { MobileTabBar } from "./MobileTabBar";
import { NowBar, type NowPlaying } from "./NowBar";

export type { NowPlaying };

/**
 * The one shell every interior page composes (docs/DESIGN.md §11): a sticky top
 * bar, a centered content column with an optional desktop context rail, the
 * persistent NowBar, and the mobile tab bar. Pages fill the content; they never
 * re-declare chrome.
 */
export function AppShell({
  children,
  rail,
  nowPlaying,
}: {
  children: ReactNode;
  /** Optional desktop-only context rail (roster, chat) beside the content. */
  rail?: ReactNode;
  /** The room you're in, surfaced in the NowBar. */
  nowPlaying?: NowPlaying;
}) {
  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="mx-auto flex max-w-5xl gap-6 px-4 py-6 pb-28 sm:pb-24">
        <main className="min-w-0 flex-1">{children}</main>
        {rail && <aside className="hidden w-72 shrink-0 lg:block">{rail}</aside>}
      </div>
      <NowBar nowPlaying={nowPlaying} />
      <MobileTabBar />
    </div>
  );
}
