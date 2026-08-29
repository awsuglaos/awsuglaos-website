# AWS User Group Lao — Website

Public site (landing, news, events, registration) and backoffice for AWS User
Group Lao, built to double as a reference architecture the group can present at
meetups.

**Status:** Phase 1 is built and verified locally, and the infrastructure is
ready to deploy. See [DEPLOYMENT.md](DEPLOYMENT.md) for the runbook.

---

## Stack

| Layer        | Choice                                                         |
| ------------ | -------------------------------------------------------------- |
| Frontend     | SvelteKit 2 (Svelte 5, runes) + Tailwind v4 + shadcn-svelte    |
| Rich text    | TipTap 3 — stored as JSONB, rendered and sanitised server-side |
| i18n         | Paraglide JS 2 — Lao (base, unprefixed) and English (`/en/*`)  |
| API          | Hono on Lambda behind API Gateway HTTP API                     |
| Domain logic | `packages/core`, shared by both entry points                   |
| Database     | Postgres — Aurora Serverless v2 via the RDS Data API on AWS    |
| ORM          | Drizzle                                                        |
| Validation   | Zod 4, shared between client and server                        |
| IaC          | SST v4 (Pulumi/Terraform — **not** CDK)                        |
| Monorepo     | Turborepo + pnpm workspaces                                    |

### Features

Public: landing page, news, event listings and detail with an embedded venue
map, speaker line-up, per-event sponsors, registration through a form the
organiser builds, a QR ticket, a downloadable photo gallery, a post-event
feedback form, and a public feedback page whose messages appear only once an
organiser approves them. All bilingual.

Backoffice: dashboard, events, a reusable speaker directory, per-event line-up
and sponsor pickers, a drag-free registration form builder with per-event
answer analytics, news with a rich text editor and image upload, sponsors,
QR check-in, feedback with averages, a moderation queue for public feedback,
and user management.

#### The registration form builder

Each event owns its registration form, stored as an ordered list of blocks in
`events.form_schema` and validated by `packages/shared/src/schemas/form.ts`.
Questions come in twelve types (short text, paragraph, radio, checkboxes,
dropdown, 1–5 rating, number, date, yes/no, email, phone, link) alongside
content blocks that are shown rather than asked — a heading, a rich text block,
an image and a divider.

The form is genuinely free-form: name and email are ordinary questions and can
be renamed, reordered or deleted. Because tickets, the confirmation email, the
one-registration-per-person rule and the check-in list all need to know which
answer is which, a question can carry a **role** (`name`, `email`, `phone`,
`organisation`); the submitted value is mirrored into the matching
`registrations` column, and everything downstream keeps reading one column.

Deleting the email question is allowed, and the builder says what it costs:
that event stops sending confirmation emails and stops blocking duplicate
sign-ups. Nothing breaks — `registrations.email` is simply null, and the
`(event_id, lower(email))` unique index lets NULLs through.

Answers are keyed by a question's stable id, so renaming or reordering a
question keeps every answer already collected attached to it. Deleting one
keeps the answers too: they surface on the insights page under "answers to
removed questions" and in a trailing column of the CSV export.

---

## Layout

```
apps/
  web/          SvelteKit — public site + /admin backoffice
  api/          Hono handlers → API Gateway (admin CRUD, check-in)
packages/
  core/         Domain services (events, registrations, articles, speakers,
                sponsors, feedback, users, newsletter) plus the email, storage,
                directory and content-rendering adapters
  db/           Drizzle schema, migrations, seed
  shared/       Zod schemas, domain errors, ticket codes, maps and rich text
sst.config.ts   Infrastructure (written, not yet deployed)
theme.css       Design tokens (shadcn-svelte / Tailwind v4 format)
```

`packages/core` holds all business logic. SvelteKit form actions and the Hono
API are both thin adapters over it, so a rule is written once and enforced
everywhere.

---

## Running locally

