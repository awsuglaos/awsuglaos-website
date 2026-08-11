/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Infrastructure for the AWS User Group Lao website.
 *
 * NOTE ON SST VERSIONS: the requirements document describes SST v3 as "built on
 * AWS CDK". It is not — v3 (Ion) replaced CloudFormation/CDK with Pulumi and
 * Terraform, and v4 continues that. There are no CDK constructs anywhere below;
 * each `sst.aws.*` component maps to Pulumi/Terraform resources.
 *
 * THIS FILE HAS NOT BEEN DEPLOYED. No AWS account existed when it was written,
 * so it is reviewed-but-unverified. See the M7 prerequisites in the README
 * before the first `sst deploy`.
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
				allowOrigins: process.env.SITE_DOMAIN
					? [`https://${process.env.SITE_DOMAIN}`]
					: ['http://localhost:5173'],
				allowHeaders: ['content-type'],
				maxAge: '1 hour'
			}
		});

		/* ------------------------------------------------------------------ */
		/* Authentication                                                     */
		/* ------------------------------------------------------------------ */

		const userPool = new sst.aws.CognitoUserPool('UserPool', {
			usernames: ['email'],
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

		const userPoolClient = userPool.addClient('Web');

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

		const siteOrigin = process.env.SITE_DOMAIN ? `https://${process.env.SITE_DOMAIN}` : '';

		const apiEnvironment = {
			PUBLIC_SITE_URL: siteOrigin,
			COGNITO_USER_POOL_ID: userPool.id,
			COGNITO_CLIENT_ID: userPoolClient.id,
			DB_CLUSTER_ARN: database.clusterArn,
			DB_SECRET_ARN: database.secretArn,
			DB_NAME: database.database,
			SES_FROM_ADDRESS: process.env.SES_FROM_ADDRESS ?? '',
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
		 * ADAPTER WARNING — verify before the first deploy.
		 *
		 * sst.aws.SvelteKit expects the `svelte-kit-sst` adapter in place of
		 * adapter-node. That package was last published during the SST v2 era and
		 * has not tracked SvelteKit 2.70 / Svelte 5 / Vite 8, so it may not build.
		 *
		 * If it fails, the fallback is a container deploy (sst.aws.Cluster +
		 * sst.aws.Service) which keeps the adapter-node build this repo already
		 * produces — at the cost of an always-on Fargate task (~$10+/month), which
		 * undercuts the free-tier goal. Resolve this before committing to a
		 * hosting shape; it is the one piece of this file that could not be
		 * verified without an AWS account.
		 */
		const web = new sst.aws.SvelteKit('Web', {
			path: 'apps/web',
			link: [database, uploads],
			environment: {
				PUBLIC_API_URL: api.url,
				COGNITO_USER_POOL_ID: userPool.id,
				COGNITO_CLIENT_ID: userPoolClient.id,
				DB_CLUSTER_ARN: database.clusterArn,
				DB_SECRET_ARN: database.secretArn,
				DB_NAME: database.database,
				SES_FROM_ADDRESS: process.env.SES_FROM_ADDRESS ?? '',
				// Must never be "true" outside a developer machine; apps/api/src/env.ts
				// also refuses the combination at runtime.
				DEV_AUTH: 'false'
			},
			/*
			 * The domain is opt-in so a first deploy is not blocked on DNS. Set
			 * SITE_DOMAIN once the Route 53 hosted zone exists.
			 *
			 * `.la` cannot be registered through Route 53 — register awsuglaos.la at
			 * a .la registrar, then delegate its NS records to the hosted zone. ACM
			 * certificates for CloudFront must live in us-east-1; SST handles that
			 * placement itself.
			 */
			...(process.env.SITE_DOMAIN
				? {
						domain: {
							name: process.env.SITE_DOMAIN,
							redirects: isProd ? [`www.${process.env.SITE_DOMAIN}`] : []
						}
					}
				: {})
		});

		return {
			web: web.url,
			api: api.url,
			userPool: userPool.id,
			userPoolClient: userPoolClient.id,
			databaseCluster: database.clusterArn
		};
	}
});
