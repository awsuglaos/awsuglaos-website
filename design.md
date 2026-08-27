# Design — AWS User Group Lao

The locked design system for `apps/web`. Read this before changing any page, and amend this
file rather than overriding it locally. Product truth lives in [`PRODUCT.md`](PRODUCT.md);
this file owns only how the product looks.

**Token source of truth is [`theme.css`](theme.css), not this file.** Everything below
describes *how* to use those tokens; the values themselves live in one place so they cannot
drift. `apps/web/src/routes/layout.css` imports it.

## Genre

**The live survey chart.** The public site is built around a map of Laos drawn as
infrastructure: real elevation contours, a lit national border, the community's venues
pulsing as radar beacons, and network arcs bowing between cities. Everything is emissive
line-work; nothing in the map is lit or shaded. Type is the chart's annotation layer.

The backoffice is deliberately not this. It is an Operate surface and keeps its plain
sidebar Workbench.

## The map

The signature artifact, and the one thing on this site nobody else has. It is real terrain
and real streets with the group's real venues on it, not decoration.

| Concern | Decision |
|---|---|
| Country extent | `COUNTRY_BBOX` in [`projection.js`](apps/web/src/lib/map/projection.js) — all of Laos, 1 unit = 10 km |
| City extent | `CITY_BBOX` — central Vientiane, ~4.8 × 5.1 km, 1 unit = 100 m |
| Terrain | SRTM via **AWS Open Data Terrain Tiles**, traced to contours by `scripts/bake-map.mjs` |
| Border | Natural Earth admin-0 |
| Streets, water | OpenStreetMap (ODbL) |
| Views | `country` (hero), `city` (events board), `venue` (event page) |
| Beacons | Real `location_lat` / `location_lng` from the events table; upcoming pulse, past sit quiet |
| Vertical scale | Contours at true elevation × 14, so tilting reveals the stack |

### The governing idea

**Flat when you look at it, three-dimensional when it moves.** A narrow field of view at a
high angle flattens perspective almost to orthographic, so the chart reads as a map; the
pointer then tilts it a few degrees and the contour stack, the bowed arcs and the beacons'
vertical light columns give the depth away. Every one of those three exists to be the thing
the tilt reveals — do not flatten them to decals.

**North is up, always.** The chart was briefly rotated to lay Laos across the diagonal and
fill a landscape frame better. That is a composition argument and it loses to a stronger
one: people know the shape of their own country at one orientation, and tilting it made
Laos subtly unrecognisable to exactly the audience who would notice. Dead air beside the
country is composition's problem to solve, not the map's.

### Rules that must not be broken

- **The scene reads its colours from the CSS tokens.** `palette.ts` samples `--background`,
  `--foreground` and `--primary` and derives every colour as a mix between them, so the chart
  inverts with the theme: a glowing console at night, ink on paper by day. Never introduce a
  hex value into the scene. Line-work blends additively in dark and normally in light —
  additive on a light ground only lightens, so ink would vanish where it is densest.
- **Violet is the only saturated thing on the chart.** Beacons, arcs and the sweep. Nothing
  else. Anything blended additively takes `accentGlow`, not `accent`: additive adds to what
  is already there, so the violet that saturates instantly against white barely lifts off
  near-black. In dark mode the glow colour is pushed past 1.0 so the pulse actually burns.
- **Labels are HTML, not 3D text**, positioned from the scene's own projection so type stays
  crisp, inherits Inter and Noto Sans Lao, and can be localised. They carry a **halo** in the
  page background colour; contour line-work is densest exactly where the towns are, and an
  unhaloed label sits on its own busiest background.
- **Below 640 px the chart keeps only the hub and venue labels.** Thinning annotation as
  scale drops is what a real map does.
- **The poster is the experience, not a spinner.** `map-poster-{light,dark}.webp` is
  server-rendered and the canvas layers over it. Every failure path — no WebGL2, lost
  context, bad data — leaves the poster in place. The LCP element is the headline.
- **three.js is never in the entry chunk.** Verify after any build that the chunk carrying
  `WebGLRenderer` is not referenced from `_app/immutable/entry/`.
