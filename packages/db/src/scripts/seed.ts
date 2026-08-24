import './env.js';

import {
	extractCoordinates,
	generateTicketCode,
	generateUnsubscribeToken,
	plainTextToRichText,
	type RichTextDoc
} from '@awsug/shared';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../client.js';
import {
	articleTranslations,
	articles,
	eventFeedback,
	eventSpeakerTranslations,
	eventSpeakers,
	eventSponsors,
	eventTranslations,
	events,
	newsletterSubs,
	registrations,
	speakerTranslations,
	speakers,
	sponsors,
	users
} from '../schema.js';

const db = await createDatabase();

const [{ count } = { count: 0 }] = await db
	.select({ count: sql<number>`count(*)::int` })
	.from(events);

if (count > 0 && !process.env.FORCE_SEED) {
	console.log('Database already contains events. Set FORCE_SEED=1 to seed anyway.');
	process.exit(0);
}

/** Dates are relative to run time so the seed never goes stale. */
const now = Date.now();
const days = (n: number) => new Date(now + n * 86_400_000);
const hours = (d: Date, n: number) => new Date(d.getTime() + n * 3_600_000);

/* -------------------------------------------------------------------------- */
/* Rich text helpers                                                          */
/* -------------------------------------------------------------------------- */

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const h = (level: number, text: string) => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text }]
});
const bullets = (items: string[]) => ({
	type: 'bulletList',
	content: items.map((item) => ({ type: 'listItem', content: [p(item)] }))
});
const cell = (type: 'tableHeader' | 'tableCell', text: string) => ({
	type,
	content: [p(text)]
});
const agendaTable = (rows: [string, string][]) => ({
	type: 'table',
	content: [
		{
			type: 'tableRow',
			content: [cell('tableHeader', 'ເວລາ / Time'), cell('tableHeader', 'ຫົວຂໍ້ / Session')]
		},
		...rows.map(([time, session]) => ({
			type: 'tableRow',
			content: [cell('tableCell', time), cell('tableCell', session)]
		}))
	]
});

const doc = (...content: unknown[]): RichTextDoc =>
	({ type: 'doc', content }) as RichTextDoc;

/* -------------------------------------------------------------------------- */

console.log('Seeding users…');
const [admin] = await db
	.insert(users)
	.values({
		email: 'ketsadaphoneofficial@gmail.com',
		name: 'AWS User Group Lao Admin',
		avatarUrl: 'https://placehold.co/200x200/232f3e/ff9900?text=AD',
		role: 'admin'
	})
	.onConflictDoUpdate({ target: users.email, set: { role: 'admin' } })
	.returning();

if (!admin) throw new Error('Failed to seed the admin user');

await db
	.insert(users)
	.values({
		email: 'editor@awsug.la',
		name: 'Community Editor',
		avatarUrl: 'https://placehold.co/200x200/0f766e/ffffff?text=CE',
		role: 'editor'
	})
	.onConflictDoNothing();

/* -------------------------------------------------------------------------- */

console.log('Seeding sponsors…');
const insertedSponsors = await db
	.insert(sponsors)
	.values([
		{
			name: 'Amazon Web Services',
			logoUrl: 'https://placehold.co/320x120/232f3e/ff9900?text=AWS',
			websiteUrl: 'https://aws.amazon.com',
			tier: 'platinum',
			sortOrder: 0
		},
		{
			name: 'Lao IT Development Group',
			logoUrl: 'https://placehold.co/320x120/1f2937/ffffff?text=Lao+IT+Dev',
			websiteUrl: 'https://example.la',
			tier: 'gold',
			sortOrder: 1
		},
		{
			name: 'Toh-Lao Coworking Space',
			logoUrl: 'https://placehold.co/320x120/0f766e/ffffff?text=Toh-Lao',
			websiteUrl: 'https://example.la',
			tier: 'silver',
			sortOrder: 2
		},
		{
			name: 'Vientiane Tech Community',
			logoUrl: 'https://placehold.co/320x120/4c1d95/ffffff?text=VTC',
			tier: 'community',
			sortOrder: 3
		}
	])
	.returning();

const sponsorBySlugName = new Map(insertedSponsors.map((s) => [s.name, s]));

