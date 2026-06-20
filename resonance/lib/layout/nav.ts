/** Primary navigation for the app shell (docs/DESIGN.md §11). One source of
 * truth for the top bar and the mobile tab bar. */
export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/dev/lobby", label: "Lobby", icon: "🏠" },
  { href: "/dev/discover", label: "Discover", icon: "🧭" },
  { href: "/dev/events", label: "Events", icon: "📅" },
];

export const ACCOUNT_NAV: NavItem = { href: "/dev/account", label: "You", icon: "🙂" };
