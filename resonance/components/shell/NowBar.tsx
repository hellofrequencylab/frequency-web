import Link from "next/link";

/** What's playing in the room you're in, surfaced everywhere (docs/DESIGN.md §11). */
export interface NowPlaying {
  title: string;
  venue: string;
  href: string;
}

/**
 * Persistent mini now-playing bar so you never lose the room you are in. Renders
 * nothing when you are not in a room. Sits above the mobile tab bar.
 */
export function NowBar({ nowPlaying }: { nowPlaying?: NowPlaying }) {
  if (!nowPlaying) return null;
  return (
    <div className="fixed inset-x-0 bottom-14 z-20 border-t bg-surface sm:bottom-0">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-4 text-sm">
        <span className="text-pulse" aria-hidden>
          ▶
        </span>
        <span className="min-w-0 truncate">
          <b className="text-text">{nowPlaying.title}</b>{" "}
          <span className="text-mute">in {nowPlaying.venue}</span>
        </span>
        <Link href={nowPlaying.href} className="ml-auto shrink-0 text-soft hover:text-text">
          Return
        </Link>
      </div>
    </div>
  );
}
