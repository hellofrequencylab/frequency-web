// Current Frequency information architecture, expressed in the existing editable-menu model.
// This changes the editor's local/default seed only; it never seeds or writes a production menu.
import { WING_MENUS, DIRECT_LINKS } from './site-nav';
import type { ResolvedCategory, ResolvedItem, ResolvedMenu } from '@/lib/menus/types';
const leaf = (id: string, label: string, href: string, position: number, hint?: string, icon?: string): ResolvedItem => ({ id, label, href, position, colSpan: 1, mode: 'active', roleModes: {}, minAccess: 'visitor', subheading: hint, icon });
const group = (id: string, label: string, position: number, items: ResolvedItem[], children: ResolvedCategory[] = []): ResolvedCategory => ({ id, label, position, colSpan: 1, items, children });
export function frequencyHeaderDefaults(): ResolvedMenu {
    const categories = WING_MENUS.map((wing, i) => group(`default:header:frequency:${wing.key}`, wing.label, i, [], wing.cols.map((col, j) => group(`default:header:frequency:${wing.key}:${j}`, col.heading, j, col.links.flatMap((link, k) => link.href ? [leaf(`default:header:frequency:${wing.key}:${j}:${k}`, link.label, link.href, k, link.hint, link.icon)] : [])))));
    return { surfaceKey: 'header', label: 'Header menu', columns: 6, categories, rootItems: DIRECT_LINKS.flatMap((link, i) => link.href ? [leaf(`default:header:frequency:direct:${i}`, link.label, link.href, i)] : []), railCards: [], isDefault: true };
}
