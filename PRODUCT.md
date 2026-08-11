# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers, university students and cloud engineers in and around Vientiane, Laos —
most of them on mid-range Android phones over Lao mobile data. They arrive to answer one
of two questions: "is there a meetup coming up, and can I get in?" or "what did I miss?"
Newcomers with no AWS experience are explicitly part of the audience.

A second, much smaller audience runs the group: a handful of volunteer organisers and
editors who use the backoffice to publish events and articles, check people in at the
door, and export registration lists.

## Product Purpose

The public home of AWS User Group Lao, a volunteer-run community. It announces meetups,
takes free registrations, issues QR tickets, collects post-event feedback, and publishes
recaps and tutorials. Success is a person who did not know the group existed arriving at
a venue with a ticket.

## Positioning

A real, local, volunteer community rather than a vendor programme: everything is free,
bilingual, and run by people who meet in the same city as the people reading. Nothing on
the site is a claim a neighbouring product could copy, because the evidence is the
group's own history of events at named Vientiane venues.

## Operating Context

- Lao is the base locale and is unprefixed; English lives under `/en`. Every visible
  public string goes through `$lib/paraglide/messages`. The backoffice is English-only by
  design.
- Registration, newsletter signup and news search all work without JavaScript, and form
  results are server-rendered. This is deliberate and load-bearing, not an accident.
- Events carry a Google Maps URL; coordinates are parsed out of it once at save time into
  `location_lat` / `location_lng`.
- Venues are real and spread across Vientiane — the National Convention Centre, Toh-Lao
  Coworking Space, and the National University of Laos campus about 5 km west of the
  centre.

## Capabilities and Constraints

- SvelteKit 2 / Svelte 5 runes, Tailwind v4, shadcn-svelte, Postgres via Drizzle,
  deployed with SST to AWS behind CloudFront.
- **UI is built from stock shadcn-svelte primitives.** Hand-rolling a control that a
  primitive already covers is the rule this codebase exists to enforce. Two deliberate
  exceptions: backoffice status/role pickers stay native `<select>` (they post without
  JavaScript and the e2e suite drives them with `selectOption()`), and the ticket QR keeps
  a hardcoded white plate in both themes so scanners can read it.
- Capacity is claimed with a single atomic UPDATE plus a CHECK constraint, so the room
  cannot be oversold.
- Public pages are cached at the edge with stale-while-revalidate so a cold Aurora resume
  is never in a visitor's critical path.

## Brand Commitments

- Name and wordmark: AWS User Group Lao. The logo's hexagon stroke supplies the brand
  violet, and its interior navy is within a hair of the dark theme's background.
- Typeface pairing: Inter Variable with Noto Sans Lao Variable, self-hosted.
- The violet OKLCH token set in `theme.css` is the single source of colour truth; no raw
  colours and no `dark:` colour overrides anywhere, including inside the WebGL scene.

## Evidence on Hand

- Real event history with real venues and coordinates, real sponsors with logos, and real
  published articles, all in the database.
- Building footprints, water and street geometry for central Vientiane from
  OpenStreetMap, baked into `apps/web/static/vientiane*.bin`. **ODbL — the "Map data ©
  OpenStreetMap contributors" attribution in the footer is a licence condition.**
- No testimonials, headcount claims beyond the "200+ members / 3 years" already on the
  site, pricing, or partnership claims exist. Do not invent any.

## Product Principles

1. The evidence is local and specific: named venues, real dates, real people. Never
   substitute generic community stock imagery for it.
2. Free and open to newcomers — nothing on the site may imply prior AWS experience is
   required.
3. Bilingual by default. Lao is not a translation of the English site; it is the base.
4. It has to work on a mid-range phone over mobile data, and it has to work without
   JavaScript where a visitor is trying to register or subscribe.
5. The backoffice is a tool, not a showpiece. Density and familiarity beat expression.

## Accessibility & Inclusion

Lao stacks vowel and tone marks above and below the consonant line and needs noticeably
more leading than Latin; `:lang(lo)` rules own this and must not be overridden per page.
Lao has no italic tradition, so synthesised obliques are replaced by weight. Long unbroken
Lao compounds must never force a horizontal scroll. `prefers-reduced-motion` is honoured
everywhere, including the 3D city model, which still renders but holds still.
