# Off-site SEO and AI-answer worksheet

> Status lives in [`BUILD-BACKLOG.json`](../BUILD-BACKLOG.json) (run `pnpm backlog`). This document is the how-to and the rationale. It does not record what is done. The owner rows are OWN-098 to OWN-108; the build rows are LIVE-1134 to LIVE-1137 (the footer, profile links, verification tags and instant page notice) and LIVE-1138 (a help article on getting found).

Written 2026-10-22 for the North County San Diego launch on 1 December 2026. Every action is free. Items tagged "Your account" need the owner's own login. Ties to the six launch doors: coaches and guides, studios and instructors, event hosts, venues, nonprofits and The Network.

## The answer

- **Accounts to open that show no sign in the repo:** Google Search Console, Bing Webmaster Tools, a Google Business Profile, LinkedIn, YouTube and Facebook pages, Capterra, G2, Product Hunt, AlternativeTo, Crunchbase, Eventbrite, Connectively and Google Postmaster Tools. Everything here is free.
- **The site side is done.** Sitemap, robots rules that let AI crawlers in, llms.txt, structured data and social links are already live. What is missing is outside the site: other places pointing at it.
- **Do items 1 to 4 this week.** They take about two hours in total and everything after them depends on them. Items 5 to 10 are the launch push. Items 11 to 20 are the extra reach: events, video, newsletters, community boards, comparison sites, email deliverability and link tagging.
- **Account state is not visible from the repo.** The repo has no verification tag for Google or Bing. If you verified by DNS, those two are already done; the first step of each card tells you how to check.

## Already in place on the site

- **Sitemap and robots.** /sitemap.xml and /robots.ts are live. Private app pages are kept out of the index; public events, Spaces and /for pages are in.
- **AI crawlers allowed.** robots names GPTBot, ChatGPT search, ClaudeBot, PerplexityBot, Applebot and Google-Extended and lets them in. No change needed.
- **llms.txt.** /llms.txt and /llms-full.txt exist, so AI tools get a plain summary of what Frequency is.
- **Structured data.** Organization (with North County San Diego as founding place), WebSite, Event, ItemList, Breadcrumb and FAQ markup are in the code.
- **Social links.** The site tells search engines about Instagram (@frequencylocal) and TikTok (@frequencylocal). No other profile is listed yet.
- **Parked on purpose.** Your notes park "Google verification". That is the app sign-in approval, which is a different thing from Search Console below, so this worksheet still lists Search Console.

## The twenty actions

### 1 · Verify the site in Google Search Console

Tags: Free, Your account, This week, All six doors

**Why.** It is the only way to see which searches show Frequency, which pages Google skipped, and to ask Google to look at the six /for pages before launch. Without it you are blind on Google.

**Steps**