Requires Node 22+, pnpm, and Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d          # Postgres on port 5433
pnpm db:migrate
pnpm db:seed
```

Then in two terminals:

```bash
pnpm --filter @awsug/api dev   # API on :3000
pnpm --filter @awsug/web dev   # Site on :5173
```

- Public site: http://localhost:5173 (Lao) and http://localhost:5173/en
- Backoffice: http://localhost:5173/admin — sign in as
  `ketsadaphoneofficial@gmail.com` (seeded admin)

> **Port 5433, not 5432.** A natively installed Postgres commonly already owns
> 5432 on Windows, and Docker's port mapping loses that race silently, producing
> confusing auth errors against the wrong database.

### Local auth

There is no Cognito locally. With `DEV_AUTH=true`, any email that exists in the
`users` table signs in without a password (token form: `dev:<email>`).
`apps/api/src/env.ts` refuses to start if `DEV_AUTH=true` is ever combined with
`NODE_ENV=production`.

### Email

Three providers, chosen by environment and tried in this order:

| Condition                            | Provider                       |
| ------------------------------------ | ------------------------------ |
| `RESEND_API_KEY` + `MAIL_FROM_EMAIL` | Resend                         |
| `SES_FROM_ADDRESS`                   | Amazon SES                     |
| neither                              | printed to the API/web console |

Resend wins so that moving between providers is one environment variable rather
than a code change — SES production access is still pending, and clearing
`RESEND_API_KEY` hands sending straight back to SES. With neither set, nothing
needs AWS to exercise the full flow.

To work on the templates:

```bash
pnpm mail:preview               # renders every template + locale to .mail-preview/
pnpm mail:send you@example.com  # sends them for real, through Resend
```

The preview is for iterating on layout and copy; the real send is the only way
to find out what a mail client actually does with it. Both use the same
fixtures, so what you see in the browser is what lands in the inbox.

---

## Testing

```bash
pnpm test        # Vitest — 86 unit/integration tests
pnpm check       # tsc + svelte-check across all packages
pnpm lint
pnpm --filter @awsug/web test:e2e   # Playwright — 27 tests
```

Unit tests run against a dedicated `awsug_lao_test` database, created and
migrated automatically, so a test run never touches seeded dev data. The e2e
suite builds the app and runs against the production build; it needs the API on
:3000 and Postgres up.

Three tests carry most of the weight:

- `core/test/registrations.test.ts › never oversells capacity` — fires 25
  concurrent registrations at a 5-seat event and asserts exactly 5 succeed. If
  the capacity claim regresses to a read-then-write, it oversells.
- `core/test/render.test.ts` — proves the rich text sanitiser strips script
  nodes, event-handler attributes, and `javascript:`/`data:` URLs, and that an
  unrenderable document degrades to text rather than 500-ing the page.
- `core/test/phase15.test.ts › user management` — the two guards that stop the
  backoffice locking itself out: no self-demotion, and the last admin cannot be
  removed.

---

## Notable design decisions

**Lambda stays outside the VPC.** Aurora has to live in a VPC; Lambda does not
have to join it. Every function reaches the database over the RDS Data API's
HTTPS endpoint instead, which removes the NAT Gateway (~$32/month, billed
whether or not anything runs) and the ENI cold-start penalty. It is also the
only option compatible with Aurora scale-to-zero, since RDS Proxy blocks
auto-pause.

**Capacity is claimed atomically.** Registration does not read-then-write. A
single conditional `UPDATE … WHERE registered_count < capacity` claims the seat,
wrapped with the INSERT in one transaction so a duplicate-email rejection rolls
the seat back with no compensating write to get wrong. A CHECK constraint on the
table is the backstop.

**Tickets store a code, not an image.** `registrations.ticket_code` holds a
ULID; the QR is rendered as inline SVG on demand. Nothing to clean up in S3, no
broken links if a ticket is reissued, and it prints crisply at any size.

**Translations are rows, not columns.** `article_translations` /
`event_translations` keyed by `(parent_id, locale)`. An article that exists only
in Lao carries no empty English row, and Phase 3's Amazon Translate integration
can insert a locale without a migration. Reads fall back to the base locale and
flag it in the UI.

**Rich text is stored as JSON, not HTML.** TipTap documents live in JSONB.
Storing HTML would mean trusting whatever an editor's browser produced and
re-parsing it on every read; JSON keeps the structure addressable and makes
sanitisation a property of the renderer. `packages/core/src/content/render.ts`
is the only place content becomes markup, and it always sanitises. Note that
ProseMirror _throws_ on a node type outside the schema rather than dropping it,
so the render is wrapped and degrades to plain text — a stale document must not
take a page down.

**Sponsor tier lives on the join, not the sponsor.** A company can be Platinum
at one event, Gold at the next, and hold a separate group-wide tier shown on the
landing page. `event_sponsors.tier` overrides `sponsors.tier` per event. Were
tier only on the sponsor, editing one event would silently restate that
company's standing everywhere.

**Speakers are people, not per-event text.** A returning speaker keeps one
profile, so a bio is written once and a typo is fixed everywhere. The talk
belongs to the appearance (`event_speaker_translations`), not to the person.

**Uploads are presigned, never proxied.** The browser PUTs straight to S3. API
Gateway caps a body at 10MB and Lambda at 6MB, so routing an 8MB photo through
the function would fail outright. Locally a filesystem store stands in, so image
upload works with no AWS account. Every image field — event and news covers,
speaker photos, sponsor logos, user avatars — is the same `ImageField`
component, which keeps the URL editable so an image hosted elsewhere can still
be pasted in.

**Image URLs are stored site-relative.** An upload yields
`/uploads/2026/08/<ulid>.png`, not an absolute URL. Absolute would bake the
current origin into every row, so moving from a preview host to `awsug.la`
would strand every stored image — and it would force the API to know the
browser's origin in order to sign an upload, which it does not. Two consequences
worth knowing: `imageUrlSchema` accepts both shapes (and rejects
protocol-relative `//host`, which only looks relative), and the field is
`<input type="text">` rather than `type="url"`, because the browser's URL
validation rejects a relative path outright and would block submission.

