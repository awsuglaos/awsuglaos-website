/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Infrastructure for the AWS User Group Lao website.
 *
 * NOTE ON SST VERSIONS: the requirements document describes SST v3 as "built on
 * AWS CDK". It is not — v3 (Ion) replaced CloudFormation/CDK with Pulumi and
 * Terraform, and v4 continues that. There are no CDK constructs anywhere below;
 * each `sst.aws.*` component maps to Pulumi/Terraform resources.
 *
 * Deployment is driven from .github/workflows/ci.yml — see DEPLOYMENT.md for the
 * runbook, including the prerequisites that cannot be expressed here (the OIDC
 * deploy role, SES identities, and the first admin).
 */
export default $config({
	app(input) {
		return {
			name: 'awsug-lao',
			removal: input?.stage === 'production' ? 'retain' : 'remove',
			// Guards against `sst remove --stage production` deleting the database.
			protect: input?.stage === 'production',
			home: 'aws',
			providers: {
				aws: {
					region: (process.env.AWS_REGION as 'ap-southeast-1') ?? 'ap-southeast-1'
				}
			}
		};
	},

	async run() {
		const isProd = $app.stage === 'production';

		/* ------------------------------------------------------------------ */
		/* Network                                                            */
		/* ------------------------------------------------------------------ */

		/*
		 * Aurora must live in a VPC — that is not optional. What *is* optional is
		 * putting Lambda in there with it, and we deliberately do not: every
		 * function reaches the database over the RDS Data API's HTTPS endpoint
		 * instead. That removes the NAT Gateway (~$32/month, billed whether or not
		 * anything is running) and the ENI attachment cold-start penalty.
		 *
		 * `nat` is left unset for exactly that reason. If a future workload really
		 * does need to sit inside the VPC, prefer VPC endpoints over a NAT.
		 */
		const vpc = new sst.aws.Vpc('Vpc');

		/* ------------------------------------------------------------------ */
		/* Database                                                           */
		/* ------------------------------------------------------------------ */

		const database = new sst.aws.Aurora('Database', {
			engine: 'postgres',
			// The HTTPS data plane that keeps Lambda out of the VPC.
			dataApi: true,
			vpc,
			database: 'awsug_lao',
			scaling: {
				/*
				 * Scale-to-zero. The requirements doc says Aurora Serverless v2 cannot
				 * do this and recommends a 0.5 ACU floor (~$43/month) — that stopped
				 * being true in November 2024. Idle now costs storage only.
				 *
				 * The trade is a ~15 second resume on the first connection after an
				 * idle period. Acceptable here because CloudFront serves cached pages
				 * and the public site sets stale-while-revalidate, so a visitor is
				 * rarely the one waiting. Note that auto-pause is incompatible with
				 * RDS Proxy, which is a second reason the Data API is the right call.
				 */
				min: isProd ? '0 ACU' : '0 ACU',
				max: isProd ? '4 ACU' : '1 ACU'
			}
		});

		/* ------------------------------------------------------------------ */
		/* Edge                                                               */
		/* ------------------------------------------------------------------ */

		/*
		 * SITE_DOMAIN is the *root* domain — `awsug.la`, never
		 * `staging.awsug.la`. The stage decides the host it actually claims.
		 *
		 * This has to be derived rather than used raw. One repository variable
		 * feeds every stage, so a stage-independent host means staging and
		 * production both try to claim the apex, its ACM certificate and its
		 * Route 53 alias record — and whichever deploys second wins. A routine
		 * push to `main` would quietly take the domain away from production.
		 *
		 * Every other stage gets `<stage>.awsug.la`, so short-lived stages
		 * are addressable without touching this file.
		 *
		 * `.la` cannot be registered through Route 53 — the domain is registered
		 * at a .la registrar with its NS records delegated to the hosted zone.
		 * ACM certificates for CloudFront must live in us-east-1; SST handles
		 * that placement itself.
		 */
		const rootDomain = process.env.SITE_DOMAIN;
		const siteDomain = rootDomain
			? isProd
				? rootDomain
				: `${$app.stage}.${rootDomain}`
			: undefined;

		/*
		 * One CloudFront distribution fronts both the SvelteKit app and the uploads
		 * bucket, because they have to share an origin.
		 *
		 * `sst.aws.SvelteKit` on its own creates a distribution that knows only
		 * about the app, and nothing would answer /uploads/*. That matters here:
		 * image URLs are stored site-relative (`/uploads/2026/08/<ulid>.png`, see
		 * packages/core/src/storage/types.ts), precisely so that a domain change
		 * does not strand every image ever published — which only works if the
		 * site's own origin serves them.
		 *
		 * The Router is created empty and routed below, after the bucket exists.
		 * Constructing it first is what lets the bucket's CORS rule reference
		 * `router.url` without the two components forming a cycle.
		 */
		const router = new sst.aws.Router('Router', {
			// Still opt-in: with SITE_DOMAIN unset the stage runs on its generated
			// CloudFront URL, which is what makes a throwaway stage cost nothing to
			// set up.
			...(siteDomain
				? {
						domain: {
							name: siteDomain,
							// Only production answers on www. A staging subdomain has no
							// www. form worth owning.
							redirects: isProd ? [`www.${rootDomain}`] : []
						}
					}
				: {})
		});

		/*
		 * The site's own origin, and the single source of truth for it. Every
		 * consumer below derives from this rather than re-deriving from
		 * SITE_DOMAIN, so the domain-less and custom-domain cases cannot drift:
		 * the Cognito callback URL, the bucket's CORS origin and the links in
		 * outgoing email all move together.
		 */
		const siteUrl = siteDomain ? $interpolate`https://${siteDomain}` : router.url;

		/* ------------------------------------------------------------------ */
		/* Storage                                                            */
		/* ------------------------------------------------------------------ */

		/*
		 * Article, event and speaker images. The bucket stays private and is read
		 * only through CloudFront, so object URLs live on the site's own domain —
		 * which also means moving storage later does not break every image link
		 * ever published. Writes arrive as presigned PUTs straight from the
		 * browser; the API only signs them.
		 */
		const uploads = new sst.aws.Bucket('Uploads', {
			access: 'cloudfront',
			cors: {
				allowMethods: ['PUT'],
				/*
				 * The browser PUTs to the S3 host directly, so S3 — not CloudFront —
				 * answers the preflight. This has to be the deployed origin: hardcoding
				 * localhost here (as this did) makes every upload from the real site
				 * fail CORS, and the failure surfaces in the browser console rather
				 * than in any server log.
				 */
				allowOrigins: [siteUrl],
				allowHeaders: ['content-type'],
				maxAge: '1 hour'
			}
		});

		/*
		 * Serves /uploads/* from the bucket. The path prefix is deliberately not
		 * rewritten: `buildObjectKey` already writes keys as
		 * `uploads/YYYY/MM/<ulid>.<ext>`, so the request path and the object key
		 * line up as-is.
		 *
		 * The SvelteKit app's `/*` is a default route, so it loses to this more
		 * specific pattern no matter which is declared first.
		 */
		router.routeBucket('/uploads', uploads);

		/* ------------------------------------------------------------------ */
		/* Authentication                                                     */
		/* ------------------------------------------------------------------ */

		const userPool = new sst.aws.CognitoUserPool('UserPool', {
			usernames: ['email'],
			/*
			 * The hosted UI. Without it there is no sign-in page at all — the
			 * backoffice has no password form of its own, and deliberately so: it
			 * never sees a credential, only the resulting token.
			 *
			 * A prefix domain has to be unique across the whole region, not just the
			 * account. If a deploy fails with "Domain already associated with another
			 * user pool", change the prefix here rather than fighting it.
			 */
			domain: { prefix: `awsug-lao-${$app.stage}` },
			transform: {
				userPool: {
					// Doc §8: MFA is required for admin accounts, not merely offered.
					mfaConfiguration: 'ON',
					softwareTokenMfaConfiguration: { enabled: true },
					passwordPolicy: {
						minimumLength: 12,
						requireLowercase: true,
						requireUppercase: true,
						requireNumbers: true,
						requireSymbols: true
					},
					// Self-signup would let anyone create a pool account; backoffice
					// access is granted by an admin adding a users row.
					adminCreateUserConfig: { allowAdminCreateUserOnly: true }
				}
			}
		});

		/*
		 * Named for what it is rather than "Web": Cognito is only ever used by the
		 * /admin backoffice — public visitors never authenticate — and the site
		 * itself already owns the name `Web` below. Two components sharing a name
		 * fails the deploy outright with "Component name Web is not unique",
		 * which is not obvious from either declaration on its own.
		 */
		const userPoolClient = userPool.addClient('Backoffice', {
			callbackUrls: [$interpolate`${siteUrl}/admin/callback`],
			transform: {
				client: {
					logoutUrls: [$interpolate`${siteUrl}/admin/login`],
					/*
					 * SST defaults to ["implicit", "code"]. Implicit returns tokens in
					 * the URL fragment, where they land in browser history and any
					 * Referer header — and this app has no use for it, because the code
					 * exchange happens server-side in the SvelteKit handler. Dropping it
					 * removes the option of ever accidentally using it.
					 */
					allowedOauthFlows: ['code'],
					// Narrower than SST's default, which also requests `phone` and
					// `aws.cognito.signin.user.admin`. The app reads `email` off the ID
					// token and nothing else.
					allowedOauthScopes: ['openid', 'email', 'profile'],
					/*
					 * Eight hours, matching the session cookie in
					 * apps/web/src/lib/server/session.ts. There is no refresh-token
					 * plumbing: when the token expires the API 401s, the (protected)
					 * layout clears the cookie and bounces to /admin/login, and the
					 * hosted UI's own session usually makes that round trip invisible.
					 *
					 * All three validities are set explicitly. Setting
					 * tokenValidityUnits while leaving a validity unset leaves that one
					 * on its own default unit and produces a permanent diff.
					 */
					idTokenValidity: 8,
					accessTokenValidity: 8,
					refreshTokenValidity: 30,
					tokenValidityUnits: {
						idToken: 'hours',
						accessToken: 'hours',
						refreshToken: 'days'
					},
					// Do not leak whether an address has an account.
					preventUserExistenceErrors: 'ENABLED',
					enableTokenRevocation: true
				}
			}
		});

		/* ------------------------------------------------------------------ */
		/* API                                                                */
		/* ------------------------------------------------------------------ */

		const api = new sst.aws.ApiGatewayV2('Api', {
			cors: false,
			transform: {
				// Doc §8: throttling to blunt abuse of the unauthenticated surface.
				stage: {
					defaultRouteSettings: {
						throttlingRateLimit: 50,
						throttlingBurstLimit: 100
					}
				}
			}
		});

		/*
		 * SES configuration set.
		 *
		 * Out of the sandbox Amazon holds the account to a bounce rate under 5%
		 * and a complaint rate under 0.1%, and pauses sending once either is
		 * exceeded. The first symptom here would be ticket confirmations quietly
		 * stopping — and `registerForEvent` deliberately swallows send failures so
		 * a mail outage cannot undo a valid registration, so nothing on the site
		 * would look wrong at all. That is a good property to have and a terrible
		 * one to be blind behind.
		 *
		 * `reputationMetricsEnabled` publishes those two rates to CloudWatch,
		 * where an alarm can see it coming. The event destination below adds the
		 * per-event counts underneath them.
		 *
		 * Named per stage, so staging cannot spend production's reputation.
		 */
		const emailConfigurationSet = new aws.sesv2.ConfigurationSet('EmailConfigurationSet', {
			configurationSetName: `awsug-lao-${$app.stage}`,
			reputationOptions: { reputationMetricsEnabled: true },
			sendingOptions: { sendingEnabled: true },
			/*
			 * Stops SES trying an address that has already hard-bounced or
			 * complained. Without it a handful of dead addresses on the newsletter
			 * list get retried on every send and hold the bounce rate up by
			 * themselves.
			 */
			suppressionOptions: { suppressedReasons: ['BOUNCE', 'COMPLAINT'] }
		});

		new aws.sesv2.ConfigurationSetEventDestination('EmailEventDestination', {
			configurationSetName: emailConfigurationSet.configurationSetName,
			eventDestinationName: 'cloudwatch',
			eventDestination: {
				enabled: true,
				/*
				 * Only the events that mean something is wrong. OPEN and CLICK would
				 * need a tracking domain, which puts a redirect through a host of our
				 * own on every link in every ticket — a lot of moving parts, and a
				 * privacy cost, for numbers nobody here acts on.
				 */
				matchingEventTypes: [
					'BOUNCE',
					'COMPLAINT',
					'REJECT',
					'RENDERING_FAILURE',
					'DELIVERY_DELAY'
				],
				cloudWatchDestination: {
					dimensionConfigurations: [
						{
							dimensionName: 'ses:configuration-set',
							dimensionValueSource: 'MESSAGE_TAG',
							defaultDimensionValue: `awsug-lao-${$app.stage}`
						}
					]
				}
			}
		});

		/*
		 * The Resend API key, while SES production access is pending.
		 *
		 * A secret rather than a plain `process.env` passthrough like the values
		 * below it: those only have to exist in whoever's shell runs the deploy,
		 * which for a key means putting it in GitHub Actions as well. This lives
		 * in SSM under the stage and is set once:
		 *
		 *   npx sst secret set ResendApiKey <key> --stage production
		 *
		 * It is passed through as an environment variable rather than linked, so
		 * the apps keep reading plain env and the local console path is unchanged.
		 * Unset, `.value` is empty and both functions fall through to SES.
		 */
		const resendApiKey = new sst.Secret('ResendApiKey', '');

		const mailEnvironment = {
			RESEND_API_KEY: resendApiKey.value,
			MAIL_FROM_NAME: process.env.MAIL_FROM_NAME ?? 'AWS User Group Laos',
			MAIL_FROM_EMAIL: process.env.MAIL_FROM_EMAIL ?? '',
			// Used only when RESEND_API_KEY is empty. Kept wired so approval is a
			// secret change and a redeploy, not a code change.
			SES_FROM_ADDRESS: process.env.SES_FROM_ADDRESS ?? '',
			SES_CONFIGURATION_SET: emailConfigurationSet.configurationSetName
		};

		const apiEnvironment = {
			// Ticket, feedback and unsubscribe links in outgoing email are built from
			// this. Empty or wrong and every email ships a dead link.
			PUBLIC_SITE_URL: siteUrl,
			COGNITO_USER_POOL_ID: userPool.id,
			COGNITO_CLIENT_ID: userPoolClient.id,
			DB_CLUSTER_ARN: database.clusterArn,
			DB_SECRET_ARN: database.secretArn,
			DB_NAME: database.database,
			...mailEnvironment,
			UPLOADS_BUCKET: uploads.name,
			// UPLOADS_PUBLIC_URL is deliberately unset: image URLs are stored
			// site-relative, so CloudFront serves /uploads/* from the site's own
			// distribution and a domain change does not strand existing images.
			// Set it only if uploads ever move to a separate CDN host.
			NODE_ENV: 'production'
		};

		api.route('$default', {
			handler: 'apps/api/src/lambda.handler',
			runtime: 'nodejs22.x',
			architecture: 'arm64',
			memory: '512 MB',
			timeout: '20 seconds',
			// Linking grants exactly the IAM actions this function needs against
			// these resources — doc §8's "separate role per function", enforced by
			// construction rather than by review.
			link: [database, uploads],
			environment: apiEnvironment,
			permissions: [
				{ actions: ['ses:SendEmail'], resources: ['*'] },
				{
					// User administration creates and removes Cognito identities.
					// Scoped to this pool only — never a wildcard on cognito-idp.
					actions: [
						'cognito-idp:AdminCreateUser',
						'cognito-idp:AdminDeleteUser',
						'cognito-idp:AdminDisableUser',
						'cognito-idp:AdminGetUser'
					],
					resources: [userPool.arn]
				}
			],
			transform: {
				// Unbounded log retention is a slow, quiet cost leak.
				logGroup: { retentionInDays: 14 }
			}
		});

		/* ------------------------------------------------------------------ */
		/* Web                                                                */
		/* ------------------------------------------------------------------ */

		/*
		 * ADAPTER — resolved 2026-08-11.
		 *
		 * sst.aws.SvelteKit reads its build from .svelte-kit/svelte-kit-sst/
		 * {server,client,prerendered} and invokes lambda-handler/index.handler.
		 * apps/web now uses the `svelte-kit-sst` adapter, pinned to 2.49.8 via the
		 * `two` dist-tag — note npm's `latest` tag still points at the older
		 * 2.43.5, so an unpinned install silently regresses.
		 *
		 * An earlier note here called that package abandoned. It is not: 2.49.8
		 * was published 2026-03-23. It builds cleanly against SvelteKit 2.70 /
		 * Svelte 5 / Vite 8, produces all four paths this component reads, and
		 * `pnpm check` passes.
		 *
		 * The container fallback (sst.aws.Cluster + sst.aws.Service over the
		 * adapter-node build) is therefore not needed, which is what keeps this
		 * off an always-on Fargate task at ~$10+/month.
		 */
		const web = new sst.aws.SvelteKit('Web', {
			path: 'apps/web',
			// Serves through the shared distribution rather than one of its own, so
			// that /uploads/* above is same-origin with the app.
			router: { instance: router },
			/*
			 * Default is 20s. Aurora's resume from auto-pause takes ~15-25s, and
			 * packages/db retries across it rather than 500-ing at a visitor, so the
			 * request has to be allowed to outlast the wake. Kept at 30s because
			 * CloudFront gives an origin 30 seconds before returning a 504 — going
			 * higher here would only move the failure, not remove it.
			 */
			server: { timeout: '30 seconds' },
			link: [database, uploads],
			environment: {
				PUBLIC_API_URL: api.url,
				PUBLIC_SITE_URL: siteUrl,
				COGNITO_USER_POOL_ID: userPool.id,
				COGNITO_CLIENT_ID: userPoolClient.id,
				// The hosted UI origin. apps/web/src/lib/server/cognito.ts builds the
				// /oauth2/authorize, /oauth2/token and /logout URLs from it.
				COGNITO_DOMAIN_URL: userPool.domainUrl!,
				DB_CLUSTER_ARN: database.clusterArn,
				DB_SECRET_ARN: database.secretArn,
				DB_NAME: database.database,
				...mailEnvironment,
				/*
				 * Switches the app off its local filesystem upload stub. Without it
				 * `usingLocalUploads()` stays true on Lambda, where the filesystem is
				 * read-only — uploads would fail and /uploads/* would 404 from the
				 * function instead of being served from the bucket.
				 */
				UPLOADS_BUCKET: uploads.name,
				/*
				 * Production is the only stage search engines may index. Every other
				 * stage now has a real, publicly resolving hostname
				 * (`staging.awsug.la`), which is exactly what makes it crawlable —
				 * and staging is a byte-for-byte copy of production, so indexing it
				 * means competing with the real site on its own content.
				 *
				 * Deliberately not PUBLIC_-prefixed: only the server reads it, and
				 * `$env/dynamic/private` excludes that prefix entirely. Anything unset
				 * is treated as not indexable, so a misconfigured stage fails into
				 * obscurity rather than into Google.
				 */
				ALLOW_INDEXING: isProd ? 'true' : 'false',
				// Must never be "true" outside a developer machine; apps/api/src/env.ts
				// also refuses the combination at runtime.
				DEV_AUTH: 'false'
			}
		});

		return {
			web: web.url,
			api: api.url,
			userPool: userPool.id,
			userPoolClient: userPoolClient.id,
			cognitoDomain: userPool.domainUrl!,
			databaseCluster: database.clusterArn
		};
	}
});
