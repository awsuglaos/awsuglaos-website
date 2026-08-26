import {
	articleService,
	eventService,
	feedbackService,
	formAnalyticsService,
	materialService,
	newsletterService,
	registrationService,
	siteFeedbackService,
	speakerService,
	sponsorService,
	userService,
	requireStorage
} from '@awsug/core';
import {
	articleInputSchema,
	checkInInputSchema,
	eventInputSchema,
	ForbiddenError,
	inviteUserInputSchema,
	isDomainError,
	presignUploadInputSchema,
	setEventFormInputSchema,
	setEventPhotosInputSchema,
	setEventResourcesInputSchema,
	setEventSpeakersInputSchema,
	setEventSponsorsInputSchema,
	setSiteFeedbackStatusInputSchema,
	siteFeedbackStatusSchema,
	speakerInputSchema,
	sponsorInputSchema,
	updateUserProfileInputSchema,
	updateUserRoleInputSchema,
	type Locale
} from '@awsug/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { ZodError, type ZodType } from 'zod';
import { currentUser, requireAuth, requireRole, type AuthVariables } from './auth.js';
import { getContext } from './context.js';

type Env = { Variables: AuthVariables };

const app = new Hono<Env>();

app.use('*', logger());

/*
 * The SvelteKit backoffice calls this API server-to-server, so no browser
 * origin is involved and CORS is not needed for it. It stays enabled, tightly
 * scoped, for the event-day check-in client and for API demos at meetups.
 */
app.use(
	'*',
	cors({
		origin: (origin) => {
			const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? '')
				.split(',')
				.map((o) => o.trim())
				.filter(Boolean);
			return allowed.includes(origin) ? origin : null;
		},
		allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Authorization', 'Content-Type'],
		maxAge: 600
	})
);

