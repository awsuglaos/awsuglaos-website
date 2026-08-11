/**
 * Recognising a constraint breach has to survive two layers of wrapping.
 *
 * Drizzle raises a `DrizzleQueryError` whose message is only "Failed query: …",
 * carrying the driver error on `cause`. Underneath that, the two drivers differ
 * again: node-postgres exposes SQLSTATE on `err.code`, while the RDS Data API
 * returns a BadRequestException with the code in the message text. So walk the
 * cause chain and accept either shape — otherwise a duplicate registration
 * surfaces to the visitor as a 500 instead of "you are already registered".
 */
const MAX_CAUSE_DEPTH = 5;

function causeChain(error: unknown): unknown[] {
	const chain: unknown[] = [];
	let current = error;
	for (let i = 0; i < MAX_CAUSE_DEPTH && current != null; i++) {
		chain.push(current);
		current = (current as { cause?: unknown }).cause;
	}
	return chain;
}

function matches(error: unknown, sqlState: string, textFragments: readonly string[]): boolean {
	if (typeof error !== 'object' || error === null) return false;

	const code = (error as { code?: unknown }).code;
	if (code === sqlState) return true;

	const message = (error as { message?: unknown }).message;
	if (typeof message !== 'string') return false;

	return (
		message.includes(`SQLSTATE ${sqlState}`) ||
		textFragments.some((fragment) => message.includes(fragment))
	);
}

/** SQLSTATE 23505 — a unique index rejected the row. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
	const hit = causeChain(error).some((e) =>
		matches(e, '23505', ['duplicate key value violates unique constraint'])
	);
	if (!hit) return false;
	if (!constraint) return true;

	return causeChain(error).some((e) => {
		if (typeof e !== 'object' || e === null) return false;
		if ((e as { constraint?: unknown }).constraint === constraint) return true;
		const message = (e as { message?: unknown }).message;
		return typeof message === 'string' && message.includes(constraint);
	});
}

/** SQLSTATE 23514 — a CHECK constraint rejected the row. */
export function isCheckViolation(error: unknown, constraint?: string): boolean {
	const hit = causeChain(error).some((e) =>
		matches(e, '23514', ['violates check constraint'])
	);
	if (!hit) return false;
	if (!constraint) return true;

	return causeChain(error).some((e) => {
		if (typeof e !== 'object' || e === null) return false;
		if ((e as { constraint?: unknown }).constraint === constraint) return true;
		const message = (e as { message?: unknown }).message;
		return typeof message === 'string' && message.includes(constraint);
	});
}