/* -------------------------------------------------------------------------- */

console.log('Seeding speakers…');
const speakerSeeds = [
	{
		slug: 'somchai-vongphachanh',
		company: 'Lao IT Development Group',
		photoUrl: 'https://placehold.co/400x400/232f3e/ff9900?text=SV',
		linkedinUrl: 'https://linkedin.com/in/example',
		translations: [
			{
				locale: 'lo' as const,
				name: 'ສົມໄຊ ວົງພະຈັນ',
				title: 'ວິສະວະກອນ Cloud',
				bio: 'ເຮັດວຽກດ້ານ Cloud ມາກວ່າ 8 ປີ ແລະ ເປັນຜູ້ຮ່ວມກໍ່ຕັ້ງກຸ່ມ AWS User Group Lao.'
			},
			{
				locale: 'en' as const,
				name: 'Somchai Vongphachanh',
				title: 'Cloud Engineer',
				bio: 'Eight years building on AWS, and a co-founder of AWS User Group Lao.'
			}
		]
	},
	{
		slug: 'nalinthone-sisouvanh',
		company: 'Amazon Web Services',
		photoUrl: 'https://placehold.co/400x400/0f766e/ffffff?text=NS',
		websiteUrl: 'https://example.la',
		translations: [
			{
				locale: 'lo' as const,
				name: 'ນະລິນທອນ ສີສຸວັນ',
				title: 'Solutions Architect',
				bio: 'ຊ່ວຍລູກຄ້າໃນພາກພື້ນ ASEAN ອອກແບບລະບົບເທິງ AWS.'
			},
			{
				locale: 'en' as const,
				name: 'Nalinthone Sisouvanh',
				title: 'Solutions Architect',
				bio: 'Helps customers across ASEAN design systems on AWS.'
			}
		]
	},
	{
		slug: 'khamla-phimmasone',
		company: 'National University of Laos',
		photoUrl: 'https://placehold.co/400x400/4c1d95/ffffff?text=KP',
		githubUrl: 'https://github.com/example',
		translations: [
			// Deliberately Lao-only, so the English page exercises the fallback.
			{
				locale: 'lo' as const,
				name: 'ຄຳລ້າ ພິມມະສອນ',
				title: 'ອາຈານສອນ',
				bio: 'ສອນວິຊາຄອມພິວເຕີ ແລະ ນຳພານັກສຶກສາເຂົ້າສູ່ໂລກ Cloud.'
			}
		]
	}
];

const insertedSpeakers = [];
for (const seed of speakerSeeds) {
	const { translations, ...row } = seed;
	const [speaker] = await db.insert(speakers).values(row).returning();
	if (!speaker) throw new Error(`Failed to seed speaker ${seed.slug}`);
	await db
		.insert(speakerTranslations)
		.values(translations.map((t) => ({ ...t, speakerId: speaker.id })));
	insertedSpeakers.push(speaker);
}

const speakerBySlug = new Map(insertedSpeakers.map((s) => [s.slug, s]));

/* -------------------------------------------------------------------------- */

console.log('Seeding events…');