app.onError((err, c) => {
	if (isDomainError(err)) {
		return c.json(
			{ error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
			err.status as 400
		);
	}
	if (err instanceof ZodError) {
		return c.json(
			{
				error: 'validation_failed',
				message: 'Request body failed validation',
				issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
			},
			400
		);
	}
	console.error('Unhandled API error', err);
	return c.json({ error: 'internal_error', message: 'Unexpected error' }, 500);
});

app.notFound((c) => c.json({ error: 'not_found', message: 'No such route' }, 404));

/** Parses and validates a JSON body, throwing ZodError for onError to format. */
async function body<T>(
	c: { req: { json: () => Promise<unknown> } },
	schema: ZodType<T>
): Promise<T> {
	return schema.parse(await c.req.json());
}

/* -------------------------------------------------------------------------- */
/* Public                                                                     */
/* -------------------------------------------------------------------------- */

app.get('/health', (c) => c.json({ ok: true, service: 'awsug-lao-api' }));

/* -------------------------------------------------------------------------- */
/* Check-in (event day)                                                       */
/* -------------------------------------------------------------------------- */

app.post('/checkin', requireAuth, async (c) => {
	const input = await body(c, checkInInputSchema);
	const ctx = await getContext();
	const result = await registrationService.checkIn(ctx, input);

	return c.json({
		ticketCode: result.registration.ticketCode,
		fullName: result.registration.fullName,
		checkedInAt: result.registration.checkedInAt,
		eventSlug: result.event.slug
	});
});

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

const admin = new Hono<Env>();
admin.use('*', requireAuth);

admin.get('/events', async (c) => c.json(await eventService.listAllEvents(await getContext())));

admin.get('/events/:id', async (c) =>
	c.json(await eventService.getEventById(await getContext(), c.req.param('id')))
);

admin.post('/events', requireRole('admin'), async (c) => {
	const input = await body(c, eventInputSchema);
	const created = await eventService.createEvent(await getContext(), input);
	return c.json(created, 201);
});

admin.put('/events/:id', requireRole('admin'), async (c) => {
	const input = await body(c, eventInputSchema);
	return c.json(await eventService.updateEvent(await getContext(), c.req.param('id'), input));
});

admin.delete('/events/:id', requireRole('admin'), async (c) => {
	await eventService.deleteEvent(await getContext(), c.req.param('id'));
	return c.body(null, 204);
});

admin.get('/events/:id/registrations', async (c) =>
	c.json(await registrationService.listRegistrations(await getContext(), c.req.param('id')))
);

admin.get('/events/:id/stats', async (c) =>
	c.json(await registrationService.getEventStats(await getContext(), c.req.param('id')))
);

admin.get('/events/:id/registrations.csv', async (c) => {
	const ctx = await getContext();
	const id = c.req.param('id');
	const event = await eventService.getEventById(ctx, id);
	const rows = await registrationService.listRegistrations(ctx, id);

	// A BOM so Excel opens the Lao names as UTF-8 instead of mojibake.
	// The form decides the columns — one per question, as it stands today.
	const csv = `﻿${registrationService.registrationsToCsv(rows, event.formSchema)}`;

	c.header('content-type', 'text/csv; charset=utf-8');
	c.header('content-disposition', `attachment; filename="${event.slug}-registrations.csv"`);
	return c.body(csv);
});

/* -------------------------------------------------------------------------- */
/* Registration form                                                          */
/* -------------------------------------------------------------------------- */

admin.get('/events/:id/form', async (c) =>
	c.json(await eventService.getFormSchema(await getContext(), c.req.param('id')))
);

admin.put('/events/:id/form', requireRole('editor'), async (c) => {
	const input = await body(c, setEventFormInputSchema);
	return c.json(await eventService.setFormSchema(await getContext(), c.req.param('id'), input));
});

/**
 * What the answers add up to.
 *
 * Aggregated here rather than in the browser: the raw answers include every
 * free-text reply and every email address, and shipping the lot to a dashboard
 * that only draws bars would put more personal data on the wire than the page
 * needs. The registrations endpoint above is still there for the cases that
 * genuinely want row-level detail.
 */
admin.get('/events/:id/analytics', async (c) => {
	const ctx = await getContext();
	const id = c.req.param('id');

	const [event, rows, stats, feedback] = await Promise.all([
		eventService.getEventById(ctx, id),
		registrationService.listRegistrations(ctx, id),
		registrationService.getEventStats(ctx, id),
		feedbackService.getFeedbackAverages(ctx, id)
	]);

	return c.json({
		analytics: formAnalyticsService.summariseRegistrations(event.formSchema, rows),
		stats,
		feedback,
		capacity: event.capacity
	});
});

/* -------------------------------------------------------------------------- */
/* Articles                                                                   */
/* -------------------------------------------------------------------------- */

admin.get('/articles', async (c) =>
	c.json(await articleService.listAllArticles(await getContext()))
);

admin.get('/articles/:id', async (c) =>
	c.json(await articleService.getArticleById(await getContext(), c.req.param('id')))
);

admin.post('/articles', requireRole('editor'), async (c) => {
	const input = await body(c, articleInputSchema);
	const created = await articleService.createArticle(await getContext(), input, currentUser(c).id);
	return c.json(created, 201);
});

admin.put('/articles/:id', requireRole('editor'), async (c) => {
	const input = await body(c, articleInputSchema);
	return c.json(await articleService.updateArticle(await getContext(), c.req.param('id'), input));
});

admin.delete('/articles/:id', requireRole('editor'), async (c) => {
	await articleService.deleteArticle(await getContext(), c.req.param('id'));
	return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* Sponsors                                                                   */
/* -------------------------------------------------------------------------- */

admin.get('/sponsors', async (c) => c.json(await sponsorService.listSponsors(await getContext())));

admin.post('/sponsors', requireRole('admin'), async (c) => {
	const input = await body(c, sponsorInputSchema);
	return c.json(await sponsorService.createSponsor(await getContext(), input), 201);
});

admin.put('/sponsors/:id', requireRole('admin'), async (c) => {
	const input = await body(c, sponsorInputSchema);
	return c.json(await sponsorService.updateSponsor(await getContext(), c.req.param('id'), input));
});

admin.delete('/sponsors/:id', requireRole('admin'), async (c) => {
	await sponsorService.deleteSponsor(await getContext(), c.req.param('id'));
	return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* Uploads                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Hands back a presigned PUT. The bytes never touch this function — API Gateway
 * caps a body at 10MB and Lambda at 6MB, so proxying an 8MB photo would fail
 * outright.
 */
admin.post('/uploads/presign', requireRole('editor'), async (c) => {
	const input = await body(c, presignUploadInputSchema);
	const store = requireStorage(await getContext());
	return c.json(await store.presignUpload(input));
});

/* -------------------------------------------------------------------------- */
/* Speakers                                                                   */
/* -------------------------------------------------------------------------- */

admin.get('/speakers', async (c) => c.json(await speakerService.listSpeakers(await getContext())));

admin.get('/speakers/:id', async (c) =>
	c.json(await speakerService.getSpeakerById(await getContext(), c.req.param('id')))
);

admin.post('/speakers', requireRole('editor'), async (c) => {
	const input = await body(c, speakerInputSchema);
	return c.json(await speakerService.createSpeaker(await getContext(), input), 201);
});

admin.put('/speakers/:id', requireRole('editor'), async (c) => {
	const input = await body(c, speakerInputSchema);
	return c.json(await speakerService.updateSpeaker(await getContext(), c.req.param('id'), input));
});

admin.delete('/speakers/:id', requireRole('admin'), async (c) => {
	await speakerService.deleteSpeaker(await getContext(), c.req.param('id'));
	return c.body(null, 204);
});

admin.get('/events/:id/speakers', async (c) => {
	const locale = (c.req.query('locale') as Locale) ?? 'lo';
	return c.json(
		await speakerService.listEventSpeakers(await getContext(), c.req.param('id'), locale)
	);
});

admin.put('/events/:id/speakers', requireRole('editor'), async (c) => {
	const input = await body(c, setEventSpeakersInputSchema);
	await speakerService.setEventSpeakers(await getContext(), c.req.param('id'), input);
	return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* Event sponsors                                                             */
/* -------------------------------------------------------------------------- */

admin.get('/events/:id/sponsors', async (c) =>
	c.json(await sponsorService.listEventSponsors(await getContext(), c.req.param('id')))
);

admin.put('/events/:id/sponsors', requireRole('editor'), async (c) => {
	const input = await body(c, setEventSponsorsInputSchema);
	await sponsorService.setEventSponsors(await getContext(), c.req.param('id'), input);
	return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* Event materials                                                            */
/* -------------------------------------------------------------------------- */

/*
 * No visibility rule here: the backoffice always sees the full list, however
 * far off the event is. Whether the public may see any of it is decided in
 * eventService.getPublishedEventBySlug, which is the only path a visitor takes.
 */

admin.get('/events/:id/resources', async (c) =>
	c.json(await materialService.listResources(await getContext(), c.req.param('id')))
);

admin.put('/events/:id/resources', requireRole('editor'), async (c) => {
	const input = await body(c, setEventResourcesInputSchema);
	await materialService.setResources(await getContext(), c.req.param('id'), input);
	return c.body(null, 204);
});

admin.get('/events/:id/photos', async (c) =>
	c.json(await materialService.listPhotos(await getContext(), c.req.param('id')))
);

admin.put('/events/:id/photos', requireRole('editor'), async (c) => {
	const input = await body(c, setEventPhotosInputSchema);
	await materialService.setPhotos(await getContext(), c.req.param('id'), input);
	return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

admin.get('/events/:id/feedback', async (c) => {
	const ctx = await getContext();
	const id = c.req.param('id');
	const [entries, averages] = await Promise.all([
		feedbackService.listFeedback(ctx, id),
		feedbackService.getFeedbackAverages(ctx, id)
	]);
	return c.json({ entries, averages });
});

/* -------------------------------------------------------------------------- */
/* Public site feedback                                                       */
/* -------------------------------------------------------------------------- */

/*
 * Reading the queue is open to any signed-in operator; changing what the public
 * sees is not, so the writes take `requireRole('editor')`. Submitting is not
 * here at all — that is an unauthenticated public write and lives in the
 * SvelteKit action, alongside registration and the newsletter.
 */

admin.get('/site-feedback', async (c) => {
	const status = siteFeedbackStatusSchema.safeParse(c.req.query('status'));
	return c.json(
		await siteFeedbackService.listSiteFeedback(
			await getContext(),
			status.success ? status.data : undefined
		)
	);
});

admin.put('/site-feedback/:id/status', requireRole('editor'), async (c) => {
	const input = await body(c, setSiteFeedbackStatusInputSchema);
	return c.json(
		await siteFeedbackService.setSiteFeedbackStatus(
			await getContext(),
			c.req.param('id'),
			input.status,
			currentUser(c).id
		)
	);
});

admin.delete('/site-feedback/:id', requireRole('editor'), async (c) => {
	await siteFeedbackService.deleteSiteFeedback(await getContext(), c.req.param('id'));
	return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

admin.get('/users', requireRole('admin'), async (c) =>
	c.json(await userService.listUsers(await getContext()))
);

admin.get('/users/:id', requireRole('admin'), async (c) =>
	c.json(await userService.getUserById(await getContext(), c.req.param('id')))
);

/**
 * Profile edits are not admin-only: anyone may change their own name and photo.
 * An editor touching someone else's profile is still refused.
 */
admin.put('/users/:id/profile', async (c) => {
	const id = c.req.param('id');
	const actor = currentUser(c);
	if (actor.id !== id && actor.role !== 'admin') throw new ForbiddenError();

	const input = await body(c, updateUserProfileInputSchema);
	return c.json(await userService.updateUserProfile(await getContext(), id, input));
});

admin.post('/users', requireRole('admin'), async (c) => {
	const input = await body(c, inviteUserInputSchema);
	return c.json(await userService.inviteUser(await getContext(), input), 201);
});

admin.put('/users/:id/role', requireRole('admin'), async (c) => {
	const input = await body(c, updateUserRoleInputSchema);
	return c.json(
		await userService.updateUserRole(
			await getContext(),
			c.req.param('id'),
			input.role,
			currentUser(c).id
		)
	);
});

admin.delete('/users/:id', requireRole('admin'), async (c) => {
	await userService.removeUser(await getContext(), c.req.param('id'), currentUser(c).id);
	return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

admin.get('/dashboard', async (c) => {
	const ctx = await getContext();
	const [events, articles, subscribers, pendingFeedback] = await Promise.all([
		eventService.listAllEvents(ctx),
		articleService.listAllArticles(ctx),
		newsletterService.listSubscribers(ctx),
		siteFeedbackService.countPendingFeedback(ctx)
	]);

	const perEvent = await Promise.all(
		events.map(async (event) => ({
			id: event.id,
			slug: event.slug,
			title: event.translations[0]?.title ?? event.slug,
			startAt: event.startAt,
			capacity: event.capacity,
			...(await registrationService.getEventStats(ctx, event.id))
		}))
	);

	return c.json({
		totals: {
			events: events.length,
			publishedEvents: events.filter((e) => e.status === 'published').length,
			articles: articles.length,
			publishedArticles: articles.filter((a) => a.status === 'published').length,
			registrations: perEvent.reduce((sum, e) => sum + e.registered, 0),
			checkedIn: perEvent.reduce((sum, e) => sum + e.checkedIn, 0),
			subscribers: subscribers.filter((s) => !s.unsubscribedAt).length,
			// Rides along on the call the protected layout already makes, so the
			// sidebar badge costs no extra round trip.
			pendingFeedback
		},
		events: perEvent.sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
	});
});

app.route('/admin', admin);

export default app;
export type ApiApp = typeof app;
