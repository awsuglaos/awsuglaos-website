import { users, type User } from '@awsug/db';
import {
	LastAdminError,
	NotFoundError,
	SelfRoleChangeError,
	UserExistsError,
	type InviteUserInput,
	type UpdateUserProfileInput,
	type UserRole
} from '@awsug/shared';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { currentTime, requireDirectory, type AppContext } from '../context.js';
import { isUniqueViolation } from '../util/db-errors.js';

export async function listUsers(ctx: AppContext): Promise<User[]> {
	return ctx.db.select().from(users).orderBy(asc(users.email));
}

export async function getUserById(ctx: AppContext, id: string): Promise<User> {
	const [row] = await ctx.db.select().from(users).where(eq(users.id, id)).limit(1);
	if (!row) throw new NotFoundError('User');
	return row;
}

/**
 * Name and photo only — deliberately no role. Anyone may edit their own
 * profile, so bundling the role in here would mean the self-change guard had to
 * distinguish which fields moved.
 */
export async function updateUserProfile(
	ctx: AppContext,
	targetUserId: string,
	input: UpdateUserProfileInput
): Promise<User> {
	const [updated] = await ctx.db
		.update(users)
		.set({
			name: input.name,
			avatarUrl: input.avatarUrl || null,
			updatedAt: currentTime(ctx)
		})
		.where(eq(users.id, targetUserId))
		.returning();

	if (!updated) throw new NotFoundError('User');
	return updated;
}

async function countOtherAdmins(ctx: AppContext, excludingUserId: string): Promise<number> {
	const [row] = await ctx.db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(and(eq(users.role, 'admin'), ne(users.id, excludingUserId)));
	return row?.count ?? 0;
}

/**
 * Creates the identity in the directory *and* the authorization row.
 *
 * Order matters: the directory call comes first, because it is the one that can
 * fail for reasons outside our control (a Cognito quota, a malformed address).
 * If it succeeds and the insert then fails, we roll the identity back — leaving
 * an orphaned Cognito user would block the address from ever being invited
 * again, with nothing in our own data to explain why.
 */
export async function inviteUser(ctx: AppContext, input: InviteUserInput): Promise<User> {
	const directory = requireDirectory(ctx);

	const [existing] = await ctx.db
		.select()
		.from(users)
		.where(eq(users.email, input.email))
		.limit(1);
	if (existing) throw new UserExistsError(input.email);

	const { subject } = await directory.invite(input);

	try {
		const [created] = await ctx.db
			.insert(users)
			.values({
				email: input.email,
				name: input.name,
				role: input.role,
				cognitoSub: subject
			})
			.returning();

		if (!created) throw new Error('User insert returned no row');
		return created;
	} catch (error) {
		await directory.remove(input.email).catch((cleanupError) => {
			console.error('Failed to roll back directory user after insert failure', {
				email: input.email,
				error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
			});
		});
		if (isUniqueViolation(error)) throw new UserExistsError(input.email);
		throw error;
	}
}

/**
 * Two guards, both of which exist because the failure mode is unrecoverable
 * from inside the product: demote yourself, or remove the only admin, and there
 * is nobody left who can grant the role back.
 */
export async function updateUserRole(
	ctx: AppContext,
	targetUserId: string,
	role: UserRole,
	actingUserId: string
): Promise<User> {
	if (targetUserId === actingUserId) throw new SelfRoleChangeError();

	const [target] = await ctx.db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
	if (!target) throw new NotFoundError('User');

	if (target.role === 'admin' && role !== 'admin') {
		if ((await countOtherAdmins(ctx, target.id)) === 0) throw new LastAdminError();
	}

	const [updated] = await ctx.db
		.update(users)
		.set({ role, updatedAt: currentTime(ctx) })
		.where(eq(users.id, targetUserId))
		.returning();

	if (!updated) throw new NotFoundError('User');
	return updated;
}

export async function removeUser(
	ctx: AppContext,
	targetUserId: string,
	actingUserId: string
): Promise<void> {
	if (targetUserId === actingUserId) throw new SelfRoleChangeError();

	const [target] = await ctx.db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
	if (!target) throw new NotFoundError('User');

	if (target.role === 'admin' && (await countOtherAdmins(ctx, target.id)) === 0) {
		throw new LastAdminError();
	}

	// Row first: it is what actually grants access, so dropping it closes the
	// door even if the directory call then fails.
	await ctx.db.delete(users).where(eq(users.id, targetUserId));
	await requireDirectory(ctx)
		.remove(target.email)
		.catch((error) => {
			console.error('User row deleted but directory removal failed', {
				email: target.email,
				error: error instanceof Error ? error.message : String(error)
			});
		});
}
