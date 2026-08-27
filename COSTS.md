# Running costs

A costing of every service this project uses, built for budgeting rather than
for engineers. Figures are **USD**, region **Asia Pacific (Singapore),
`ap-southeast-1`**, and every unit price is taken from the AWS Price List API on
**27 August 2026** (per-service version dates are listed in
[Unit price reference](#unit-price-reference)).

> ### The budget line
>
> |                                          |                 |
> | ---------------------------------------- | --------------- |
> | Quiet month (no event)                   | **$5.94**       |
> | Typical month                            | **$9.10**       |
> | Event month                              | **$19.43**      |
> | **Year, at 4 events**                    | **$150.52**     |
> | **Recommended budget, +20% contingency** | **$180 / year** |
>
> There is no subscription and no minimum. AWS bills only for what is used, so
> a month with no activity costs less than a month with an event in it.

---

## How to read this

AWS does not charge a monthly fee. It meters roughly thirty separate things —
seconds of database time, gigabytes moved, emails sent — and adds them up. Two
consequences matter for planning:

1. **Most lines round to nothing at this scale.** A community website in
   Vientiane does not move enough data to register against AWS's free
   allowances. Of the ~20 metered services in use, **four** produce a bill worth
   noticing.
2. **The cost tracks activity, not size.** The database is the dominant line and
   it is billed by the second while it is awake. Traffic wakes it; silence lets
   it sleep for free.

Each section below states the assumption behind its number. Any assumption can
be changed and the arithmetic re-run — the model is a script, described in
[Keeping this current](#keeping-this-current).

---

## Scope and assumptions

**Included:** both deployed environments — `production` (the live site,
`awsug.la`) and `staging` (an identical copy used for testing, deployed
automatically on every code change). These are two complete, separate copies of
the infrastructure, so most fixed costs are paid twice.

**Volume assumptions**, agreed for this model:

| Assumption                         | Value     | Basis                                                                  |
| ---------------------------------- | --------- | ---------------------------------------------------------------------- |
| Events per year                    | 4         | agreed planning figure                                                 |
| Attendees per event                | ~50       | seeded capacities are 150 / 60 / 30                                    |
| Emails per registration            | exactly 1 | one confirmation with a ticket link; there is no bulk or reminder mail |
| Page views, typical month          | 3,000     | single-city audience                                                   |
| Page views, event month            | 9,000     | registration period plus event day                                     |
| Database awake time, typical month | 55 hours  | see [Where the money goes](#where-the-money-actually-goes)             |

**Excluded:** staff time, the annual domain registration fee (see
[Costs that are not AWS](#costs-that-are-not-aws)), and any service not currently
deployed. Options that have been discussed but not built — a web firewall,
containers — appear in [Cost risks](#cost-risks-and-what-triggers-them) with
prices, not in the totals.

**Currency:** AWS invoices this account in USD. No kip conversion is applied
here, since the exchange rate at invoice date is the finance team's to apply.

---

## The three scenarios

Each line is `quantity x unit price`. "List" is what the usage would cost at
full rates; "Billed" is what remains after AWS's permanent free allowances. The
gap between the two columns is real money that is currently not being charged —
see [What is free, and why](#what-is-free-and-why).

### Quiet month — no event, site live, light traffic

| Service                                               |           Quantity |          Unit price |      List |    Billed |
| ----------------------------------------------------- | -----------------: | ------------------: | --------: | --------: |
| Aurora database — compute                             |        15.0 ACU-hr |      $0.20 / ACU-hr |     $3.00 | **$3.00** |
| Aurora database — compute (staging)                   |         6.0 ACU-hr |      $0.20 / ACU-hr |     $1.20 | **$1.20** |
| Secrets Manager — database password x2                |          2 secrets |      $0.40 / secret |     $0.80 | **$0.80** |
| Route 53 — hosted zone (one, shared)                  |             1 zone |        $0.50 / zone |     $0.50 | **$0.50** |
| Aurora — storage (3 GB across both)                   |            3 GB-mo |       $0.11 / GB-mo |     $0.33 | **$0.33** |
| S3 — file storage (4 GB across both)                  |            4 GB-mo |      $0.025 / GB-mo |     $0.10 | **$0.10** |
| CloudFront — data transfer + requests                 | 1.2 GB / 38.8k req |          $0.12 / GB |     $0.20 |     $0.00 |
| Lambda — application compute                          |       1,059 GB-sec | $0.0000167 / GB-sec |     $0.02 |     $0.00 |
| CloudWatch — logs and metrics                         |         10 metrics |      $0.30 / metric |     $3.00 |     $0.00 |
| Everything else (API Gateway, SES, Cognito, VPC, ACM) |                  — |                   — |     $0.01 | **$0.01** |
| **Total**                                             |                    |                     | **$9.16** | **$5.94** |

### Typical month — content updates, normal traffic

| Service                                |         Quantity |          Unit price |       List |    Billed |
| -------------------------------------- | ---------------: | ------------------: | ---------: | --------: |
| Aurora database — compute              |      27.5 ACU-hr |      $0.20 / ACU-hr |      $5.50 | **$5.50** |
| Aurora database — compute (staging)    |       9.0 ACU-hr |      $0.20 / ACU-hr |      $1.80 | **$1.80** |
| Secrets Manager — database password x2 |        2 secrets |      $0.40 / secret |      $0.80 | **$0.80** |
| Route 53 — hosted zone                 |           1 zone |        $0.50 / zone |      $0.50 | **$0.50** |
| Aurora — storage                       |          3 GB-mo |       $0.11 / GB-mo |      $0.33 | **$0.33** |
| S3 — file storage                      |          6 GB-mo |      $0.025 / GB-mo |      $0.15 | **$0.15** |
| CloudFront — data transfer + requests  | 2.5 GB / 77k req |          $0.12 / GB |      $0.40 |     $0.00 |
| Lambda — application compute           |     1,899 GB-sec | $0.0000167 / GB-sec |      $0.03 |     $0.00 |
| CloudWatch — logs and metrics          |       10 metrics |      $0.30 / metric |      $3.00 |     $0.00 |
| Everything else                        |                — |                   — |      $0.02 | **$0.02** |
| **Total**                              |                  |                     | **$12.53** | **$9.10** |

### Event month — registration period, event day, photos uploaded after

| Service                                |          Quantity |          Unit price |       List |     Billed |
| -------------------------------------- | ----------------: | ------------------: | ---------: | ---------: |
| Aurora database — compute              |       77.0 ACU-hr |      $0.20 / ACU-hr |     $15.40 | **$15.40** |
| Aurora database — compute (staging)    |       10.0 ACU-hr |      $0.20 / ACU-hr |      $2.00 |  **$2.00** |
| Secrets Manager — database password x2 |         2 secrets |      $0.40 / secret |      $0.80 |  **$0.80** |
| Route 53 — hosted zone                 |            1 zone |        $0.50 / zone |      $0.50 |  **$0.50** |
| Aurora — storage                       |           4 GB-mo |       $0.11 / GB-mo |      $0.44 |  **$0.44** |
| S3 — file storage (event photos)       |          10 GB-mo |      $0.025 / GB-mo |      $0.25 |  **$0.25** |
| CloudFront — data transfer + requests  | 7.2 GB / 227k req |          $0.12 / GB |      $1.16 |      $0.00 |
| Lambda — application compute           |      5,403 GB-sec | $0.0000167 / GB-sec |      $0.09 |      $0.00 |
| CloudWatch — logs and metrics          |        10 metrics |      $0.30 / metric |      $3.00 |      $0.00 |
| SES — 65 confirmation emails           |         65 emails |    $0.00016 / email |      $0.01 |  **$0.01** |
| Everything else                        |                 — |                   — |      $0.03 |  **$0.03** |
| **Total**                              |                   |                     | **$23.69** | **$19.43** |

### Annual

At the agreed cadence of 4 events per year:

| Composition                       |      Annual | Monthly average |
| --------------------------------- | ----------: | --------------: |
| 4 event months + 8 typical months | **$150.52** |          $12.54 |
| 4 event + 6 typical + 2 quiet     |     $144.20 |          $12.02 |
| 4 event + 4 typical + 4 quiet     |     $137.88 |          $11.49 |

**Budget $180/year** — the highest composition plus 20%. The contingency covers
an extra event, a traffic spike, and the free-allowance risks noted below.

---

## The fixed floor

What AWS bills even if nobody visits the site all month and no event runs:

| Line                                                    |   Monthly |
| ------------------------------------------------------- | --------: |
| Secrets Manager — one database password per environment |     $0.80 |
| Route 53 — hosted zone for `awsug.la`                   |     $0.50 |
| Aurora — stored data, both environments                 |     $0.33 |
| S3 — stored images and documents                        |     $0.10 |
| **Fixed floor**                                         | **$1.73** |

Everything else scales to zero. The database is the important case: it **pauses
completely after five minutes of inactivity** and bills nothing for compute
while paused. That is a deliberate design decision
([sst.config.ts:60-74](sst.config.ts#L60-L74)) and it is what keeps the floor
this low. It costs about 15 seconds of delay on the first visit after a quiet
period.

---

## Where the money actually goes

**The database is roughly two-thirds of the bill, and it is billed by the
second while awake.** Everything else combined is under $2/month.

Aurora bills $0.20 per "capacity unit hour". The site's database runs at the
smallest size (0.5 units) under normal load, so the cost is essentially
`hours awake x $0.10`. Traffic wakes it; five idle minutes puts it back to
sleep.

This makes _awake hours_ the single assumption worth arguing about, so here is
the whole range:

| Database awake time                       | ACU-hours | Compute cost | Production total |
| ----------------------------------------- | --------: | -----------: | ---------------: |
| 15 hr/month (very quiet)                  |       7.5 |        $1.50 |           ~$5.10 |
| 30 hr/month                               |      15.0 |        $3.00 |           ~$6.60 |
| **55 hr/month (this model's assumption)** |  **27.5** |    **$5.50** |       **~$9.10** |
| 80 hr/month                               |      40.0 |        $8.00 |          ~$11.60 |
| 110 hr/month (event month)                |      55.0 |       $11.00 |          ~$14.60 |
| 240 hr/month (busy, 8 hr/day)             |     120.0 |       $24.00 |          ~$27.60 |
| Never sleeps, 24/7 at 0.5 ACU             |     360.0 |       $72.00 |          ~$75.60 |

The last row is the one to watch. **If the database is ever configured never to
sleep, the bill goes from ~$9 to ~$76 a month.** See
[Cost risks](#cost-risks-and-what-triggers-them).

---

## Production and staging

Every code change deploys automatically to a `staging` copy; releases deploy to
`production`. Two environments means two databases, two content delivery
networks, two login systems and two stored passwords.

|               | Production | Staging | Shared |     Total |
| ------------- | ---------: | ------: | -----: | --------: |
| Typical month |      $6.26 |   $2.34 |  $0.50 | **$9.10** |
| Share of bill |        69% |     26% |     5% |      100% |

**Retiring staging would save about $28/year.** That is a small saving against a
real loss of safety — staging is where a release is proven before it reaches the
public site. Recommendation: keep it. It is listed separately here so the choice
is visible, not because it is a good candidate for cutting.

---

## Per-service detail

### Aurora Serverless v2 (PostgreSQL) — the database

Stores events, registrations, articles, speakers, sponsors and feedback — 18
tables in all. Billed three ways: compute by the ACU-second while awake, storage
by the gigabyte-month, and I/O per million operations.

Configured to scale to zero ([sst.config.ts:72-73](sst.config.ts#L72-L73)) with a
ceiling of 4 units in production and 1 in staging. Storage grows slowly:
registration records are a few hundred bytes each, so 50 attendees adds well
under a megabyte.

|                         | Production | Staging |
| ----------------------- | ---------: | ------: |
| Compute (typical month) |      $5.50 |   $1.80 |
| Storage                 |      $0.22 |   $0.11 |
| I/O + Data API requests |      $0.01 |   $0.00 |

### Secrets Manager — $0.80/month

Not chosen; created automatically with each database to hold its password.
$0.40 per stored secret per month, one per environment. Small, but it is the
second-largest fixed line and it appears in no earlier estimate.

### Route 53 — $0.50/month

DNS for `awsug.la`. One hosted zone covers both `awsug.la` and
`staging.awsug.la`, so this is charged once, not twice. DNS lookups themselves
are free because the site's records point at CloudFront as aliases, which AWS
does not charge for.

### CloudFront — $0.00

The content delivery network that serves the site worldwide and absorbs most
traffic before it reaches the application. Pay-as-you-go usage keeps a
**permanent free allowance of 1 TB of data transfer and 10 million requests per
month**. This project's event-month peak is ~7 GB and ~227,000 requests —
about **0.7% of the data allowance and 2% of the request allowance**.

The binding limit is requests, not data: headroom before this line starts
costing anything is roughly **40 times** current event-month traffic.

One easy improvement: two logo files in
[apps/web/static/](apps/web/static/) are 2.3 MB between them and are not
optimised. Compressing them would cut per-visitor data materially. It does not
change the bill today — it buys headroom.

### Lambda — $0.00

Runs the website and the admin API on demand. Two functions: the site renderer
(1024 MB) and the API (512 MB). AWS gives **1 million requests and 400,000
GB-seconds free every month, permanently**; the event-month peak uses about
5,400 GB-seconds, or **1.4% of the allowance**.

### S3 — $0.10 to $0.25/month

Stores uploaded images, event photo galleries and slide decks. Charged at
$0.025 per GB-month. Transfer from S3 to CloudFront is free.

This line grows and never shrinks: there is no cleanup rule, and removing an
image from an article leaves the file behind. At current volumes that is
pennies, but see [Cost risks](#cost-risks-and-what-triggers-them).

### SES — under $0.02/month

Sends exactly two kinds of email: a registration confirmation with the ticket
link, and a welcome message when someone joins the newsletter. **One email per
person per action** — there is no bulk send, no reminder, no digest. At $0.16
per 1,000 emails, an event with 50 attendees costs **less than one cent**.

The declared volume for AWS's approval was "low hundreds per month"; even at
1,000 emails a month this line is $0.16.

### API Gateway — under $0.01/month

Front door for the admin API. $1.25 per million requests; the site makes a few
thousand.

### Cognito — $0.00

Admin login with mandatory two-factor authentication. Only staff have accounts —
around six people. The free allowance is 10,000 monthly active users.

### CloudWatch — $0.00, with a caveat

Collects logs and delivery metrics. Log volume is trivial (a few megabytes
against a 5 GB free allowance).

**The caveat:** email delivery tracking publishes 5 metrics per environment, 10
in total, which exactly fills the 10-metric free allowance. If those are billed
as custom metrics, or if an eleventh is ever added, the cost is **$0.30 per
metric per month — up to $3.00/month**. This is inside the contingency, but it
is the one line in this document where the free-tier treatment should be
confirmed against the first real invoice.

### VPC and certificates — $0.00

The private network carries no charge because it deliberately has **no NAT
Gateway** ([sst.config.ts:38-48](sst.config.ts#L38-L48)) — the single most
expensive mistake available in this architecture. HTTPS certificates from AWS
are free.

---

## What is free, and why

About $3.40 of monthly usage falls inside AWS's free allowances. Two different
kinds are in play, and the distinction matters:

**Permanent free tiers** — never expire, apply to every account:

| Service    | Allowance                               | This project's peak use      |
| ---------- | --------------------------------------- | ---------------------------- |
| CloudFront | 1 TB transfer, 10M requests / month     | 7 GB, 227k requests          |
| Lambda     | 1M requests, 400,000 GB-seconds / month | 7,800 requests, 5,400 GB-sec |
| Cognito    | 10,000 monthly active users             | ~6                           |
| CloudWatch | 10 metrics, 10 alarms, 5 GB logs        | 10 metrics, 1 alarm, <20 MB  |

Usage is 1–2% of these allowances almost everywhere. They are not a cliff this
project is anywhere near.

**The new-account tier — and it has changed.** Since **15 July 2025** AWS no
longer gives new accounts the old 12-month free trial. New accounts instead get
**$100 in credits on signup (up to $200 with setup activities), valid for
6 months or until spent**. Accounts opened before that date keep the legacy
12-month terms.

For budgeting: if this AWS account is new, **the first six months may cost
nothing at all**, with normal billing starting afterwards. Do not read a $0
invoice in month one as the steady state. The figures in this document are the
steady state.

---

## Costs that are not AWS

| Item                                         | Cost         | Note                                                                                                                                                                                                                            |
| -------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `awsug.la` domain registration               | ~$30–90/year | Paid to an external `.la` registrar — Route 53 cannot register `.la` domains. **Confirm the actual renewal figure with whoever holds the registration; it is not visible from the code and is excluded from the totals above.** |
| GitHub Actions (build and deploy automation) | **$0**       | The repository is public, and GitHub does not charge for standard runners on public repositories.                                                                                                                               |
| Google Maps embed                            | **$0**       | Event pages embed a map with no API key and no Google Cloud account. See [Cost risks](#cost-risks-and-what-triggers-them).                                                                                                      |
| Third-party software subscriptions           | **$0**       | There are none. No analytics, error tracking, email provider, CMS, payments or authentication service. Everything runs on AWS.                                                                                                  |

> **One correction for the record:** the project's `.env` file contains unused
> `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` settings. They are
> leftovers from an abandoned approach and no code reads them. **There is no
> third-party email provider to budget for** — email goes through AWS SES.

---

## Cost risks, and what triggers them

Ranked by how much damage each does. The first two are the ones worth a
conversation.

| Risk                                    |                         Impact | Trigger                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | -----------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NAT Gateway added to the network**    |          **+$43 to $86/month** | Someone enables `nat` on the VPC. Billed hourly whether used or not, per availability zone — and the default network spans two. Currently avoided by design; the code carries a comment explaining why ([sst.config.ts:38-48](sst.config.ts#L38-L48)). The repo elsewhere cites ~$32/month — that is the cheaper US rate for a single gateway; Singapore rates across two availability zones are higher. _Estimated from published rates, not the price file._ |
| **Database set never to sleep**         | **+$73/month per environment** | Raising the minimum capacity from 0 to 0.5 units. Sometimes suggested as a fix for the 15-second wake delay. It would cost more than everything else in this document combined.                                                                                                                                                                                                                                                                                |
| Web firewall (WAF) added                |                   +$8.60/month | Planned but not built. $5.00 per rule set + $1.00 per rule + $0.60 per million requests. Worth doing before a high-profile event — registration and feedback are open to anyone.                                                                                                                                                                                                                                                                               |
| Container hosting instead of serverless |                     +$10/month | A fallback approach, currently not needed. Runs continuously rather than on demand.                                                                                                                                                                                                                                                                                                                                                                            |
| Email metrics billed as custom metrics  |                   +$3.00/month | Ten metrics sit exactly on the free allowance. Confirm on the first invoice.                                                                                                                                                                                                                                                                                                                                                                                   |
| Uploaded files never cleaned up         |   +$0.03/month per GB, forever | No deletion rule exists, and removing an image from an article leaves the file in storage. Slow, permanent growth. A cleanup rule costs nothing to add.                                                                                                                                                                                                                                                                                                        |
| Traffic spike or scraping               |      +$0.12 per GB beyond 1 TB | Would require ~40x current traffic to begin charging (the 10M request allowance is reached before the 1 TB data allowance).                                                                                                                                                                                                                                                                                                                                    |
| Google Maps embed stops working         |               +$0 to ~$7/month | Event pages use an undocumented keyless embed. If Google withdraws it, the supported replacement needs a Google Cloud account with billing enabled. Low likelihood, but it is a _new vendor relationship_, not just a new charge.                                                                                                                                                                                                                              |

**A note on the firewall option:** AWS now sells CloudFront "flat-rate plans"
that bundle the firewall, DNS and CloudFront into one fixed price with no
overage charges — the Pro plan is **$15/month**. Against $8.60 for the firewall
alone, that is worth comparing if a firewall is ever added, because it also caps
the traffic-spike risk at zero.

---

## Controls already in place

- **Billing alarm at $20/month**, wired to email
  ([DEPLOYMENT.md:112-127](DEPLOYMENT.md#L112-L127)). Given a typical month of
  $9 and an event month of $19, this threshold will fire on a busy event month.
  **Recommend raising it to $30** and adding a second alarm at $75, which is the
  level that would indicate one of the two serious risks above has occurred.
- **Log retention capped** at 14 days on the API and 30 days on the website, so
  log storage cannot accumulate indefinitely.
- **Request rate limiting** at 50 requests/second on the API.
- **Deletion protection** on the production database.

### Recommended additions

1. **An AWS Budget defined in code.** Every cost guardrail today is a manual
   console setting that no one would notice was missing. A budget declared
   alongside the infrastructure is version-controlled and cannot be silently
   removed.
2. **Cost allocation tags per environment**, so the production/staging split in
   this document can be read directly off an AWS invoice instead of estimated.
3. **A storage cleanup rule**, before uploaded files become a line worth reading.

---

## Unit price reference

Every price below was read from the AWS Price List API for `ap-southeast-1` on
27 August 2026. The version date is AWS's own stamp on each price file.

| Service                                     | Unit price                                 | Price file |
| ------------------------------------------- | ------------------------------------------ | ---------- |
| Aurora Serverless v2 (PostgreSQL) compute   | $0.20 / ACU-hour                           | 2026-08-20 |
| Aurora storage                              | $0.11 / GB-month                           | 2026-08-20 |
| Aurora I/O                                  | $0.22 / million requests                   | 2026-08-20 |
| Aurora backup beyond free allocation        | $0.023 / GB-month                          | 2026-08-20 |
| RDS Data API                                | $0.42 / million requests                   | 2026-08-20 |
| Lambda compute (x86_64)                     | $0.0000166667 / GB-second                  | 2026-08-19 |
| Lambda compute (arm64)                      | $0.0000133334 / GB-second                  | 2026-08-19 |
| Lambda requests                             | $0.20 / million                            | 2026-08-19 |
| API Gateway HTTP API                        | $1.25 / million requests                   | 2026-07-24 |
| S3 Standard storage                         | $0.025 / GB-month                          | 2026-08-18 |
| S3 PUT / POST / LIST                        | $0.005 / 1,000 requests                    | 2026-08-18 |
| S3 GET                                      | $0.0004 / 1,000 requests                   | 2026-08-18 |
| S3 transfer to CloudFront                   | $0.00                                      | 2026-08-18 |
| CloudFront data transfer out (Asia Pacific) | $0.120 / GB, first 10 TB                   | 2025-07-01 |
| CloudFront HTTPS requests (Asia Pacific)    | $0.012 / 10,000                            | 2025-07-01 |
| CloudFront Functions                        | $0.10 / million, first 2M free             | 2025-07-01 |
| Route 53 hosted zone                        | $0.50 / month, first 25 zones              | 2026-08-26 |
| Route 53 alias queries to CloudFront        | $0.00                                      | 2026-08-26 |
| SES outbound (Essentials tier)              | $0.16 / 1,000 emails                       | 2026-07-22 |
| SES outbound (legacy rate)                  | $0.10 / 1,000 emails                       | 2026-07-22 |
| Cognito Lite                                | $0.0055 / monthly active user, 10,000 free | 2026-08-26 |
| Secrets Manager                             | $0.40 / secret / month                     | 2025-08-28 |
| Secrets Manager API calls                   | $0.05 / 10,000 requests                    | 2025-08-28 |
| CloudWatch log ingestion                    | $0.70 / GB                                 | 2026-08-06 |
| CloudWatch log storage                      | $0.03 / GB-month                           | 2026-08-06 |
| CloudWatch custom metrics                   | $0.30 / metric-month, 10 free              | 2026-08-06 |
| CloudWatch alarms                           | $0.10 / alarm-month, 10 free               | 2026-08-06 |
| AWS WAF web ACL / rule / requests           | $5.00 / $1.00 / $0.60 per million          | 2026-01-07 |
| ACM certificates                            | $0.00                                      | —          |
| VPC without NAT Gateway                     | $0.00                                      | —          |

**Sources**

- AWS Price List Bulk API — `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<service>/current/ap-southeast-1/index.json`
- [Amazon Aurora pricing](https://aws.amazon.com/rds/aurora/pricing/)
- [Amazon CloudFront pricing and flat-rate plans](https://aws.amazon.com/cloudfront/pricing/)
- [AWS Free Tier and the July 2025 change](https://aws.amazon.com/free/free-tier-faqs/)
- [CloudFront flat-rate pricing plans](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)

---

## Keeping this current

Two things go stale: AWS's prices, and this project's traffic.

**Prices** should be re-read from the Price List API before any budget cycle.
Each service's file carries its own version date, shown in the table above.

**Assumptions** — the awake hours, page views and attendee counts in
[Scope and assumptions](#scope-and-assumptions) — should be replaced with real
figures once the site has been live for a quarter. AWS Cost Explorer will show
the actual split. The estimates here are derived from the code (email sends per
registration, database writes per registration, cache settings per page), not
from measurement, and measurement should replace them as soon as it exists.

**The architecture** is documented in [DEPLOYMENT.md](DEPLOYMENT.md) and
[sst.config.ts](sst.config.ts). If a new AWS service appears in that file, it
belongs in this document too.