const eventSeeds = [
	{
		slug: 'aws-community-day-vientiane-2026',
		startAt: hours(days(40), 9),
		endAt: hours(days(40), 17),
		capacity: 150,
		status: 'published' as const,
		locationUrl:
			'https://www.google.com/maps/place/Lao+National+Convention+Centre/@17.9435,102.6331,17z',
		coverImageUrl: 'https://placehold.co/1200x630/232f3e/ff9900?text=Community+Day+2026',
		translations: [
			{
				locale: 'lo' as const,
				title: 'AWS Community Day ວຽງຈັນ 2026',
				description: doc(
					p(
						'ງານລວມຕົວປະຈຳປີຂອງຊຸມຊົນ AWS ໃນລາວ. ພົບກັບຫົວຂໍ້ Serverless, AI/ML ແລະ ຄວາມປອດໄພເທິງ Cloud ພ້ອມປະສົບການຈິງຈາກນັກພັດທະນາທ້ອງຖິ່ນ.'
					),
					h(2, 'ຕາຕະລາງງານ'),
					agendaTable([
						['09:00', 'ລົງທະບຽນ ແລະ ກາເຟ'],
						['10:00', 'Keynote: Cloud ໃນລາວ ປີ 2026'],
						['13:30', 'Workshop: Serverless ປະຕິບັດຕົວຈິງ'],
						['16:00', 'ຖາມ-ຕອບ ແລະ ສ້າງເຄືອຂ່າຍ']
					]),
					h(2, 'ສິ່ງທີ່ຄວນນຳມາ'),
					bullets(['ຄອມພິວເຕີສ່ວນຕົວ', 'ບັນຊີ AWS ທີ່ກຽມໄວ້ລ່ວງໜ້າ', 'ຄຳຖາມຂອງທ່ານ'])
				),
				locationName: 'ຫໍປະຊຸມແຫ່ງຊາດ, ວຽງຈັນ'
			},
			{
				locale: 'en' as const,
				title: 'AWS Community Day Vientiane 2026',
				description: doc(
					p(
						'The annual gathering of the AWS community in Laos. Sessions on serverless, AI/ML and cloud security, plus real-world stories from local builders.'
					),
					h(2, 'Agenda'),
					agendaTable([
						['09:00', 'Registration and coffee'],
						['10:00', 'Keynote: Cloud in Laos, 2026'],
						['13:30', 'Workshop: hands-on serverless'],
						['16:00', 'Q&A and networking']
					]),
					h(2, 'What to bring'),
					bullets(['Your laptop', 'An AWS account, set up in advance', 'Your questions'])
				),
				locationName: 'National Convention Centre, Vientiane'
			}
		],
		speakers: [
			{ slug: 'somchai-vongphachanh', lo: 'Cloud ໃນລາວ ປີ 2026', en: 'Cloud in Laos, 2026' },
			{
				slug: 'nalinthone-sisouvanh',
				lo: 'ອອກແບບລະບົບໃຫ້ທົນທານ',
				en: 'Designing for resilience'
			}
		],
		// Toh-Lao backs this event at Gold, above its group-wide Silver standing.
		sponsors: [
			{ name: 'Amazon Web Services', tier: 'platinum' as const },
			{ name: 'Toh-Lao Coworking Space', tier: 'gold' as const }
		]
	},
	{
		slug: 'serverless-hands-on-workshop',
		startAt: hours(days(19), 13),
		endAt: hours(days(19), 17),
		capacity: 30,
		status: 'published' as const,
		locationUrl: 'https://www.google.com/maps?q=17.9757,102.6331',
		coverImageUrl: 'https://placehold.co/1200x630/0f766e/ffffff?text=Serverless+Workshop',
		translations: [
			{
				locale: 'lo' as const,
				title: 'Serverless ເທິງ AWS — ເວີກຊອບປະຕິບັດຕົວຈິງ',
				description: doc(
					p('ຮຽນຮູ້ການສ້າງ API ດ້ວຍ Lambda, API Gateway ແລະ DynamoDB ພ້ອມການປະຕິບັດຕົວຈິງ.'),
					bullets(['ພື້ນຖານ Lambda', 'API Gateway', 'DynamoDB', 'ການຕິດຕາມດ້ວຍ CloudWatch'])
				),
				locationName: 'Toh-Lao Coworking Space, ວຽງຈັນ'
			},
			{
				locale: 'en' as const,
				title: 'Serverless on AWS — Hands-on Workshop',
				description: doc(
					p('Build a working API with Lambda, API Gateway and DynamoDB.'),
					bullets(['Lambda basics', 'API Gateway', 'DynamoDB', 'Observability with CloudWatch'])
				),
				locationName: 'Toh-Lao Coworking Space, Vientiane'
			}
		],
		speakers: [
			{ slug: 'nalinthone-sisouvanh', lo: 'ສ້າງ API ຕົວທຳອິດ', en: 'Building your first API' }
		],
		sponsors: [{ name: 'Toh-Lao Coworking Space', tier: 'platinum' as const }]
	},
	{
		slug: 'intro-to-cloud-computing',
		startAt: hours(days(-86), 9),
		endAt: hours(days(-86), 12),
		capacity: 60,
		status: 'published' as const,
		locationUrl: 'https://www.google.com/maps/place/National+University+of+Laos/@17.9915,102.5628,16z',
		coverImageUrl: 'https://placehold.co/1200x630/1e3a8a/ffffff?text=Intro+to+Cloud',
		translations: [
			{
				locale: 'lo' as const,
				title: 'ແນະນຳ Cloud Computing ດ້ວຍ AWS',
				description: doc(
					p('ພື້ນຖານ Cloud ສຳລັບຜູ້ເລີ່ມຕົ້ນ: EC2, S3, VPC ແລະ ວິທີຄິດໄລ່ຄ່າໃຊ້ຈ່າຍ.')
				),
				locationName: 'ມະຫາວິທະຍາໄລແຫ່ງຊາດ, ວຽງຈັນ'
			},
			{
				locale: 'en' as const,
				title: 'Intro to Cloud Computing with AWS',
				description: doc(
					p('Cloud fundamentals for beginners: EC2, S3, VPC and how billing actually works.')
				),
				locationName: 'National University of Laos, Vientiane'
			}
		],
		speakers: [
			{ slug: 'khamla-phimmasone', lo: 'Cloud ແມ່ນຫຍັງ?', en: 'What is the cloud?' },
			{ slug: 'somchai-vongphachanh', lo: 'ເລີ່ມຕົ້ນແນວໃດ', en: 'Where to start' }
		],
		sponsors: [
			{ name: 'Amazon Web Services', tier: 'gold' as const },
			{ name: 'Vientiane Tech Community', tier: 'community' as const }
		]
	}
];

