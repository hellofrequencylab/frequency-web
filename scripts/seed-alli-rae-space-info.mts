// Fill the Alli Rae Design & Build SPACE PAGE (the member-app profile, not the website) from her site's own content:
// business info (address, hours, phone, email, website, socials, story, the eight services), the FAQ, the cover and logo,
// and a profile layout that shows the filled blocks and hides the ones with nothing behind them. Prints ONE SQL
// transaction the owner pastes into the Supabase SQL editor. The website, menu and footer are not touched.
//
// Guarded: stops unless exactly one Space has slug `alliraebuilddesign`. Backs up the Space row and its FAQ first.
// Safe to re-run: the FAQ is replaced as a set, and the profile keys are merged over whatever else is in preferences.
//
//   node --experimental-strip-types --no-warnings scripts/seed-alli-rae-space-info.mts > update-alli-rae-space-5.sql

import { ALLI_RAE_SLUG } from '../lib/sites/alli-rae-site.ts'

const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")
const q = (s: string) => `'${s.replace(/'/g, "''")}'`

const SITE = 'https://alliraebuilddesign.frequencylocal.com'
const SERVICES = [
  ['Due Diligence + Planning', 'Know the land, the zoning and the numbers before a single line is drawn.'],
  ['Permitting + Entitlements', 'We expedite the permits so the plans you love become a project you can build.'],
  ['Architectural Layouts', 'Layouts, finishes and flow shaped around the way you live.'],
  ['Landscape Design', 'Outdoor rooms designed with the house, not after it.'],
  ['Interior Design', 'From tile and lighting to cabinetry lines and throw pillows.'],
  ['General Construction', 'Hands-on builder-level execution. What we draw, we build.'],
  ['Owner Representation', 'One team that protects your design and your budget from first sketch to final styling.'],
  ['Hourly Consulting', 'Virtual meetings or in-person site walks for development, zoning, permitting, planning, design or construction questions.'],
] as const

const FAQS = [
  ['How early should we bring you into the process?', 'As early as possible, even before architectural plans are finalized. We can help shape the vision, streamline decision-making, and ensure that your design choices are realistic for the build. Whether you’re starting with a blank slate or halfway through, we’ll meet you where you are.'],
  ['Do I need to have plans or an architect first?', 'Not at all. Many of our clients come to us with only a vision. We help fill in the blanks. We can collaborate with your architect or bring in our own design team to develop your home from the ground up.'],
  ['What’s your typical project size or scope?', 'We specialize in full-home custom homes, remodels and large renovations. While every project is unique, most of our work ranges from $1M to $5M+. If you’re not sure where yours fits, we’re happy to talk through it.'],
  ['How involved will I need to be in the process?', 'That’s entirely up to you. Some clients love picking every finish; others want full trust and minimal meetings. We offer clear guidance, curated options, and full project oversight, so you’re never overwhelmed, just supported.'],
  ['What services do you offer in-house?', `Collaboration, communication and expertise are key to a timely and seamless project, so we offer it all in-house, start to finish: ${SERVICES.map((s) => s[0]).join(', ')}.`],
] as const

const ABOUT = `Alli Rae Design & Build is a San Diego Design + Build firm for custom homes, remodels and commercial spaces, designed and built by one team.

We start with the way you live and how you want to feel in your space, then protect that design all the way through construction. One team, one process, no handoffs, from permits to pillows.

Led by Alli Rae, who blends creative vision with construction fluency: she leads with design, but builds with discipline. See the portfolio and book a Ready to Build Meeting at ${SITE}.`

const profileData = {
  kind: 'business',
  address: '450 S. Melrose Drive #112, Vista, CA 92081',
  hours: 'Mon – Fri\n7am – 6pm',
  phone: '(760) 707-6401',
  email: 'alli@alliraebuilddesign.com',
  website: SITE,
  socials: [
    { platform: 'instagram', url: 'https://www.instagram.com/allirae_build_design/' },
    { platform: 'facebook', url: 'https://www.facebook.com/profile.php?id=61577030431156' },
  ],
  about: ABOUT,
  offerings: SERVICES.map(([title, blurb]) => ({ title, blurb, priceModel: 'contact', visibility: 'public' })),
}
const profileLayout = {
  order: ['about', 'offerings', 'team', 'faq', 'contact', 'business'],
  hidden: ['story', 'highlights', 'booking', 'memberships', 'events', 'practices', 'circles', 'reviews'],
}

const sql = `-- Alli Rae Design & Build: fill the Space page (business info, services, FAQ, cover, logo, layout) from her site.
-- Safe to re-run. Touches the Space row, its FAQ and nothing on the website, menu or footer.
begin;

create table if not exists zz_backup_alli_rae_update5_20261030 (
  space_id uuid primary key,
  space jsonb,
  faqs jsonb,
  created_at timestamptz not null default now()
);

do $$
declare
  sid uuid;
begin
  if (select count(*) from spaces where slug = '${ALLI_RAE_SLUG}') <> 1 then raise exception 'expected exactly one Space with slug ${ALLI_RAE_SLUG} - rolled back'; end if;
  select id into sid from spaces where slug = '${ALLI_RAE_SLUG}';

  insert into zz_backup_alli_rae_update5_20261030 (space_id, space, faqs)
  select sid, to_jsonb(s), (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from space_faqs f where f.space_id = sid)
  from spaces s where s.id = sid
  on conflict (space_id) do nothing;

  update spaces set
    street = '450 S. Melrose Drive #112', city = 'Vista', region = 'CA', postal_code = '92081', country = 'US',
    time_zone = 'America/Los_Angeles',
    brand_logo_url = coalesce(brand_logo_url, '/sites/alli-rae/logo-header.webp'),
    cover_image_url = coalesce(cover_image_url, '/sites/alli-rae/hero-kitchen.webp'),
    about = ${q('Alli Rae Design & Build is a San Diego Design + Build firm for custom homes, remodels and commercial spaces. One team, from permits to pillows.')},
    preferences = coalesce(preferences, '{}'::jsonb)
      || jsonb_build_object('profileData', coalesce(preferences->'profileData', '{}'::jsonb) || '${lit(profileData)}'::jsonb)
      || jsonb_build_object('profileLayout', '${lit(profileLayout)}'::jsonb)
  where id = sid;

  delete from space_faqs where space_id = sid;
  insert into space_faqs (space_id, question, answer, position) values
${FAQS.map((f, i) => `    (sid, ${q(f[0])}, ${q(f[1])}, ${i})`).join(',\n')};
end $$;

commit;

select slug, city, preferences->'profileLayout' as layout, (select count(*) from space_faqs where space_id = spaces.id) as faqs from spaces where slug = '${ALLI_RAE_SLUG}';
`
process.stdout.write(sql)
