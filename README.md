# AWS User Group Lao — Website

Public site (landing, news, events, registration) and backoffice for AWS User
Group Lao, built to double as a reference architecture the group can present at
meetups.

**Status:** Phase 1 is built and verified locally. It has **not been deployed** —
no AWS account existed when it was written. See [Deploying](#deploying).

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | SvelteKit 2 (Svelte 5, runes) + Tailwind v4 + shadcn-svelte |
| Rich text | TipTap 3 — stored as JSONB, rendered and sanitised server-side |
| i18n | Paraglide JS 2 — Lao (base, unprefixed) and English (`/en/*`) |
| API | Hono on Lambda behind API Gateway HTTP API |
| Domain logic | `packages/core`, shared by both entry points |
| Database | Postgres — Aurora Serverless v2 via the RDS Data API on AWS |
| ORM | Drizzle |
| Validation | Zod 4, shared between client and server |
| IaC | SST v4 (Pulumi/Terraform — **not** CDK) |
| Monorepo | Turborepo + pnpm workspaces |

### Features

Public: landing page, news, event listings and detail with an embedded venue
map, speaker line-up, per-event sponsors, registration with a QR ticket, and a
post-event feedback form. All bilingual.

Backoffice: dashboard, events, a reusable speaker directory, per-event line-up
and sponsor pickers, news with a rich text editor and image upload, sponsors,
QR check-in, feedback with averages, and user management.

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

Without `SES_FROM_ADDRESS` set, confirmation emails are printed to the API/web
console instead of sent. Nothing needs AWS to exercise the full flow.

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
ProseMirror *throws* on a node type outside the schema rather than dropping it,
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
current origin into every row, so moving from a preview host to `awsuglaos.la`
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

| Doc says | Reality |
|---|---|
| "SST v3 (built on AWS CDK)" | SST v3+ replaced CDK/CloudFormation with **Pulumi + Terraform**. Only v2 was CDK-based. This repo uses **v4**. |
| "Aurora v2 doesn't scale to zero — set 0.5 ACU" | Scale-to-zero shipped Nov 2024. 0.5 ACU ≈ $43/mo; 0 ACU ≈ storage only. Costs a ~15s resume and rules out RDS Proxy. |
| "Route 53 manages the `awsuglaos.la` domain" | `.la` is **not registrable** through Route 53. Register at a `.la` registrar and delegate NS to a Route 53 hosted zone. |
| `users(password_hash)` alongside Cognito | Two auth systems. Dropped; the table stores `cognito_sub`. |
| VPC placement unspecified | Decided explicitly — see above. |
| `registrations.qr_code_url` in S3 | Replaced with `ticket_code`. |

### Cost expectation

The "stays in/near Free Tier" claim needs qualifying: Aurora idle ~$1/mo,
Route 53 hosted zone $0.50, CloudWatch ~$0.50 at 14-day retention, SES ~$0.10
per 1,000 emails, and Lambda/API Gateway/CloudFront ≈ $0 at community scale.
**Phase 1 lands around $3–8/month**; Phase 2's WAF adds ~$6–8 (billed flat, not
free-tier). Verify current pricing before quoting these publicly.

---

## Deploying

**Not yet done.** Prerequisites, in order of lead time:

1. **Register `awsuglaos.la`** at a `.la` registrar (Route 53 cannot), create a
   Route 53 hosted zone, point the registrar's NS records at it.
2. **Request SES production access** — new accounts are sandboxed and can only
   email verified addresses. Approval takes 24–48h. Verify the domain, enable
   DKIM.
3. AWS account, IAM Identity Center, billing alarm.
4. **Install the AWS CLI** (not currently present on the dev machine).
5. GitHub OIDC → IAM deploy role; set `AWS_DEPLOY_ROLE_ARN` (secret) and
   `SITE_DOMAIN` / `SES_FROM_ADDRESS` (variables) on the repo.

Then:

```bash
pnpm sst deploy --stage staging
pnpm sst shell --stage staging -- pnpm db:migrate
```

> **Open question before the first deploy.** `sst.aws.SvelteKit` expects the
> `svelte-kit-sst` adapter in place of `adapter-node`. That package was last
> published in the SST v2 era and has not tracked SvelteKit 2.70 / Svelte 5 /
> Vite 8, so it may not build. If it fails, the fallback is a container deploy
> (`sst.aws.Cluster` + `sst.aws.Service`), which reuses the `adapter-node` build
> this repo already produces — at the cost of an always-on Fargate task (~$10+/
> month), which undercuts the free-tier goal. This is the one part of
> `sst.config.ts` that could not be verified without an AWS account.

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