const insertedEvents = [];
for (const seed of eventSeeds) {
	const { translations, speakers: lineUp, sponsors: backers, ...row } = seed;

	// The seed writes rows directly rather than going through createEvent, so it
	// has to do the coordinate extraction that the service would normally do —
	// otherwise the map falls back to a name search and the event's structured
	// data carries no geo.
	const coordinates = extractCoordinates(row.locationUrl);

	const [event] = await db
		.insert(events)
		.values({
			...row,
			locationLat: coordinates?.lat ?? null,
			locationLng: coordinates?.lng ?? null
		})
		.returning();
	if (!event) throw new Error(`Failed to seed event ${seed.slug}`);

	await db.insert(eventTranslations).values(translations.map((t) => ({ ...t, eventId: event.id })));

	for (const [index, entry] of lineUp.entries()) {
		const speaker = speakerBySlug.get(entry.slug);
		if (!speaker) throw new Error(`Unknown speaker ${entry.slug}`);
		const [link] = await db
			.insert(eventSpeakers)
			.values({ eventId: event.id, speakerId: speaker.id, sortOrder: index })
			.returning();
		if (!link) throw new Error('Failed to seed event speaker');
		await db.insert(eventSpeakerTranslations).values([
			{ eventSpeakerId: link.id, locale: 'lo', talkTitle: entry.lo },
			{ eventSpeakerId: link.id, locale: 'en', talkTitle: entry.en }
		]);
	}

	await db.insert(eventSponsors).values(
		backers.map((b, index) => {
			const sponsor = sponsorBySlugName.get(b.name);
			if (!sponsor) throw new Error(`Unknown sponsor ${b.name}`);
			return { eventId: event.id, sponsorId: sponsor.id, tier: b.tier, sortOrder: index };
		})
	);

	insertedEvents.push(event);
}

/* -------------------------------------------------------------------------- */

console.log('Seeding registrations…');

const pastEvent = insertedEvents.find((e) => e.slug === 'intro-to-cloud-computing');
const workshop = insertedEvents.find((e) => e.slug === 'serverless-hands-on-workshop');
if (!pastEvent || !workshop) throw new Error('Seeded events missing');

const attendees = [
	['Somchai Vongphachanh', 'somchai@example.la'],
	['Nalinthone Sisouvanh', 'nalinthone@example.la'],
	['Khamla Phimmasone', 'khamla@example.la'],
	['Bounmy Keomanivong', 'bounmy@example.la'],
	['Chanthala Inthavong', 'chanthala@example.la'],
	['Vilaysone Douangdy', 'vilaysone@example.la'],
	['Souphaphone Latsamy', 'souphaphone@example.la'],
	['Anousone Phetsarath', 'anousone@example.la']
] as const;

