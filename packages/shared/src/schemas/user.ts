import { z } from 'zod';
import { emailSchema, imageUrlSchema, text, userRoleSchema } from '../primitives.js';

export const inviteUserInputSchema = z.object({
	email: emailSchema,
	name: text(2, 160, 'Name'),
	role: userRoleSchema
});

export const updateUserRoleInputSchema = z.object({
	role: userRoleSchema
});

/**
 * Kept separate from the role update on purpose. Changing your own role is
 * refused — but editing your own name or photo must not be, and folding them
 * into one payload would force a single guard to cover both.
 */
export const updateUserProfileInputSchema = z.object({
	name: text(2, 160, 'Name'),
	avatarUrl: imageUrlSchema.optional()
});

export type InviteUserInput = z.infer<typeof inviteUserInputSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleInputSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileInputSchema>;
