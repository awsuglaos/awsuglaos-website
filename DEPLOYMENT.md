# Deploying to AWS

A step-by-step runbook for taking this repository to a running site on
`awsug.la`. Every step is either a copy-pasteable command or a console
click-path, and every phase ends with something you can check.

**Deployment is driven entirely from GitHub Actions.** You never run
`sst deploy` from your own machine, which is why the AWS CLI is not a
prerequisite — where a command line is genuinely needed, this guide uses AWS
CloudShell in the browser instead.

|              |                                           |
| ------------ | ----------------------------------------- |
| Region       | `ap-southeast-1` (Singapore)              |
| Repository   | `awsuglaos/awsuglaos-website`             |
| SST app name | `awsug-lao`                               |
| Staging      | every push to `main` → `staging.awsug.la` |
| Production   | every tag matching `v*` → `awsug.la`      |

## You are here

Already done, so skip Phases 1 and 2:

- [x] AWS account, admin access
- [x] GitHub OIDC identity provider and the deploy role
- [x] SES set up — but check §5.1, the domain identity is better than the
      single-address one now that the domain exists
- [x] `awsug.la` registered, Route 53 hosted zone created, NS delegated

Still to do: **[Phase 3](#phase-3--configure-the-repository)** onward — the
repository variables, then the web app, API, database and Cognito, which all
arrive together in the first deploy.

### One domain, two stages

You set **one** repository variable, `SITE_DOMAIN=awsug.la` — the _root_
domain. `sst.config.ts` derives the actual host from the stage:

- `production` → `awsug.la`, plus a redirect from `www.awsug.la`
- every other stage → `<stage>.awsug.la`, so staging is
  `staging.awsug.la`

Do not set `SITE_DOMAIN` to the staging host. It is derived, not configured.

### What it costs

Roughly **$4–9/month** at community scale: Aurora idle ~$1 (storage only —
compute genuinely bills nothing while paused), the Route 53 hosted zone $0.50,
CloudWatch ~$0.50 at 14-day retention, SES ~$0.10 per 1,000 emails, and Lambda,
API Gateway, CloudFront and S3 effectively $0. ACM certificates are free.

Verify current pricing before quoting these publicly.

### One thing is still not included

**SES is in the sandbox** unless production access has been approved. Email only
reaches addresses you have explicitly verified. See
[Phase 5](#phase-5--email-ses) — it is the one hard blocker for running a real
event.

---

## Phase 0 — Before you start

You need:

- [ ] An AWS account you can sign into as the root user
- [ ] Admin access to the `awsuglaos/awsuglaos-website` GitHub repository
      (Settings → you can see "Environments" and "Secrets and variables")
- [ ] An authenticator app on your phone — Authy, 1Password, Google
      Authenticator. Cognito requires TOTP for backoffice accounts and there is
      no way to skip it.

---

## Phase 1 — Account groundwork

> **Already done — skip to [Phase 3](#phase-3--configure-the-repository).** Kept
> here because it is the part most easily left half-finished, and because this
> runbook is meant to work for a fresh account too. Worth a glance at 1.3 if you
> never confirmed the billing alarm's SNS subscription — an unconfirmed topic
> sends nothing, silently.

All console work. Fifteen minutes, once, and it is the difference between a
mistake costing $5 and costing $500.

### 1.1 Lock down the root user

1. Sign in as root → click your account name (top right) → **Security
   credentials**.
2. Under **Multi-factor authentication (MFA)**, choose **Assign MFA device** and
   register your authenticator app.
3. Confirm there are **no access keys** listed under "Access keys". If there are,
   delete them. Root access keys have no legitimate use.

### 1.2 Create an admin user in IAM Identity Center

Do not keep working as root — use it only for billing and account closure.

1. Console → **IAM Identity Center** → **Enable**. Accept the default region if
   prompted; it does not have to match `ap-southeast-1`.
2. **Users** → **Add user**. Use your own email. You will get an invitation
   email; accept it and set a password.
3. **Permission sets** → **Create permission set** → **Predefined** →
   `AdministratorAccess`.
4. **AWS accounts** → select your account → **Assign users or groups** → pick
   your user and the `AdministratorAccess` permission set.

From here on, sign in through the Identity Center portal URL shown on the
dashboard (`https://d-xxxxxxxxxx.awsapps.com/start`). Bookmark it.

### 1.3 Set a billing alarm

A scale-to-zero database and a misconfigured NAT Gateway look identical on day
one and very different on day thirty.

1. Console → **Billing and Cost Management** → **Billing preferences** → tick
   **Receive AWS Free Tier alerts** and enter your email.
2. **Cost Explorer** → **Enable Cost Explorer** (it takes ~24h to populate).
3. Switch region to **US East (N. Virginia)** — billing metrics only exist there
   — then **CloudWatch** → **Alarms** → **Create alarm** → **Select metric** →
   **Billing** → **Total Estimated Charge** → `USD`.
   - Threshold: **Greater than 20** USD
   - Create a new SNS topic, enter your email, and **confirm the subscription
     email that arrives** — an unconfirmed topic sends nothing.

**Verify:** you received and clicked the SNS confirmation link, and the alarm
shows state `OK` (or `Insufficient data` on day one).

---

## Phase 2 — The GitHub deploy role

> **Already done — skip to [Phase 3](#phase-3--configure-the-repository).** Read
> 2.2's trust policy once anyway: it is what confines a role holding
> `AdministratorAccess` to this one repository, and it is the single thing here
> most worth getting exactly right.

GitHub Actions authenticates to AWS with OpenID Connect: GitHub mints a
short-lived token for each run and AWS exchanges it for temporary credentials.
No long-lived access key is ever stored in the repository.

Switch the console to **`ap-southeast-1`** now and stay there for everything
that follows.

### 2.1 Register GitHub as an identity provider

1. Console → **IAM** → **Identity providers** → **Add provider**.
2. Provider type: **OpenID Connect**.
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
3. **Add provider**.

> If it says the provider already exists, someone has done this before — that is
> fine, an account only ever needs one. Skip to 2.2.

> **Do not copy this provider's ARN.** It ends in
> `:oidc-provider/token.actions.githubusercontent.com` and is not what the
> workflow needs. The ARN you want belongs to the _role_ you create in 2.2 and
> ends in `:role/…`. Mixing them up is the single most common way this phase
> goes wrong.

### 2.2 Create the role

Two ways. **The CloudShell one is recommended** — it is exact, idempotent, and
ends by printing the one value you need. The console flow involves a form that
rewrites your trust policy behind you, which is where this step usually goes
wrong.

#### Option A — CloudShell (recommended)

**First, get your repository's OIDC subject prefix.** Run this wherever you have
the `gh` CLI (your own machine, not CloudShell):

```bash
gh api /repos/awsuglaos/awsuglaos-website/actions/oidc/customization/sub \
  --jq .sub_claim_prefix
```

It prints something like `repo:awsuglaos@315628610/awsuglaos-website@1330456491`.

> **Those `@number` parts are not decoration.** Every repository created after
> **15 July 2026** uses GitHub's immutable subject claim, which embeds the
> numeric org and repo IDs so a recycled name cannot mint a matching token. A
> trust policy written in the older `repo:org/repo:...` form matches nothing and
> fails with `Not authorized to perform sts:AssumeRoleWithWebIdentity`. Never
> hand-write this prefix — read it from the command above.

Then open **CloudShell** (the `>_` icon in the console top bar), paste your
prefix into the first line, and run the block. It is safe to re-run: it updates
rather than duplicates.

```bash
SUB_PREFIX='paste-the-prefix-from-above'
ROLE_NAME=github-actions-awsug-lao-deploy
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

cat > /tmp/trust.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": [
            "${SUB_PREFIX}:environment:staging",
            "${SUB_PREFIX}:environment:production"
          ]
        }
      }
    }
  ]
}
JSON

aws iam create-role --role-name "$ROLE_NAME" \
  --assume-role-policy-document file:///tmp/trust.json \
  --description "GitHub Actions OIDC deploy role for awsug-lao" >/dev/null 2>&1 \
  || aws iam update-assume-role-policy --role-name "$ROLE_NAME" \
       --policy-document file:///tmp/trust.json

aws iam attach-role-policy --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

echo
echo "AWS_DEPLOY_ROLE_ARN ="
aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text
```

The last line is the value for the GitHub secret. It starts with `arn:` and
contains `:role/`.

> If the first command fails with `NoSuchEntity` mentioning
> `oidc-provider`, the identity provider from 2.1 does not exist yet. Go back
> and create it, then re-run this block.

#### Option B — console

1. **IAM** → **Roles** → **Create role** → **Web identity**.
2. Identity provider: `token.actions.githubusercontent.com`; Audience:
   `sts.amazonaws.com`. Fill in the GitHub organisation (`awsuglaos`) and
   repository (`awsuglaos-website`) if the form asks for them — step 5 replaces
   whatever trust policy the form generates, so the values here only need to get
   you past the wizard.
3. Permissions: attach **`AdministratorAccess`**.
4. Name it **`github-actions-awsug-lao-deploy`** and create it.
5. Open the new role → **Trust relationships** → **Edit trust policy** and
   replace the whole document with this, making **two** substitutions: your
   12-digit account ID, and `SUB_PREFIX` (both occurrences) with the value from
   `gh api /repos/OWNER/REPO/actions/oidc/customization/sub --jq .sub_claim_prefix`
   — see the warning in Option A about why you cannot type that prefix by hand:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": [
            "SUB_PREFIX:environment:staging",
            "SUB_PREFIX:environment:production"
          ]
        }
      }
    }
  ]
}
```

6. Copy the **role** ARN from the summary at the top of the role's page. It
   looks like `arn:aws:iam::123456789012:role/github-actions-awsug-lao-deploy` —
   twelve digits for the account, then `:role/`. If what you copied contains
   `oidc-provider`, it is the identity provider from 2.1, not the role.

#### Storing it without a trailing newline

Pasting into the GitHub secret box can carry an invisible line break. Setting it
from the `gh` CLI cannot:

```bash
ARN='paste-the-role-arn-here'
gh secret set AWS_DEPLOY_ROLE_ARN --env staging    --body "$ARN"
gh secret set AWS_DEPLOY_ROLE_ARN --env production --body "$ARN"
```

The workflow validates the shape of this value before using it, so a mistake
fails in seconds with a specific message rather than after a two-minute retry
loop.

### Why `AdministratorAccess`

SST provisions across VPC, RDS, Cognito, CloudFront, Lambda, API Gateway, S3,
ACM, CloudWatch **and IAM** — it creates a least-privilege execution role per
function, which itself requires broad IAM permissions. A hand-written policy
would need revising every time the infrastructure grows, and a deploy that fails
half-way on a missing permission leaves a partial stack.

**The trust policy, not the permission set, is what confines this role.** The
`sub` condition above means only a workflow run in this specific repository, in
one of these two named environments, can assume it. Nothing else in the world
can — not a fork, not a pull request from a fork, not another repository in the
same organisation.

That said, this is a deliberate trade. Anyone who can push to `main` can do
anything in this AWS account. Protect the `production` environment with a
required reviewer (Phase 3) and keep the repository's push permissions tight.

**Verify:** the role's **Trust relationships** tab lists both `repo:...` strings,
and the **Permissions** tab shows `AdministratorAccess`.

---

## Phase 3 — Configure the repository

### 3.1 Create the environments

GitHub → repository **Settings** → **Environments** → **New environment**.
Create two, named exactly:

- `staging`
- `production`

On `production`, tick **Required reviewers** and add yourself. That turns every
production deploy into a deliberate click, and it is the cheapest safeguard
available.

### 3.2 Set the secret and variables

**Settings** → **Secrets and variables** → **Actions**.

Under the **Secrets** tab, **New repository secret**:

| Name                  | Value                      |
| --------------------- | -------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | the role ARN from step 2.2 |

Under the **Variables** tab, **New repository variable**:

| Name               | Value              | Notes                                 |
| ------------------ | ------------------ | ------------------------------------- |
| `AWS_REGION`       | `ap-southeast-1`   |                                       |
| `SITE_DOMAIN`      | `awsug.la`         | The **root** domain. Not a subdomain. |
| `SES_FROM_ADDRESS` | `noreply@awsug.la` | Must be verified in SES — see Phase 5 |

> **`SITE_DOMAIN` is the root domain, and only the root domain.** Both stages
> read the same variable and each derives its own host from it — production
> takes the apex, everything else takes `<stage>.awsug.la`. Setting it to
> `staging.awsug.la` would give you `staging.staging.awsug.la`, and
> setting a per-environment override would make staging and production fight
> over the apex certificate.

**Verify:** Settings → Environments shows `staging` and `production`, and the
Actions variables list shows all three variables above.

---

## Phase 4 — Understand what will be created

Worth thirty seconds before you push, so nothing on the bill is a surprise.

| Component  | Resource                                            | Idle cost          |
| ---------- | --------------------------------------------------- | ------------------ |
| `Vpc`      | VPC, subnets, security groups. **No NAT Gateway**   | $0                 |
| `Database` | Aurora Serverless v2 Postgres, Data API on, 0–1 ACU | storage only       |
| `Router`   | One CloudFront distribution                         | $0                 |
| `Uploads`  | Private S3 bucket, read through CloudFront          | ~$0                |
| `UserPool` | Cognito user pool + hosted UI domain                | free at this scale |
| `Api`      | API Gateway HTTP API + one arm64 Lambda             | $0                 |
| `Web`      | SvelteKit server Lambda + static assets             | $0                 |

SST also creates its own state bucket (`sst-state-…`) on the first deploy. Leave
it alone — deleting it orphans the entire stack.

**The database pauses when idle.** First request after a quiet period waits ~15
seconds while Aurora resumes. CloudFront serves cached pages, so it is rarely a
visitor who waits — but it will catch you when testing.

For why the stack is shaped this way at all, see
[Architecture decisions](#architecture-decisions).

---

## Phase 5 — Email (SES)

You have already set SES up. Two things are worth revisiting now that the domain
exists, and one is a hard blocker.

### 5.1 Verify the domain, not just an address

If you verified a single address (a Gmail one, say), switch to a **domain**
identity. An unverified sending domain means no DKIM and no DMARC alignment, so
a meaningful share of registration confirmations land in spam — and an attendee
who never got their ticket does not email you to say so.

1. Console → **Amazon Simple Email Service** (region `ap-southeast-1`) →
   **Identities** → **Create identity**.
2. Choose **Domain**, enter `awsug.la`.
3. Enable **DKIM signing**. Because the hosted zone is in the same account, let
   SES **publish the CNAME records to Route 53 for you** — accept the checkbox
   rather than copying records by hand.
4. Wait for the identity to show **Verified**. Usually minutes.

Then set the `SES_FROM_ADDRESS` variable to `noreply@awsug.la`. With a
verified domain, any address at that domain can send — the mailbox does not have
to exist.

### 5.2 While sandboxed, verify your test recipients

Add an email-address identity for every address you intend to test event
registration with. Otherwise the send fails and the visitor sees nothing.

### 5.3 Request production access

If you have not already:

1. SES → **Account dashboard** → **Request production access**.
2. Mail type: **Transactional**.
3. Website URL: `https://awsug.la`.
4. Use case: describe it honestly — a community user group sending event
   registration confirmations, QR tickets, and post-event feedback links to
   people who signed up on the site. Say that recipients are opt-in only, that
   the newsletter carries an unsubscribe link, and give your expected volume
   (low hundreds per month).

