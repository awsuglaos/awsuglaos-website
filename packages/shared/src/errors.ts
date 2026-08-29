/**
 * Domain errors carry a stable machine-readable `code` and an HTTP `status`, so
 * the Hono API and SvelteKit form actions can both map them to a response
 * without either layer re-deriving what went wrong.
 */
export type DomainErrorCode =
	| 'not_found'
	| 'validation_failed'
	| 'event_full'
	| 'registration_closed'
	| 'already_registered'
	| 'already_checked_in'
	| 'registration_not_approved'
	| 'slug_taken'
	| 'forbidden'
	| 'unauthorized'
	| 'rate_limited'
	| 'feedback_not_open'
	| 'feedback_already_submitted'
	| 'last_admin'
	| 'self_role_change'
	| 'user_exists'
	| 'upload_rejected';

export class DomainError extends Error {
	readonly code: DomainErrorCode;
	readonly status: number;
	readonly details: Record<string, unknown> | undefined;

	constructor(
		code: DomainErrorCode,
		message: string,
		status: number,
		details?: Record<string, unknown>
	) {
		super(message);
		this.name = new.target.name;
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

/**
 * A submission that failed the schema built for it.
 *
 * `details.fieldErrors` is keyed the same way the form's inputs are named, so
 * a caller can mark the offending question without re-deriving anything.
 */
export class ValidationFailedError extends DomainError {
	constructor(fieldErrors: Record<string, string>, message = 'Check the answers and try again') {
		super('validation_failed', message, 400, { fieldErrors });
	}
}

export class NotFoundError extends DomainError {
	constructor(what = 'Resource') {
		super('not_found', `${what} not found`, 404);
	}
}

export class EventFullError extends DomainError {
	constructor() {
		super('event_full', 'This event has reached capacity', 409);
	}
}

export class RegistrationClosedError extends DomainError {
	constructor(reason = 'Registration is closed for this event') {
		super('registration_closed', reason, 409);
	}
}

export class AlreadyRegisteredError extends DomainError {
	constructor() {
		super('already_registered', 'This email is already registered for the event', 409);
	}
}

export class AlreadyCheckedInError extends DomainError {
	constructor(checkedInAt: Date) {
		super('already_checked_in', 'This ticket has already been checked in', 409, {
			checkedInAt: checkedInAt.toISOString()
		});
	}
}

/**
 * The ticket exists but its registration has not been approved.
 *
 * Ticket codes are minted at registration, before any decision is made, so on
 * an approval event a pending applicant is holding a real code. Without this
 * guard they could scan their way in before anyone had said yes.
 */
export class RegistrationNotApprovedError extends DomainError {
	constructor(status: string) {
		super(
			'registration_not_approved',
			status === 'rejected'
				? 'This registration was not approved'
				: 'This registration is still awaiting approval',
			409,
			{ status }
		);
	}
}

export class SlugTakenError extends DomainError {
	constructor(slug: string) {
		super('slug_taken', `The slug "${slug}" is already in use`, 409, { slug });
	}
}

export class ForbiddenError extends DomainError {
	constructor(message = 'You do not have permission to do that') {
		super('forbidden', message, 403);
	}
}

export class UnauthorizedError extends DomainError {
	constructor(message = 'Authentication required') {
		super('unauthorized', message, 401);
	}
}

export class FeedbackNotOpenError extends DomainError {
	constructor(message = 'Feedback opens once the event has finished') {
		super('feedback_not_open', message, 409);
	}
}

export class FeedbackAlreadySubmittedError extends DomainError {
	constructor() {
		super('feedback_already_submitted', 'Feedback has already been submitted for this ticket', 409);
	}
}

/**
 * Removing or demoting the only admin would lock the backoffice permanently —
 * there would be nobody left who could grant the role back.
 */
export class LastAdminError extends DomainError {
	constructor() {
		super('last_admin', 'The last remaining admin cannot be removed or demoted', 409);
	}
}

/** Changing your own role is how an admin accidentally demotes themselves. */
export class SelfRoleChangeError extends DomainError {
	constructor() {
		super('self_role_change', 'You cannot change your own role', 409);
	}
}

export class UserExistsError extends DomainError {
	constructor(email: string) {
		super('user_exists', `${email} already has an account`, 409, { email });
	}
}

export class UploadRejectedError extends DomainError {
	constructor(message: string) {
		super('upload_rejected', message, 400);
	}
}

export function isDomainError(error: unknown): error is DomainError {
	return error instanceof DomainError;
}