const pastRegistrations = await db
	.insert(registrations)
	.values(
		attendees.map(([fullName, email], i) => ({
			eventId: pastEvent.id,
			fullName,
			email,
			ticketCode: generateTicketCode(),
			checkedInAt: i < 6 ? hours(pastEvent.startAt, 0.5) : null,
			createdAt: days(-90)
		}))
	)
	.returning();

await db
	.update(events)
	.set({ registeredCount: attendees.length })
	.where(sql`${events.id} = ${pastEvent.id}`);

const workshopSignups = attendees.slice(0, 4);
await db.insert(registrations).values(
	workshopSignups.map(([fullName, email]) => ({
		eventId: workshop.id,
		fullName,
		email,
		ticketCode: generateTicketCode()
	}))
);
await db
	.update(events)
	.set({ registeredCount: workshopSignups.length })
	.where(sql`${events.id} = ${workshop.id}`);

/* -------------------------------------------------------------------------- */

console.log('Seeding feedback…');

// Only the past event can have feedback — the form refuses to open before an
// event ends, so seeding it anywhere else would be unreachable data.
const feedbackSeeds = [
	{
		overallRating: 5,
		venueRating: 4,
		contentRating: 5,
		whatWentWell: 'ຄຳອະທິບາຍເຂົ້າໃຈງ່າຍ ແລະ ມີຕົວຢ່າງຕົວຈິງ.',
		whatToImprove: 'ຢາກໃຫ້ມີເວລາຖາມ-ຕອບຫຼາຍກວ່ານີ້.',
		allowPublic: true
	},
	{
		overallRating: 4,
		venueRating: 3,
		contentRating: 4,
		whatWentWell: 'Good pacing for beginners.',
		whatToImprove: 'The room was a little warm and hard to hear at the back.',
		allowPublic: true
	},
	{
		overallRating: 5,
		venueRating: 5,
		contentRating: 4,
		whatWentWell: 'Loved the hands-on part.',
		whatToImprove: 'More time on billing please.',
		allowPublic: false
	},
	{ overallRating: 3, venueRating: 3, contentRating: 3, allowPublic: false }
];

await db.insert(eventFeedback).values(
	feedbackSeeds.map((f, i) => {
		const registration = pastRegistrations[i];
		if (!registration) throw new Error('Not enough registrations to attach feedback');
		return {
			eventId: pastEvent.id,
			registrationId: registration.id,
			overallRating: f.overallRating,
			venueRating: f.venueRating,
			contentRating: f.contentRating,
			whatWentWell: f.whatWentWell ?? null,
			whatToImprove: f.whatToImprove ?? null,
			allowPublic: f.allowPublic
		};
	})
);

/* -------------------------------------------------------------------------- */

console.log('Seeding articles…');

