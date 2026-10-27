// Server projection: hidden/gated rows and arbitrary menu metadata never reach the browser.
import { canSeeMenuEl, canSeeMenuItem, effectiveMode, type MenuViewer } from '@/components/layout/menu-role';
import { applyRegistryGates } from '@/lib/menus/gates';
import type { FqIconName } from '@/components/frequency/icon';
import { safeHref } from '@/lib/page-editor/richtext';
import { isUneditedHeaderDefault } from '@/lib/menus/defaults';
import { WING_MENUS, ROUTES, FEATURES_LABEL } from './site-nav';
import type { ResolvedCategory, ResolvedItem, ResolvedMenu } from '@/lib/menus/types';
export interface PublicHeaderLink {
    id: string;
    label: string;
    href: string;
    hint?: string;
    icon?: FqIconName;
    ghost?: boolean;
    ghostTier?: string;
    ghostMessage?: string;
}
export interface PublicHeaderGroup {
    id: string;
    label: string;
    items: PublicHeaderLink[];
    children: PublicHeaderGroup[];
    design?: 'people' | 'spaces' | 'packages';
}
export interface PublicHeaderMenu {
    groups: PublicHeaderGroup[];
    links: PublicHeaderLink[];
    cards: PublicHeaderLink[];
}
export function projectPublicHeader(menu: ResolvedMenu, viewer: MenuViewer): PublicHeaderMenu | null {
    if (menu.isDefault || isUneditedHeaderDefault(menu))
        return null;
    const item = (row: ResolvedItem): PublicHeaderLink[] => {
        if (!canSeeMenuItem(row, viewer))
            return [];
        const href = safeHref(row.href);
        if (!href)
            return [];
        const ghost = effectiveMode(row, viewer.viewerRole) === 'ghost';
        return [{ id: row.id, label: row.label, href, ...(row.subheading ? { hint: row.subheading } : {}), ...(row.icon ? { icon: row.icon as FqIconName } : {}), ...(ghost ? { ghost: true, ghostTier: row.ghostTier ?? row.minAccess, ghostMessage: row.ghostMessage } : {}) }];
    };
    const group = (row: ResolvedCategory): PublicHeaderGroup[] => {
        if (!canSeeMenuEl(row, viewer, 'category'))
            return [];
        const items = row.items.flatMap(item), children = row.children.flatMap(group);
        if (!items.length && !children.length)
            return [];
        return [{ id: row.id, label: row.label?.trim() || 'More', items, children }];
    };
    const groups = menu.categories.flatMap(group);
    function hrefs(g: PublicHeaderGroup): string[] { return [...g.items.map(l => l.href), ...g.children.flatMap(hrefs)]; }
    for (const g of groups) {
        const links = hrefs(g);
        if (g.label === FEATURES_LABEL || links.some(h => h === `${ROUTES.features}#people` || h === `${ROUTES.features}#spaces`)) {
            g.design = 'packages';
            for (const side of g.children) {
                const sideLinks = hrefs(side);
                if (sideLinks.includes(`${ROUTES.features}#spaces`))
                    side.design = 'spaces';
                else if (sideLinks.includes(`${ROUTES.features}#people`))
                    side.design = 'people';
            }
        }
        else {
            const wing = WING_MENUS.map(w => ({ key: w.key, score: w.cols.flatMap(c => c.links).filter(l => !!l.href && links.includes(l.href)).length })).sort((a, b) => b.score - a.score)[0];
            if (wing?.score)
                g.design = wing.key;
        }
    }
    const cards = applyRegistryGates({ ...menu, categories: [], rootItems: menu.railCards.map(card => ({ id: card.id, label: card.title, href: card.href, position: card.position, colSpan: 1, mode: card.mode, roleModes: card.roleModes, minAccess: 'visitor', subheading: card.body })) }).rootItems.flatMap(item);
    const links = menu.rootItems.flatMap(item);
    return { groups, links: groups.length ? links : [...links, ...cards], cards: groups.length ? cards : [] };
}
