// Current Frequency information architecture, expressed in the existing editable-menu model.
// This changes the editor's local/default seed only; it never seeds or writes a production menu.
import { WING_MENUS, FEATURE_JOURNEYS, FEATURES_LABEL, DIRECT_LINKS, featureHref, featuresWingHref } from './site-nav';
import type { ResolvedCategory, ResolvedItem, ResolvedMenu } from '@/lib/menus/types';
const leaf = (id: string, label: string, href: string, position: number, hint?: string, icon?: string): ResolvedItem => ({ id, label, href, position, colSpan: 1, mode: 'active', roleModes: {}, minAccess: 'visitor', subheading: hint, icon });
const group = (id: string, label: string, position: number, items: ResolvedItem[], children: ResolvedCategory[] = []): ResolvedCategory => ({ id, label, position, colSpan: 1, items, children });
export function frequencyHeaderDefaults(): ResolvedMenu {
    const categories = WING_MENUS.map((wing, i) => group(`default:header:frequency:${wing.key}`, wing.label, i, [], wing.cols.map((col, j) => group(`default:header:frequency:${wing.key}:${j}`, col.heading, j, col.links.flatMap((link, k) => link.href ? [leaf(`default:header:frequency:${wing.key}:${j}:${k}`, link.label, link.href, k, link.hint, link.icon)] : [])))));
    categories.push(group('default:header:frequency:packages', FEATURES_LABEL, 2, [], FEATURE_JOURNEYS.map((side, i) => group(`default:header:frequency:features:${side.side}`, side.label, i, [leaf(`default:header:frequency:features:${side.side}:home`, side.label, featuresWingHref(side.side), 0)], side.jobs.map((job, j) => group(`default:header:frequency:features:${side.side}:${j}`, job.job, j, job.features.map((feature, k) => leaf(`default:header:frequency:features:${side.side}:${j}:${k}`, feature.label, featureHref(feature.id), k))))))));
    return { surfaceKey: 'header', label: 'Header menu', columns: 6, categories, rootItems: DIRECT_LINKS.flatMap((link, i) => link.href ? [leaf(`default:header:frequency:direct:${i}`, link.label, link.href, i)] : []), railCards: [], isDefault: true };
}