const articleSeeds = [
	{
		slug: 'recap-aws-community-day-2025',
		category: 'Community',
		status: 'published' as const,
		publishedAt: days(-60),
		coverImageUrl: 'https://placehold.co/1200x630/232f3e/ff9900?text=Recap+2025',
		translations: [
			{
				locale: 'lo' as const,
				title: 'ສະຫຼຸບງານ AWS Community Day 2025',
				excerpt: 'ຜູ້ເຂົ້າຮ່ວມກວ່າ 200 ຄົນ, 12 ຫົວຂໍ້ ແລະ ບົດຮຽນທີ່ພວກເຮົາໄດ້ຮັບ.',
				content: doc(
					p('ງານ AWS Community Day 2025 ຜ່ານໄປດ້ວຍດີ ໂດຍມີຜູ້ເຂົ້າຮ່ວມກວ່າ 200 ຄົນ.'),
					h(2, 'ຫົວຂໍ້ທີ່ໄດ້ຮັບຄວາມນິຍົມ'),
					bullets(['Serverless', 'AI ໃນວຽກງານຈິງ', 'ຄວາມປອດໄພເທິງ Cloud']),
					p('ພົບກັນໃໝ່ໃນປີ 2026.')
				)
			},
			{
				locale: 'en' as const,
				title: 'Recap: AWS Community Day 2025',
				excerpt: 'Over 200 attendees, 12 sessions, and what we learned running it.',
				content: doc(
					p('AWS Community Day 2025 brought together more than 200 people.'),
					h(2, 'Most popular sessions'),
					bullets(['Serverless architecture', 'AI on real workloads', 'Cloud security']),
					p('See you in 2026.')
				)
			}
		]
	},
	{
		slug: 'getting-started-aws-free-tier',
		category: 'Tutorial',
		status: 'published' as const,
		publishedAt: days(-21),
		coverImageUrl: 'https://placehold.co/1200x630/166534/ffffff?text=Free+Tier',
		translations: [
			{
				locale: 'lo' as const,
				title: 'ເລີ່ມຕົ້ນກັບ AWS Free Tier',
				excerpt: 'ວິທີສ້າງບັນຊີ AWS ແລະ ຫຼີກລ່ຽງຄ່າໃຊ້ຈ່າຍທີ່ບໍ່ຄາດຄິດ.',
				content: doc(
					p('ການເລີ່ມຕົ້ນໃຊ້ AWS ບໍ່ຈຳເປັນຕ້ອງເສຍຄ່າໃຊ້ຈ່າຍ ຖ້າເຮົາເຂົ້າໃຈ Free Tier.'),
					h(2, 'ສິ່ງທຳອິດທີ່ຄວນເຮັດ'),
					bullets(['ຕັ້ງ Billing Alarm', 'ເປີດໃຊ້ MFA ໃຫ້ບັນຊີ root', 'ປິດ resource ທີ່ບໍ່ໄດ້ໃຊ້'])
				)
			},
			{
				locale: 'en' as const,
				title: 'Getting started with the AWS Free Tier',
				excerpt: 'How to open an AWS account without landing a surprise bill.',
				content: doc(
					p('You can get a long way on AWS without paying anything.'),
					h(2, 'Do these first'),
					bullets(['Set a billing alarm', 'Enable MFA on the root user', 'Shut down idle resources']),
					p('The usual sources of a surprise bill are billed by the hour, not by request — EC2 and NAT Gateways especially.')
				)
			}
		]
	},
	{
		slug: 'event-roadmap-2026',
		category: 'Announcements',
		status: 'draft' as const,
		publishedAt: null,
		translations: [
			{
				locale: 'lo' as const,
				title: 'ແຜນການຈັດງານປີ 2026',
				excerpt: 'ຮ່າງແຜນກິດຈະກຳຂອງພວກເຮົາໃນປີນີ້.',
				content: plainTextToRichText('ຍັງເປັນຮ່າງ — ລໍຖ້າການຢືນຢັນສະຖານທີ່ ແລະ ຜູ້ສະໜັບສະໜູນ.')
			},
			{
				locale: 'en' as const,
				title: 'Our 2026 event roadmap',
				excerpt: 'A draft of what we are planning this year.',
				content: plainTextToRichText('Still a draft — pending venue and sponsor confirmation.')
			}
		]
	}
];

for (const seed of articleSeeds) {
	const { translations, ...row } = seed;
	const [article] = await db
		.insert(articles)
		.values({ ...row, authorId: admin.id })
		.returning();
	if (!article) throw new Error(`Failed to seed article ${seed.slug}`);
	await db
		.insert(articleTranslations)
		.values(translations.map((t) => ({ ...t, articleId: article.id })));
}

/* -------------------------------------------------------------------------- */

console.log('Seeding newsletter subscribers…');
await db
	.insert(newsletterSubs)
	.values(
		attendees.slice(0, 3).map(([, email], i) => ({
			email,
			locale: (i % 2 === 0 ? 'lo' : 'en') as 'lo' | 'en',
			token: generateUnsubscribeToken()
		}))
	)
	.onConflictDoNothing();

console.log('\nSeed complete:');
console.log(`  ${eventSeeds.length} events (2 upcoming, 1 past), all with map links`);
console.log(`  ${speakerSeeds.length} speakers across 5 talk slots`);
console.log('  4 sponsors, incl. Toh-Lao at Gold for Community Day but Silver group-wide');
console.log(`  ${articleSeeds.length} articles (2 published, 1 draft) with headings and lists`);
console.log(`  12 registrations, ${feedbackSeeds.length} feedback responses, 3 subscribers`);
process.exit(0);