1. Open [search.google.com/search-console](https://search.google.com/search-console) and sign in with the Google account you want to own this.
2. Click **Add property**, choose **Domain**, type `frequencylocal.com`, click **Continue**. If it says the domain is already verified, skip to step 6.
3. Copy the TXT record Google shows.
4. Open your domain's DNS. If the domain is on Vercel, go to vercel.com, then **Domains**, then frequencylocal.com, then **DNS Records**, then **Add**. Type **TXT**, name **@**, paste the value, save.
5. Back in Search Console click **Verify**. DNS can take a few minutes; try again later if it fails.
6. In the left menu click **Sitemaps**, type `sitemap.xml`, click **Submit**.
7. In the top bar paste each of these in turn, then click **Request indexing**: /for/coaches-and-healers, /for/studios, /for/event-hosts, /for/venues, /for/nonprofits, /for/networks, /pricing.

**Check first.** You may already have this. Open Search Console and look for frequencylocal.com in the property list.

### 2 · Verify in Bing Webmaster Tools

Tags: Free, Your account, This week, All six doors

**Why.** Bing's index feeds Copilot, DuckDuckGo and is one of the sources behind ChatGPT search. A site Bing has never seen is harder for those tools to quote.

**Steps**

1. Open [bing.com/webmasters](https://www.bing.com/webmasters) and sign in with a Microsoft or Google account.
2. Choose **Import from Google Search Console** after item 1 is done. It copies the site and the sitemap in one click.
3. If you skip the import, click **Add a site**, enter `https://frequencylocal.com` and verify with the same DNS TXT method.
4. Open **Sitemaps** and confirm `https://frequencylocal.com/sitemap.xml` is listed.

**Later.** Ask a build thread whether instant page notification (IndexNow) is wired. it is not in the code, and it makes new event pages reach Bing in minutes.

### 3 · Claim a Google Business Profile, then Apple and Bing

Tags: Free, Your account, This week, Venues, Studios

**Why.** It is what Google shows when someone searches "Frequency" with a place name. For North County it also puts you on Maps. Google allows a profile without a storefront if you serve customers in an area.

**Steps**

1. Open [business.google.com](https://business.google.com) and click **Manage now**.
2. Name: Frequency. Category: pick **Software company** or **Community center**, whichever Google offers that fits. Do not choose a category that is not true.
3. Choose **No, I don't have a storefront**. Add the service area: Encinitas, Carlsbad, Oceanside, Vista, San Marcos, Solana Beach.
4. Add the website, the launch date in the description (plain wording, no hype) and your logo.
5. Complete Google's verification (video or postcard). The postcard takes about a week, so start now.
6. Repeat free at [bingplaces.com](https://www.bingplaces.com) and [businessconnect.apple.com](https://businessconnect.apple.com).

**Fits the plan.** The bigger win for the venue and studio doors is helping those owners claim theirs. Add a line to the kit guide: "Claim your Google Business Profile and link it to your Frequency page."

**Risk.** Google can suspend profiles that overstate a location. Use a real address only if you operate from it.

### 4 · Create the missing brand profiles and name them the same everywhere

Tags: Free, Your account, This week, Networks, Nonprofits

**Why.** Search engines and AI tools decide "who is Frequency" by matching the same name, link and description across many sites. You have Instagram and TikTok; the gaps are the ones organizations and partners look for.

**Steps**

1. Create a company page on [LinkedIn](https://www.linkedin.com/company/setup/new/). Venue owners, nonprofits and Network buyers check it.
2. Create a channel on [YouTube](https://www.youtube.com) with the same name. Even one 60-second "what is Frequency" video helps.
3. Create a Facebook Page at [facebook.com/pages/create](https://www.facebook.com/pages/create). Local event groups still live there.
4. Use one name (Frequency), one description line, the same logo and the link https://frequencylocal.com on every profile, including Instagram and TikTok.
5. Give the three new links to a build thread, which adds them to the site's profile list so search engines connect them.

### 5 · List Frequency on software directories and Product Hunt

Tags: Free, Your account, Before 1 Dec, Coaches, Studios, Event hosts, Networks

**Why.** When someone asks an AI tool "best software to run a studio or community", these sites are what it quotes. They are also the sites people compare you on against Mighty Networks, Skool and Heartbeat.

**Steps**

1. Capterra: [capterra.com/vendors](https://www.capterra.com/vendors/), click to add your product. The basic listing is free. Decline the paid ad offers.
2. G2: [sell.g2.com](https://sell.g2.com), create a free profile.
3. Product Hunt: [producthunt.com](https://www.producthunt.com), make an account now and schedule a launch for the first week of December. Free.
4. Use the category line "Local groups that keep meeting." and the three price lines from the pricing page. Say "plus card processing" next to any 0% claim.
5. After launch, ask the first happy operators for a review. Reviews here are off-site, so they do not break your no-testimonials rule on the site.

### 6 · Get the 1 December launch into North County calendars and news

Tags: Free, Your account, Mid November, Event hosts, Venues

**Why.** Local news and calendar sites carry high trust and link back. A launch with a real date is the one story you have. Event listings with a link to the Frequency event page build links all year.

**Steps**

1. Make a one-paragraph press note: what it is, who it is for, the date, the six kinds of host, one contact. No claims about member counts.
2. Send it to local outlets through their own contact forms: [The Coast News](https://www.thecoastnews.com), [Patch](https://patch.com) for Encinitas, Carlsbad and Oceanside, and the community pages of your local chambers.
3. On each outlet's site, look for a **Submit an event** or **Community calendar** link and post the launch gathering and two or three of the largest events from The Group's calendar, each with the Frequency event link.
4. Keep a simple list of what you sent, when, and any reply.

**Check.** Each outlet's current submission page is unconfirmed. Use whatever each site shows today.

### 7 · Ask partners for a link, one set per door

Tags: Free, Mid November onward, All six doors

**Why.** Links from sites people already trust are the strongest signal there is, and they are also your best referral traffic. Each link should land on the matching /for page, so the visitor sees their own words.

**Steps**

1. Make one list of 5 to 10 contacts per door, starting with people you already know.
2. **Coaches and guides:** teacher lists and practitioner directories at partner studios. Link to /for/coaches-and-healers.
3. **Studios and instructors:** studio owner meetups and associations. Link to /for/studios.
4. **Event hosts:** run clubs, circles, breweries that host groups. Link to /for/event-hosts.
5. **Venues:** cafes, halls, galleries that host others. Link to /for/venues.
6. **Nonprofits:** nonprofit alliances and volunteer centers. Link to /for/nonprofits.
7. **The Network:** chapter-based organizations, starting with The Group. Link to /for/networks.
8. Send each a two-line note: what you are launching, the exact link, and what they get. Offer a free Space for their own group.

**Rule.** Give a real reason to link, such as a listing for their own events. Do not buy links.

### 8 · Claim free local listings: Yelp, Nextdoor, chambers

Tags: Free (skip paid tiers), Your account, Late November, Venues, Nonprofits

**Why.** Consistent listings in the places locals search back up the Google profile and give venues and nonprofits a path to follow you.

**Steps**

1. Yelp: [biz.yelp.com](https://biz.yelp.com), create the free page. Ignore the ad calls that follow.
2. Nextdoor: [business.nextdoor.com](https://business.nextdoor.com), claim a free Business Page and set the area to North County.
3. Check the Encinitas, Carlsbad, Oceanside and Vista chambers for a free listing or a free community-partner tier. Chamber memberships are usually paid; skip those unless Daniel decides otherwise.
4. Copy your name, website and description word for word from your Google profile every time.

### 9 · Earn mentions that AI tools quote: Reddit, expert quotes, local lists

Tags: Free, Your account, From launch, ongoing, Event hosts, Coaches

**Why.** Perplexity, ChatGPT and Gemini lean on Reddit threads, local lists and quoted experts. A real answer from you in a "where do I find groups in Encinitas" thread can be quoted for years.

**Steps**

1. Make a personal Reddit account at [reddit.com](https://www.reddit.com) and spend a week reading and replying before you mention Frequency.
2. In r/sandiego, r/encinitas, r/carlsbad and r/oceanside, answer questions about finding groups, run clubs and classes. Say you are building Frequency when you link it. Never post the same message twice.
3. Sign up free at [connectively.us](https://www.connectively.us) (the former HARO). Answer two or three journalist questions a week about community building, local events or running a studio.
4. Write one useful local page on a platform you control, such as "Where to find a standing weekly group in North County". Ask a build thread to publish it on the site.

**Rule.** Disclose who you are. Reddit bans promotion that looks like ads.

### 10 · Check what the AI tools say about you, every Monday

Tags: Free, Your account, Weekly, from late November, All six doors

**Why.** It tells you whether items 1 to 9 are working and where a wrong answer needs correcting. You cannot buy your way in here, so it is the only honest measure.

**Steps**

1. Open ChatGPT, Perplexity and Gemini in a signed-out window.
2. Ask the same eight questions each time, for example: "best software for a small studio to take memberships in Encinitas", "how do I run a recurring event group in North County San Diego", "what is Frequency", "event ticketing for a run club", "donation page for a small nonprofit", "software to manage chapters in several towns".
3. Record in a sheet: which tools named Frequency, which sources they cited, any wrong facts.
4. Send wrong facts to a build thread to fix on the site and in llms.txt. Send missing sources back to item 5, 7 or 9.

### 11 · Cross-post events to Facebook Events and Eventbrite

Tags: Free, Your account, Late November, Event hosts, Venues

**Why.** People in North County still search events on Facebook and Eventbrite first. Each listing is a link back to the Frequency event page and puts you where they already look. Google also reads event pages directly from the site's markup, so no sign-up is needed for that part.

**Steps**

1. On the Facebook Page from item 4, click **Events**, then **Create event**. Paste the same title, time and description as the Frequency event.
2. Put the Frequency event link in the description as the place to RSVP.
3. Eventbrite: [eventbrite.com](https://www.eventbrite.com), create a free account. Free events cost nothing to list. Add the Frequency link in the description. Do not use paid ticketing there unless a host asks.
4. Do this for the launch gathering and the 5 to 10 biggest events of The Group first.

**Rule.** Keep the same name, date and address on every listing, or search engines treat them as different events. Show city and area only, as the site does.

### 12 · Run a short, steady social and video rhythm

Tags: Free, Your account, From mid November, All six doors

**Why.** YouTube, TikTok and Instagram are now searched like search engines, and their pages rank in Google. Short videos that answer one local question also get quoted by AI tools.

**Steps**

1. Set the bio link on Instagram and TikTok to https://frequencylocal.com, and later swap it to the matching /for page in each post.
2. Record six 30 to 60 second videos, one per door, each answering one question in the host's own words, such as "How do I fill the room on a slow night" for venues.
3. Post each to YouTube with the door name and "North County San Diego" in the title and the /for link in the first line of the description. Then post the same clip to TikTok and Instagram Reels.
4. Post two to three times a week. Keep to the voice guide: plain, no hype words.

### 13 · Swap mentions with local newsletters

Tags: Free, Mid to late November, Coaches, Studios, Nonprofits

**Why.** A mention in an email list that locals already read sends real sign-ups and a link from the newsletter's web archive. It reaches people a search never will.

**Steps**

1. List 10 local newsletters: studio newsletters, nonprofit updates, neighborhood and chamber digests, local food and events lists.
2. Write to each: "I'm launching a free tool for local groups on 1 December. I can feature your next event on Frequency and ask for one line in your next issue."
3. Give them the right /for link for their audience and a ready two-sentence blurb.
4. Offer the same in return: a listing for their events on Frequency.

### 14 · Hand every Space owner a one-page "get found" guide

Tags: Free, Before 1 December, Studios, Venues, Coaches

**Why.** Every Space owner is a link source. If each one links their Frequency page from their own Google profile, Instagram and website, the whole network is lifted together. This is the cheapest multiplier you have.

**Steps**

1. Ask a build thread, or write yourself, a one-page guide: claim your Google Business Profile, link your Frequency page in it, put the page in your Instagram and email signature, add it to your website.
2. Send it in the Day 7 owner email and to every Space created before launch.
3. Ask the first ten owners personally for a link from their own site to their Frequency page.

### 15 · Get listed on college, city and library community boards

Tags: Free, Mid November onward, Event hosts, Nonprofits, Venues

**Why.** .edu and .gov sites carry the most trust of any link. They also put Frequency in front of newcomers, students and families, who are the biggest group of new hosts and guests.

**Steps**

1. Find the community or student-organization page for Cal State San Marcos and MiraCosta College, and ask how a student club or local group can post events.
2. Check each city's parks and recreation page (Encinitas, Carlsbad, Oceanside, Vista, San Marcos, Solana Beach) and the county library calendar for a "submit a community event" form.
3. Post one real event each, with its Frequency link.
4. Offer a free Space to a campus club or city program in exchange for a listing.

**Check.** Each page's current rules are unconfirmed. Use what each site shows today.

### 16 · Guest on local podcasts and write one guest post

Tags: Free, Your account, December onward, Coaches, Networks

**Why.** A podcast page or a blog post names Frequency and links to it, in an interview AI tools read as an expert source. It also gives you content to cut into the videos in item 12.

**Steps**

1. List five North County podcasts and blogs about wellness, small business, local life or nonprofits.
2. Pitch each with one topic you can speak on, such as "Why local groups fall apart after month three, and what keeps them going".
3. Ask them to link to https://frequencylocal.com in the show notes.
4. Write one guest article for a community-building or small-business site on the same topic.

### 17 · Appear on "alternatives to" comparison sites

Tags: Free, Your account, Before 1 December, Event hosts, Networks

**Why.** People and AI tools both search "alternative to Mighty Networks" or "Skool alternative". These lists are where the answer comes from, and Frequency is a local-first option none of them mention yet.

**Steps**

1. Open [alternativeto.net](https://alternativeto.net), create an account, and use **Add application**.
2. Mark it as an alternative to Mighty Networks, Skool and Heartbeat. Describe it as local-first, free to start.
3. Add the same product on the Capterra and G2 pages from item 5 with the "alternatives" fields filled in.
4. Quote only prices from your own pricing page. Do not state a competitor's price unless you have just checked it.

### 18 · Create a Crunchbase profile and set brand alerts

Tags: Free, Your account, Late November, Networks, Nonprofits

**Why.** Crunchbase is a source search engines and AI tools use to confirm that a company is real and what it does. Alerts tell you the moment anyone writes about you, so you can thank them or fix an error.

**Steps**

1. Open [crunchbase.com](https://www.crunchbase.com), create a free account and claim or add Frequency. Use the same name and description as item 4.
2. Open [google.com/alerts](https://www.google.com/alerts) and create alerts for: "Frequency" "North County", "frequencylocal.com" and your own name with Frequency.
3. Set delivery to once a day.

### 19 · Register with Google Postmaster Tools so launch emails reach inboxes

Tags: Free, Your account, Before 1 December, All six doors

**Why.** Your funnel depends on the Day 0, 1, 3 and 7 emails arriving. Gmail decides inbox or spam by domain reputation, and Postmaster Tools is the only place that shows it. A spam-foldered welcome email loses the sign-up you just paid effort to earn.

**Steps**

1. Open [postmaster.google.com](https://postmaster.google.com) and sign in.
2. Click **Add domain** and add `people.frequencylocal.com`, the sending domain already verified in Resend. Add `frequencylocal.com` too.
3. Add the DNS TXT record it shows, as in item 1, and click **Verify**.
4. Check it weekly after launch. If domain reputation shows Low or Bad, tell a build thread to slow sending.

### 20 · Tag every link you hand out so you can see what works

Tags: Free, Start now, All six doors

**Why.** You will send dozens of links to partners, newsletters and posts. Without a tag you cannot tell which door or partner brought a sign-up. The site already records the first campaign a visitor arrives from (utm_source, utm_medium, utm_campaign, utm_content, utm_term), so a tagged link feeds the funnel directly.

**Steps**

1. Pick one pattern and use it every time: the page link, then `?utm_source=PARTNER&utm_medium=TYPE&utm_campaign=DOOR`. Example: `/for/studios?utm_source=encinitas-chamber&utm_medium=referral&utm_campaign=studios`.
2. Use only these four mediums, or the visit lands in the generic organic channel: **referral** for partner and directory links, **social** for posts, **email** for newsletters, **video** for video descriptions.
3. Point partner QR codes at the /for page with the tags, never at /go or /q.
4. Use lowercase and hyphens only. Keep a sheet of every tagged link and who got it.
5. Never tag links on Google Business, Bing Places or Apple profiles with extra words that change the visible address.
6. Each Monday, after item 10, note which sources sent sign-ups.

**Limit.** The tag is saved on a visitor's first page only, and only after they accept tracking where consent is required. A first visit that declines is not recorded, so treat the counts as a floor. Tags are kept as typed up to 200 characters.

## Schedule to 1 December

| When | Do | Time |
|---|---|---|
| This week (to 28 Oct) | Items 1, 2, 3 (start the postcard), 4, 19, 20 | About 3 hours |
| Week of 2 Nov | Items 5 and 17 (Capterra, G2, Product Hunt, AlternativeTo); list partners for item 7; start the video clips for item 12 | About 3 hours |
| Week of 9 Nov | Items 7, 13, 14 and 15 outreach; check Search Console for crawl errors | About 3 hours |
| Week of 16 Nov | Item 6 press note and calendar posts; first social posts (item 12) | About 2 hours |
| Week of 23 Nov | Items 8, 11 and 18; first run of item 10 as the baseline; schedule Product Hunt | About 2 hours |
| 1 December and after | Product Hunt launch; items 9 and 12 weekly; item 10 every Monday; item 16 pitches; check Postmaster Tools weekly | About 3 hours a week |

## Not recommended

- **Paid chamber memberships, directory ads, link packages, "SEO services".** Cost beats speed, and none are needed at this size.
- **A Wikipedia page.** Frequency is not notable enough yet and an edit would be removed.
- **Review swaps or fake reviews.** They get profiles suspended.

Not checked: whether you already verified by DNS, or already have a Google or Yelp profile. Also unconfirmed: each local outlet's current submission page. Where a card says "check", do that first. Nothing here needs a code change except adding the new profile links to the site (item 4) and the optional instant-notice setup (item 2).