> **This is a hard blocker for a real event.** Sandboxed, an attendee who
> registers gets no confirmation and no ticket. Do not schedule an event before
> this is approved — it takes 24–48 hours.

**Verify:** `awsug.la` shows **Verified** with **DKIM: Successful** on the
Identities page.

---

## Phase 5.5 — DNS pre-flight

Sixty seconds, and it saves a stalled deploy.

The first deploy requests an ACM certificate for `staging.awsug.la` and
validates it by writing records into your Route 53 hosted zone. If the registrar
is not actually delegating to that zone, validation never completes: the deploy
hangs for about 30 minutes and then fails.

Open **CloudShell** (the `>_` icon in the console top bar) and run:

```bash
dig +short NS awsug.la
```

**Expect** four `ns-*.awsdns-*` hostnames matching the NS record set in your
Route 53 hosted zone. If you see your registrar's nameservers instead,
delegation has not propagated — wait and re-check before deploying.

---

## Phase 6 — The first deploy

Everything is in place. Deploy by pushing to `main`.

```bash
git push origin main
```

Then GitHub → **Actions** → open the running workflow.

### What happens

The `verify` job runs first: lint, typecheck, 86 unit tests, and 27 Playwright
end-to-end tests against a real Postgres. **The deploy will not start unless all
of that passes** — a red `verify` is the pipeline working correctly.

