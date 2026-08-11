import {
	articleService,
	eventService,
	feedbackService,
	newsletterService,
	registrationService,
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
	setEventSpeakersInputSchema,
	setEventSponsorsInputSchema,
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
async function body<T>(c: { req: { json: () => Promise<unknown> } }, schema: ZodType<T>): Promise<T> {
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
	const csv = `﻿${registrationService.registrationsToCsv(rows)}`;

	c.header('content-type', 'text/csv; charset=utf-8');
	c.header('content-disposition', `attachment; filename="${event.slug}-registrations.csv"`);
	return c.body(csv);
});

/* -------------------------------------------------------------------------- */
/* Articles                                                                   */
/* -------------------------------------------------------------------------- */

admin.get('/articles', async (c) => c.json(await articleService.listAllArticles(await getContext())));

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
	const [events, articles, subscribers] = await Promise.all([
		eventService.listAllEvents(ctx),
		articleService.listAllArticles(ctx),
		newsletterService.listSubscribers(ctx)
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
			subscribers: subscribers.filter((s) => !s.unsubscribedAt).length
		},
		events: perEvent.sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
	});
});

app.route('/admin', admin);

export default app;
export type ApiApp = typeof app;
