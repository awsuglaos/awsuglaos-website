import { ulid } from 'ulid';

/**
 * The QR payload for a registration.
 *
 * ULID gives a 26-character Crockford base32 string: URL-safe, encodable in a
 * QR code's efficient alphanumeric mode, and lexicographically ordered by issue
 * time down to the millisecond (codes minted within the same millisecond share
 * a timestamp prefix and are ordered arbitrarily). The trailing 80 bits are
 * random, so codes are not enumerable — which matters because possession of a
 * code is what gets someone through the door.
 */
export function generateTicketCode(): string {
	return ulid();
}

/** Random opaque token for newsletter unsubscribe links. */
export function generateUnsubscribeToken(): string {
	return `${ulid()}${ulid()}`.slice(0, 48);
}