**Map coordinates are parsed once, at save.** `location_url` is required and
must be a Google Maps link; short `maps.app.goo.gl` links are expanded
server-side on save and the pin's coordinates stored. Rendering a map never
depends on a round-trip to Google, and the coordinates also feed the event's
structured data.

**Lao typography.** Lao stacks vowel and tone marks above and below the
consonant line and clips at Tailwind's default leading, so `:lang(lo)` gets
`line-height: 1.85`. Synthesised italics are also suppressed — Lao has no italic
tradition and obliqued Lao looks broken.

---

## Corrections to the requirements document (v1.0)

| Doc says                                        | Reality                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| "SST v3 (built on AWS CDK)"                     | SST v3+ replaced CDK/CloudFormation with **Pulumi + Terraform**. Only v2 was CDK-based. This repo uses **v4**.          |
| "Aurora v2 doesn't scale to zero — set 0.5 ACU" | Scale-to-zero shipped Nov 2024. 0.5 ACU ≈ $43/mo; 0 ACU ≈ storage only. Costs a ~15s resume and rules out RDS Proxy.    |
| "Route 53 manages the `awsug.la` domain"        | `.la` is **not registrable** through Route 53. Register at a `.la` registrar and delegate NS to a Route 53 hosted zone. |
| `users(password_hash)` alongside Cognito        | Two auth systems. Dropped; the table stores `cognito_sub`.                                                              |
| VPC placement unspecified                       | Decided explicitly — see above.                                                                                         |
| `registrations.qr_code_url` in S3               | Replaced with `ticket_code`.                                                                                            |

### Cost expectation

The "stays in/near Free Tier" claim needs qualifying: Aurora idle ~$1/mo,
Route 53 hosted zone $0.50, CloudWatch ~$0.50 at 14-day retention, SES ~$0.10
per 1,000 emails, and Lambda/API Gateway/CloudFront ≈ $0 at community scale.
**Phase 1 lands around $3–8/month**; Phase 2's WAF adds ~$6–8 (billed flat, not
free-tier). Verify current pricing before quoting these publicly.

---

## Deploying

**See [DEPLOYMENT.md](DEPLOYMENT.md)** — a step-by-step runbook to a running
site, including the answer to "why not Amplify?".

Deployment is driven entirely from GitHub Actions: every push to `main` deploys
`staging`, every `v*` tag deploys `production`. No AWS CLI on the developer
machine, and no long-lived access keys anywhere — the workflow assumes an IAM
role over GitHub OIDC.

```bash
git push origin main                        # → staging.awsug.la
git tag v1.0.0 && git push origin v1.0.0    # → awsug.la
```

Migrations run automatically after each deploy, over the RDS Data API.

**One repository variable, `SITE_DOMAIN=awsug.la`, covers both stages.**
`sst.config.ts` derives the host from the stage — production takes the apex,
every other stage takes `<stage>.awsug.la`. Setting it per-environment would
make the two stages contend for the apex certificate.

**SES production access is the remaining blocker for a real event.** Sandboxed,
an attendee who registers gets no confirmation and no ticket. Approval takes
24–48h.