- **The HUD carries only facts this site holds** — coordinates, venue count, the terrain's
  real peak. A cloud-console line like `REGION ap-southeast-1` would look right and be a
  claim this community has never made. It is not there, and must not be added.
- **Venues outside the city box are not faked.** No beacon, and the event page falls back to
  the Google embed. The "Open in maps" link is present either way.
- Attribution is a licence condition. The footer line and the figure captions stay.

## Macrostructure families

| Family | Routes | Shape |
|---|---|---|
| Marketing | `/`, `/events` | **Chart** — the map as the first object, content composed around and beneath it |
| Directory | `/speakers`, `/speakers/[slug]` | **Portrait wall** — centred heading over a wrapping, centred run of large circular portraits; the profile page is a Long Document under a portrait header |
| Content | `/news`, `/events/[slug]`, `/news/[slug]`, ticket, feedback, newsletter, error | **Long Document** — one measured column; the event page adds a sticky facts aside from `lg` |
| App | `/admin/*` | **Workbench** — collapsible sidebar, inset header with breadcrumb, cards over tables |

- **Nav:** N1b three-section (brand left · destinations centre · controls right).
- **Footer:** Ft5 statement (lockup + built-with line + data attribution + one link column).
- **Enrichment:** the map, and nothing else.

## Theme

Light and dark are both fully defined in [`theme.css`](theme.css). Dark is activated by
`mode-watcher`, which sets `.dark` on `<html>` before first paint.

**Never write a raw colour.** No `dark:` colour overrides — the tokens already switch.
Because the theme is a class and not a media query, anything shipping one asset per theme
uses `dark:hidden` / `hidden dark:block`, never `prefers-color-scheme`.

## Typography

- **Sans:** `Inter Variable`, falling through to `Noto Sans Lao Variable`. Self-hosted.
- **Mono:** the annotation register — map labels, HUD readouts, the stat spec line, event
  dates in list rows, tier labels, article bylines. `text-[0.625rem]`–`[0.6875rem]`,
  `tracking-[0.14em]`–`[0.18em]`, uppercase. Also ticket codes and slugs.
- **The mono register is Latin and numeric only, and that is a hard limit, not a habit.**
  `--font-mono` is `Fira Code, monospace`, it carries no Lao fallback, and unlike the sans
  stack it is not self-hosted — so on the mid-range Android phones this site is built for it
  resolves to a generic monospace with no Lao glyphs. Every existing use is safe because it
  is Latin or numeric: coordinates, ticket codes, slugs, dates, and the sponsor tier labels,
  which are untranslated enum values. Never set a translated string in it — the speaker role
  labels look exactly like tier labels and are not, because they go through paraglide.
- All headings are **roman**. No italic display type.
- Scale: hero `text-5xl` → `sm:text-7xl` → `lg:text-8xl`; page `h1` `text-4xl`/`sm:text-6xl`;
  section `h2` `text-2xl`/`sm:text-3xl`; admin `h1` `text-2xl`.
- Body measure at or under `68ch`. The hero subtitle is deliberately shorter (`max-w-md`).
- Lao needs more leading than Latin — `:lang(lo)` rules in `layout.css` handle it.

## Spacing and motion

- Tailwind's 4-pt scale. Section rhythm `py-16`–`py-20` on marketing, `py-10`–`py-14` on
  content, `p-4`/`sm:p-6` inside the admin inset.
- Motion primitives: the beacon pulse, the packet running each arc, the radar sweep, the
  chart's pointer tilt, the `lift` utility on cards, the theme crossfade, the sidebar slide.
  Nothing else.
- `prefers-reduced-motion` neutralises all of them. The map still renders — it is content —
  but holds completely still, and its loop then renders on demand rather than continuously.

## Components

**Use shadcn-svelte. Do not hand-roll UI that a primitive already covers** — that is the
rule this codebase exists to enforce. Empty states are `Empty`, callouts are `Alert`, forms
are `Field.*`, confirmations are `AlertDialog`, navigation is
`NavigationMenu`/`Sheet`/`Sidebar`/`Breadcrumb`, filters are `Button href`.

