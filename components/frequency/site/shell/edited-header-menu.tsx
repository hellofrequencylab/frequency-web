import type { ReactNode } from 'react';
import Link from 'next/link';
import { FqIcon } from '@/components/frequency/icon';
import { GhostLink } from '@/components/layout/ghost-link';
import type { PublicHeaderGroup, PublicHeaderLink } from '@/lib/frequency/header-projection';
import { WING_MENUS } from '@/lib/frequency/site-nav';
export function EditedHeaderLink({ link, className = 'mm-link', children }: {
    link: PublicHeaderLink;
    className?: string;
    children?: ReactNode;
}) {
    const content = children ?? (className === 'mm-link' ? <><i className="mm-ic"><FqIcon name={link.icon ?? 'compass'}/></i><span><b>{link.label}</b>{link.hint && <small>{link.hint}</small>}</span></> : className === 'mm-card' ? <><span className="mm-shade"/><span className="mm-ct"><b>{link.label}</b>{link.hint && <small>{link.hint}</small>}</span><span className="fq-grain" aria-hidden="true"/></> : link.label);
    return link.ghost ? <GhostLink className={className} ghostTier={link.ghostTier} ghostMessage={link.ghostMessage} ariaLabel={link.label}>{content}</GhostLink> : <Link className={className} href={link.href}>{content}</Link>;
}
function Column({ group }: {
    group: PublicHeaderGroup;
}) {
    return <div className="mm-col"><span className="mm-h">{group.label}</span>{group.items.map(link => <EditedHeaderLink key={link.id} link={link}/>)}{group.children.map(child => <Column key={child.id} group={child}/>)}</div>;
}
/** Uses the existing Frequency panel classes; editorial data replaces links, not the shell. */
export function EditedHeaderPanel({ group, cards = [] }: {
    group: PublicHeaderGroup;
    cards?: PublicHeaderLink[];
}) {
    const wing = WING_MENUS.find(wing => wing.key === group.design);
    const destinations = (row: PublicHeaderGroup): PublicHeaderLink[] => [...row.items, ...row.children.flatMap(destinations)];
    const links = destinations(group);
    const artwork = wing?.cards.flatMap(card => { const link = links.find(link => link.href === card.href); return link ? [{ card, link }] : []; }) ?? [];
    const footerLink = links.find(link => link.href === wing?.foot.cta.href);
    if (group.design === 'packages')
        return <><div className="mm-fx">{group.children.map(side => <div key={side.id} className="mm-fxs" data-wing={side.design === 'spaces' ? 'spaces' : 'community'}>{side.items.length ? side.items.map((link, i) => <EditedHeaderLink key={link.id} link={i === 0 ? { ...link, label: side.label } : link} className="mm-fxh"/>) : <span className="mm-fxh">{side.label}</span>}<div className="mm-fxrow">{side.children.map(job => <div className="mm-fxj" key={job.id}><span className="mm-h">{job.label}</span><div className="mm-pkf">{job.items.map(link => <EditedHeaderLink key={link.id} link={link} className=""/>)}{job.children.map(child => <Column key={child.id} group={child}/>)}</div></div>)}</div></div>)}{group.items.map(link => <EditedHeaderLink key={link.id} link={link}/>)}</div><div className="mm-foot"><span>Open any feature to see how it works.</span><Link className="btn fq-iri-btn" href="/features">All features →</Link></div>{cards.length > 0 && <div className="mm-cards">{cards.map(card => <EditedHeaderLink key={card.id} link={card} className="mm-card"/>)}</div>}</>;
    return <><div className="mm-grid" data-wing={group.design === 'people' ? 'community' : 'spaces'}>{group.items.length > 0 && <div className="mm-col">{group.items.map(link => <EditedHeaderLink key={link.id} link={link}/>)}</div>}{group.children.map(child => <Column key={child.id} group={child}/>)}{cards.length > 0 ? <div className="mm-cards">{cards.map(card => <EditedHeaderLink key={card.id} link={card} className="mm-card"/>)}</div> : wing && <div className="mm-cards">{artwork.map(({ card, link }) => <EditedHeaderLink className="mm-card" link={{ ...link, label: card.title }} key={card.title}><span className="mm-img" style={{ backgroundImage: `url('${card.photo}')` }}/><span className="mm-shade"/><span className="mm-ct"><span className="mm-k">{card.kicker}</span><b>{card.title}</b></span><span className="fq-grain" aria-hidden="true"/></EditedHeaderLink>)}</div>}</div>{wing && <div className="mm-foot"><span>{wing.foot.line}</span>{footerLink && <EditedHeaderLink className="btn fq-iri-btn" link={{ ...footerLink, label: `${wing.foot.cta.label} →` }}/>}</div>}</>;
}
export function EditedHeaderMobile({ group }: {
    group: PublicHeaderGroup;
}) {
    if (!group.children.length && group.items.length === 1)
        return <EditedHeaderLink link={{ ...group.items[0], label: group.label }} className="mm-shlink"/>;
    return <details><summary>{group.label}</summary>{group.items.map(link => <EditedHeaderLink key={link.id} link={link}/>)}{group.children.map(child => <EditedHeaderMobile key={child.id} group={child}/>)}</details>;
}
/** Include authorized editorial destinations in the existing site search, without
 * turning ghost previews into direct navigation or changing the empty-query index. */
export function searchEditedHeader(query: string, menu: {
    groups: PublicHeaderGroup[];
    links: PublicHeaderLink[];
    cards?: PublicHeaderLink[];
} | null): PublicHeaderLink[] {
    const needle = query.trim().toLowerCase();
    if (!needle || !menu)
        return [];
    const walk = (group: PublicHeaderGroup): PublicHeaderLink[] => [...group.items, ...group.children.flatMap(walk)];
    return [...menu.links, ...menu.groups.flatMap(walk), ...(menu.cards ?? [])].filter(link => !link.ghost && `${link.label} ${link.hint ?? ''}`.toLowerCase().includes(needle));
}