Then `deploy`:

1. Assumes the AWS role over OIDC.
2. `sst deploy --stage staging` — creates everything in Phase 4.
3. `sst shell --stage staging -- pnpm db:migrate` — applies migrations to Aurora
   over the Data API.
4. A smoke test polls the site until it returns HTTP 200.

**Expect 20–35 minutes on the first run.** Aurora takes ~10 minutes, the ACM
certificate has to be issued and DNS-validated, and CloudFront takes ~5–15 to
propagate. Later deploys are 2–4 minutes because none of that repeats.

If the run appears stuck on the certificate, that is Phase 5.5 telling you
something — cancel it and re-check `dig`.

### Find your URLs

In the workflow log, expand the **Deploy** step and scroll to the bottom:

```
web: https://staging.awsug.la
api: https://abcd1234.execute-api.ap-southeast-1.amazonaws.com
userPool: ap-southeast-1_XXXXXXXXX
userPoolClient: 1a2b3c4d5e6f7g8h9i0j
cognitoDomain: https://awsug-lao-staging.auth.ap-southeast-1.amazonaws.com
databaseCluster: arn:aws:rds:ap-southeast-1:...:cluster:...
```

Everything below refers to the `web` URL as **`<SITE_URL>`** — on staging that
is `https://staging.awsug.la`.