The canvas is an artifact layer, not chrome, and is the one thing on the site that is not a
primitive.

Two deliberate exceptions, both load-bearing: backoffice status and role pickers stay native
`<select>` styled by `native-select`, and the ticket QR keeps a hardcoded white plate.

### Local components

| Component | Use |
|---|---|
| `map/MapCanvas.svelte` | The chart. Give it a `view`, real `beacons`, and a `label`. |
| `map/MapHud.svelte` | Corner readouts. Facts only. |
| `brand-logo.svelte` | `variant="mark"` beside live text; `variant="lockup"` where the logo is the only naming element |
| `theme-toggle.svelte` | Light / Dark / System, bilingual |
| `admin/page-header.svelte` | Every backoffice screen's title + description + actions, with its underline |

## Feedback: alerts, not toasts

Form results are **server-rendered `Alert`s**, never toasts. The admin forms post normally
and the page reloads, so the result must be part of the document.

## Browser surfaces

Selection, caret, scrollbar, underline offset and tabular figures are themed from the
palette in `layout.css`. Underlines carry `text-underline-offset: 0.2em` so they clear Lao
tone marks.

## Responsive floor

Non-negotiable, verified at 390 / 1440 in both themes with measured zero horizontal overflow:

- `overflow-x: clip` on `html` **and** `body` — never `hidden`, which breaks the sticky header.
- Image-bearing grid tracks use `minmax(0, 1fr)`, never a bare `1fr`.
- Card grids use `auto-fill`, never `auto-fit`: fitting collapses empty tracks and stretches
  a lone card across the whole container.
- `h1`–`h3` carry `min-width: 0; overflow-wrap: anywhere` for long Lao strings.
- No two-line clickable text. Nav links, buttons and footer links get `whitespace-nowrap`.
  A person's name under a portrait is exempt — it is content, it must wrap, and it carries
  `[overflow-wrap:anywhere]` for the same reason `h1`–`h3` do.
- **Portrait walls wrap and centre; they are not a grid.** A fixed three-column grid holding
  one person pins them to the left of two empty tracks and reads as a load failure, and this
  group is both small and variable. Item track `w-40 sm:w-44 lg:w-56` around a
  `size-32 sm:size-36 lg:size-48` portrait, gaps `gap-x-6 sm:gap-x-8 lg:gap-x-14` over a
  generous `gap-y-12`: 2-up at 390, 3-up at 640, 4-up at 1440, each measured clear.
- **The chart composes per aspect in `scene.ts`, not in CSS.** Landscape lays Laos across the
  diagonal and aims past it so the copy keeps clean ground; portrait stands the country
  upright — its own proportions match a phone — and drops it into the lower half.

## What every page must share

The wordmark, the violet and its restraint, the Inter + Noto Sans Lao pairing, the mono
annotation register, the CTA voice (`Button` variants, never a bespoke button), and the
section heading rhythm.

## What pages may differ on

Macrostructure within their family, whether they carry the map and in which view, and card
density. Not theme, not type, not accent.

## Bilingual rules

Lao is the base locale and unprefixed; English lives under `/en`. Every visible string goes
through `$lib/paraglide/messages` — no hardcoded copy on public pages. Place names carry a
Lao form in [`places.ts`](apps/web/src/lib/map/places.ts). The backoffice is English-only by
design.

**Switching language is a client-side navigation, not a document reload.** The reload it
used to force made the browser composite the outgoing hero over the incoming one, so both
languages were briefly visible at once. Two things make the soft navigation correct and
both must stay: the root layout wraps its shell in `{#key locale}` so the persistent header
and footer re-render into the new language, and an effect keeps `<html lang>` in step —
`layout.css` hangs Lao's extra leading and its no-italic rule off `:lang(lo)`.

## Brand

The mark (`variant="mark"`) is the stupa hexagon and needs a wordmark beside it. The lockup
(`variant="lockup"`) is the same hexagon with "aws User Group Laos" set inside it. The
header uses the lockup *with* the wordmark beside it: at header size the lettering inside
the badge is far too small to read, so the badge is recognised and the text is read. The
landing hero opens with the mark plus the full name as a masthead — identity, not a kicker.