> **Adapter — resolved 2026-08-11.** `sst.aws.SvelteKit` reads its build from
> `.svelte-kit/svelte-kit-sst/{server,client,prerendered}` and invokes
> `lambda-handler/index.handler`; `adapter-node` writes to `build/` instead, so
> deploying with it would have failed at the `Web` component. `apps/web` now
> uses `svelte-kit-sst`, **pinned to 2.49.8** — npm's `latest` tag still points
> at the older 2.43.5, so do not unpin it.
>
> This note previously called that package abandoned. It is not: 2.49.8 was
> published 2026-03-23 and builds cleanly against SvelteKit 2.70 / Svelte 5 /
> Vite 8. `pnpm check` passes and `vite preview` still serves the production
> build, so the Playwright suite is unaffected. The container fallback
> (`sst.aws.Cluster` + `sst.aws.Service`, ~$10+/month for an always-on Fargate
> task) is not needed.

### Six defects found while writing that runbook

Each would have survived a "successful" deploy and surfaced only as a broken
site. All four are fixed; they are recorded here because they are the kind of
thing that gets reintroduced.

|                                                                                                                                                                                                                                  |                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The backoffice had no way to sign in.** The login page only ever had the `DEV_AUTH` shim, which refuses to run when `DEV_AUTH` is false — as it is on every deployed stage.                                                    | Added the Cognito Hosted UI authorization-code flow: a pool domain, `/admin/callback`, PKCE and state, and a logout that ends the Cognito session too.                 |
| **Nothing served `/uploads/*`.** `sst.aws.SvelteKit` creates only its own origins, so every published image would have 404'd.                                                                                                    | An `sst.aws.Router` now fronts both the app and the bucket, so they share one origin — which is what makes site-relative image URLs work.                              |
| **The API verified the wrong token type.** It asked for an access token but read `email`, a claim only the ID token carries. Every authenticated request would have 403'd.                                                       | `tokenUse: 'id'`.                                                                                                                                                      |
| **`PUBLIC_API_URL` and `PUBLIC_SITE_URL` were always `undefined`.** They were read from `$env/dynamic/private`, which deliberately excludes the `PUBLIC_` prefix. The `?? localhost` fallbacks hid it completely in development. | Read from `$env/dynamic/public`. The backoffice would otherwise have called `localhost:3000` from Lambda, and every email link would have pointed at `localhost:5173`. |
| **Both stages would have claimed the same domain.** `SITE_DOMAIN` had no stage component, and CI passes one variable to both stages — so a push to `main` could take the apex away from production.                              | The host is derived per stage in `sst.config.ts`.                                                                                                                      |
| **Staging would have been indexed by Google.** `static/robots.txt` shipped `Allow: /` to every stage, with production's sitemap URL hardcoded. Harmless only while staging had no public hostname.                               | A per-stage `robots.txt` route plus `X-Robots-Tag: noindex` on non-production, both gated on `ALLOW_INDEXING`.                                                         |

---

## Out of scope (Phases 2 and 3)

Phase 2 (WAF, Secrets Manager, X-Ray, SQS, EventBridge, SNS) and Phase 3
(Firehose → Athena → QuickSight, DynamoDB + WebSocket check-in, Rekognition,
Translate, Bedrock) are not built. Two seams exist for Phase 2:
`EmailDispatcher` in `packages/core/src/email/` swaps inline SES for an SQS
producer without touching call sites, and every Lambda already has its own
least-privilege role via SST resource linking.

### Still to do before a real event

- **Rate-limit registration and feedback.** Both are unauthenticated public
  writes. API Gateway throttling is configured and both carry honeypots; add a
  WAF rate rule (Phase 2).
- **PII retention.** Registrations hold name, email and phone, and feedback is
  linked to the registration that gave it. Agree a retention window and a
  deletion path.
- **The keyless map embed is unsupported.** `?output=embed` works today but is
  undocumented and could break without notice. Every piece of URL handling is in
  `packages/shared/src/maps.ts`, so switching to the official Maps Embed API
  (which needs a Google Cloud API key and billing account) is a change to
  `buildEmbedUrl` alone.
- **Uploaded images are never cleaned up.** Removing an image from an article
  leaves the object in the bucket. Harmless at this volume; worth a lifecycle
  rule or a sweep before it is not.

# awsuglaos-website