DNS for the subdomain is created by SST in your hosted zone, so nothing needs
adding at the registrar. Resolution can lag a few minutes behind the deploy.

**Verify:**

- `<SITE_URL>` loads the landing page in Lao
- `<SITE_URL>/en` loads it in English
- `<SITE_URL>/events` and `<SITE_URL>/news` render (empty is correct — nothing
  is published yet)
- `<SITE_URL>/admin` redirects to a login page offering **Continue with
  Cognito**

The database is migrated but empty, and no one can sign in yet. That is Phase 7.

> **Do not run `pnpm db:seed` against a deployed stage.** The seed inserts demo
> events, sponsors, articles and an `editor@awsug.la` user. It exists for
> local development. Cleaning it out of production is tedious and easy to get
> half-right.

---

## Phase 7 — Bootstrap the first admin

Backoffice access needs two things, and each is normally created by the other:
a row in the `users` table (created through the backoffice) and a Cognito user
(created by the backoffice's invite flow). The first one has to be placed by
hand. Both halves are console-only.

Sign-in works like this: Cognito proves **who you are**; the `users` table
decides **what you may do**. A valid Cognito login with no matching row is
rejected — which also means removing a row revokes access immediately.

### 7.1 Insert the users row

The RDS Data API is enabled, so the console's Query Editor can reach the
database directly. No VPN, no bastion, no local client.

1. Console → **RDS** → **Query Editor**.
2. Connect:
   - Database instance: the `awsug-lao-staging` Aurora cluster
   - Database username: **Connect with a Secrets Manager ARN**, and paste the
     cluster's secret ARN (RDS → your cluster → **Configuration** →
     **Manage master credentials** shows it; it is also the `DB_SECRET_ARN` in
     the Lambda's environment variables)
   - Database name: `awsug_lao`
3. Run, with your own email and name:

```sql
INSERT INTO users (email, name, role)
VALUES ('ketsadaphoneofficial@gmail.com', 'Your Name', 'admin');
```

`id`, `created_at` and `updated_at` fill themselves in. `cognito_sub` stays
null — the API binds it automatically the first time you sign in.

If the cluster is paused this first query may time out. Run it again; the
attempt itself wakes the database.

### 7.2 Create the Cognito user

1. Console → **Amazon Cognito** → **User pools** → `awsug-lao-staging-…`.
2. **Users** → **Create user**.
   - Invitation message: **Send an email invitation**
   - Email address: **exactly the same address** as the SQL above
   - Mark email address as verified: **yes**
   - Password: **Generate a password**
3. Create. AWS emails a temporary password from Cognito's own sender, so this
   works regardless of the SES sandbox.

### 7.3 Sign in

1. Go to `<SITE_URL>/admin` → **Continue with Cognito**.
2. Enter your email and the temporary password.
3. Set a permanent password — minimum 12 characters, with upper case, lower
   case, a number and a symbol.
4. Scan the QR code with your authenticator app and enter the six-digit code.
   **MFA is mandatory**, by design.
5. You land on the dashboard.

**Verify:** the dashboard renders with zero counts across the board.

Every later admin or editor is added from **Backoffice → Users**, which creates
the Cognito user and the database row together. This bootstrap is a one-time
cost.

---

## Phase 8 — Verify the deployment properly

A green pipeline proves the infrastructure exists. It does not prove the parts
talk to each other. Work through this in order — each step exercises a seam that
nothing before it touched.

| #   | Do this                                                     | Proves                                                 |
| --- | ----------------------------------------------------------- | ------------------------------------------------------ |
| 1   | Load `<SITE_URL>` and `<SITE_URL>/en`                       | CloudFront → SvelteKit Lambda                          |
| 2   | Sign in at `/admin`                                         | Cognito hosted UI, the callback, ID token verification |
| 3   | Create a speaker with a **photo upload**                    | Presigned S3 PUT, bucket CORS                          |
| 4   | Reload the speaker page and confirm the photo displays      | **The `/uploads/*` CloudFront route**                  |
| 5   | Create and publish an event                                 | Backoffice → API → Aurora over the Data API            |
| 6   | Register for it as a visitor, with a verified email address | Public write path, capacity claim                      |
| 7   | Open the ticket link and confirm the QR renders             | Ticket code generation                                 |
| 8   | Check the registration email arrived                        | SES                                                    |
| 9   | Scan the ticket at `/admin/checkin`                         | Check-in flow                                          |
| 10  | Sign out, then sign in again                                | Cognito logout actually ended the session              |

**Step 4 is the one to watch.** An image that uploads successfully but shows as
broken means the CloudFront route to the bucket is not resolving — see
[Troubleshooting](#troubleshooting).

**Step 8** only works if the recipient address is verified in SES while the
account is sandboxed.

**Also worth one check:** `curl -sI https://staging.awsug.la | grep -i x-robots-tag`
should return `noindex, nofollow`, and `/robots.txt` should read `Disallow: /`.
Staging is a byte-for-byte copy of production on a real public hostname, so
without both of those it competes with the live site in search results. On
production the header is absent and `/robots.txt` carries the real ruleset.

---

## Phase 9 — Changing the domain later

The domain is already wired in, so this phase is only relevant if the site ever
moves — a rename, or a second domain.

`SITE_DOMAIN` feeds a single `siteUrl` value in `sst.config.ts`, and everything
origin-dependent derives from it. One variable change plus a redeploy moves all
of them together:

- the Cognito callback and logout URLs
- the uploads bucket's CORS origin
- the links in outgoing email
- the `Sitemap:` line in `/robots.txt`, which is built from the request origin

**Stored image URLs are safe.** They are saved site-relative
(`/uploads/2026/08/….png`, never absolute), specifically so that changing the
domain does not strand every image ever published. This is why `/uploads/*` is
served from the site's own CloudFront distribution rather than a separate host.

**What is not automatic:** the old certificate and Route 53 records are left
behind, and anyone holding a bookmark gets nothing. Add a redirect if the old
domain matters.

---

## Phase 10 — Production

Staging and production are fully separate stacks — separate database, separate
user pool, separate bucket, separate hostname. Nothing is shared.

Production claims the apex `awsug.la` and redirects `www.awsug.la` to
it. Staging keeps `staging.awsug.la`; the two never contend for the same
certificate.

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow reads the tag, targets the `production` environment, and — because
you added a required reviewer in Phase 3 — waits for your approval before
touching AWS.

**Production behaves differently in two ways**, both set in `sst.config.ts`:

- `removal: 'retain'` — deleting the app leaves the database and bucket in
  place.
- `protect: true` — `sst remove --stage production` is refused outright.

Production also scales Aurora to a 4 ACU ceiling instead of 1.

**Repeat Phase 7 for production.** It has its own empty database and its own
user pool, so the first admin has to be bootstrapped again.

### Rolling back

Re-tag the last known-good commit and push:

```bash
git tag v1.0.1 <good-commit-sha>
git push origin v1.0.1
```

Code and infrastructure roll back cleanly. **Migrations do not** — Drizzle
migrations are forward-only. If a release includes a destructive schema change,
take a manual RDS snapshot before deploying it.

---

## Operations

**Logs.** CloudWatch → Log groups, 14-day retention (unbounded retention is a
quiet cost leak):

- `/aws/lambda/awsug-lao-<stage>-ApiFunction` — the Hono API
- `/aws/lambda/awsug-lao-<stage>-WebServer` — SvelteKit SSR

**The 15-second first request** after an idle period is Aurora resuming, not a
fault. It settles once there is steady traffic. Before a meetup, load a page a
minute beforehand to warm it.

**Database access** is through the RDS Query Editor, as in Phase 7. There is no
public endpoint and no bastion host to maintain.

**Removing a stage:**

```bash
sst remove --stage staging     # from CloudShell, or locally with credentials
```

Production refuses this. That is intentional.

---

## Architecture decisions

Why the stack is shaped the way it is. Recorded here so these get answered once
rather than re-litigated — and because this project doubles as a reference
architecture the group presents at meetups.

### Why not AWS Amplify Hosting?

It is a fair question: Amplify is the obvious "deploy a full-stack app" answer,
and it is genuinely simpler for the case it covers. It does not cover this one.

**Amplify Hosting hosts the frontend.** It would replace exactly one of the
seven components in Phase 4 — `Web`. It does not create Aurora, Cognito, the S3
bucket, API Gateway, or the Hono API Lambda. Those still need SST or CDK, so the
result is two infrastructure tools instead of one, and SST-generated values
(`DB_CLUSTER_ARN`, `COGNITO_CLIENT_ID`, `PUBLIC_API_URL`) have to be copied by
hand into the Amplify console as environment variables. That copy is a standing
source of drift: rotate the database or recreate the pool and the frontend keeps
pointing at the old one until someone remembers.

Three frictions are specific to this repository:

- **The `/uploads/*` route becomes impossible.** Amplify's CloudFront
  distribution is fully managed and not reachable from your account, so a
  behaviour pointing at the S3 bucket cannot be added. The workaround is a
  200-rewrite to a second distribution, which proxies every image read through
  billed SSR compute instead of serving it from the edge for free. It also
  breaks the property that makes site-relative image URLs safe.
- **AWS does not maintain a SvelteKit adapter for Amplify.** Its own
  documentation says so and points at a community package. That package has one
  maintainer and does not state which SvelteKit versions it supports. `svelte-kit-sst`
  is also community-maintained, but it is first-party to the tool already in use
  here.
- **pnpm + Turborepo needs `node-linker=hoisted` in `.npmrc`**, which changes
  how the workspace resolves locally too — a build-environment constraint
  leaking into everyone's machine.

**What about Amplify Gen 2?** That is the genuinely full-stack option — it
defines auth, data and storage in TypeScript. But its data layer generates an
AppSync GraphQL API. This app is Hono + Drizzle + `packages/core`, where the
domain logic is written once and shared by the API and the SvelteKit form
actions. Adopting Gen 2 means discarding the API, the core package and every
domain rule — the whole codebase except the UI.

**Where Amplify would genuinely win:** per-PR preview environments with no
setup, and no IaC to learn for the web tier. If those outweigh the above for a
future project, it is a reasonable choice. For this one it trades a working
single-tool deploy for two tools and a worse upload path.

### Why Lambda sits outside the VPC

Aurora must live in a VPC — that is not optional. The functions do not have to
join it, and deliberately do not: they reach the database over the RDS Data
API's HTTPS endpoint instead.

That removes the NAT Gateway, which costs ~$32/month billed whether or not
anything runs — several times the rest of this stack combined — and removes the
ENI attachment cold-start penalty. It is also the only option compatible with
Aurora scale-to-zero, because RDS Proxy blocks auto-pause.

### Why the Data API rather than RDS Proxy

RDS Proxy is the usual answer to Lambda exhausting database connections. It is
incompatible with scale-to-zero, and it requires the function to be inside the
VPC, which reintroduces the NAT Gateway. The Data API gives connection pooling
over HTTPS with neither cost.

It also has a side benefit worth knowing: the RDS Query Editor in the console
works, which is why Phase 7 needs no bastion host and no VPN.

### Why uploads are presigned and same-origin

The browser PUTs straight to S3; the API only signs the request. API Gateway
caps a request body at 10MB and Lambda at 6MB, so routing an 8MB photo through
the function would fail outright.

Reads go through the site's own CloudFront distribution at `/uploads/*`, which
is what lets image URLs be stored site-relative. Absolute URLs would bake the
current origin into every database row, so moving domains would strand every
image ever published.

---

## Troubleshooting

Keyed to the message you will actually see.

**`Could not assume role with OIDC: Request ARN is invalid`**
STS rejected the ARN as malformed — this is about the string, not about
permissions, so the trust policy is not the problem. The workflow's "Check the
deploy role ARN" step names the specific fault. The usual causes, in order:
the OIDC **provider** ARN was pasted instead of the **role** ARN (see 2.1); a
trailing newline came along with the paste; the account id is not twelve
digits; or the value is a bare role name rather than a full ARN.

Note that the secret shows in the log as `***` whether it is right or wrong —
masking only means it is non-empty, never that it is correct.

**`Not authorized to perform sts:AssumeRoleWithWebIdentity`**
The ARN is fine — STS found the role — and its trust policy refused the request.
Almost always the `sub` condition does not match the token.

The workflow prints the answer. Open the **Show the OIDC subject claim** step in
the failed run, take the `sub:` line, and compare it character by character with
the `token.actions.githubusercontent.com:sub` values in the role's trust policy.
They must be identical.

The usual mismatch is the **immutable subject claim**. Repositories created
after 15 July 2026 present a subject like

```
repo:myorg@315628610/myrepo@1330456491:environment:staging
```

while older guidance (and most blog posts) writes it as
`repo:myorg/myrepo:environment:staging`. The numeric org and repo IDs are
required, and no amount of correct-looking org/repo naming substitutes for them.

Also confirm the deploy job runs under an environment named exactly `staging` or
`production` — the `:environment:` segment comes from that.

**`No "build" script found within package.json`**
SST is looking at the wrong directory. `path: 'apps/web'` must be correct
relative to the repository root.

**`DEV_AUTH must not be enabled when NODE_ENV=production`**
The local development shim reached a deployed stage. `sst.config.ts` hardcodes
`DEV_AUTH: 'false'`; if you see this, something is overriding it — check for a
committed `.env` file. SST loads `.env` and `.env.<stage>` into the config, and
**`.env` takes precedence over `.env.<stage>`**, which surprises people.

**`This account is not authorised for the backoffice`**
Cognito authenticated you but there is no matching `users` row. The email must
match exactly, lowercase. Re-check Phase 7.1.

**Sign-in loops back to the login page**
The ID token was rejected. Confirm `COGNITO_USER_POOL_ID` and
`COGNITO_CLIENT_ID` on the API Lambda match the pool in the console, and that
the pool's App client lists `<SITE_URL>/admin/callback` as a callback URL.

**`That sign-in link has expired`**
The state cookie did not survive the round trip. Usually a stale browser tab —
start again from `/admin/login`. If it is reproducible, check that `SITE_DOMAIN`
matches the host you are actually browsing.

**Images upload but display broken**
The `/uploads/*` route is not reaching the bucket. In CloudFront → your
distribution → **Behaviors**, there should be a `/uploads/*` behaviour pointing
at the S3 origin. Also confirm `UPLOADS_BUCKET` is set on the **Web** Lambda —
without it the app falls back to a local filesystem stub that cannot work on
Lambda.

**Upload fails with a CORS error in the browser console**
The bucket's CORS `allowOrigins` no longer matches the site's origin. It is
derived from `SITE_DOMAIN`, so this is the classic symptom of adding a domain
without redeploying. Redeploy.

**Production's domain suddenly points at staging**
Two stages claimed the same host. `SITE_DOMAIN` must be the **root** domain and
must not be overridden per environment — `sst.config.ts` derives the per-stage
host from it. Check that no environment-scoped `SITE_DOMAIN` variable is
shadowing the repository one, then redeploy production.

**Staging is showing up in Google**
`ALLOW_INDEXING` is only `'true'` on production. Confirm with
`curl -sI https://staging.awsug.la | grep -i x-robots-tag` — you want
`noindex, nofollow`. If the header is missing, the Web Lambda's environment is
stale; redeploy. To remove pages already indexed, use Search Console's removals
tool; the header alone only stops future indexing.

**`Domain already associated with another user pool`**
Cognito prefix domains are unique across the whole region, not just your
account. Change the `domain.prefix` in `sst.config.ts` to something more
specific and redeploy.

**Aurora fails to create with an invalid scaling configuration**
Scale-to-zero (`min: '0 ACU'`) needs a recent engine version. Pin one explicitly
in the `Database` component and redeploy.

**Deploy hangs on certificate validation**
DNS delegation is incomplete. Confirm `dig NS awsug.la` returns your Route 53
nameservers, cancel the run, and try again once it does.

---

## Still to do before a real event

Carried over from the README, and none of them are blockers for deploying:

- **Rate-limit registration and feedback.** Both are unauthenticated public
  writes. API Gateway throttling is configured and both carry honeypots, but a
  WAF rate rule is the real answer (Phase 2 work, ~$6–8/month).
- **Agree a PII retention window.** Registrations hold name, email and phone,
  and feedback links back to the registration that gave it. Decide how long that
  is kept and how it gets deleted.
- **Uploaded images are never cleaned up.** Removing an image from an article
  leaves the object in the bucket. Harmless at this volume; worth an S3
  lifecycle rule before it is not.
- **The keyless map embed is unsupported.** `?output=embed` works today but is
  undocumented and could break without notice. All the URL handling is in
  `packages/shared/src/maps.ts`, so switching to the official Maps Embed API is
  a change to `buildEmbedUrl` alone.
