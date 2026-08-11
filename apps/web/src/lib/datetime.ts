/**
 * Events are always in Vientiane, and Laos does not observe daylight saving —
 * the offset is a fixed +07:00 year round. That lets us convert between a
 * `datetime-local` input and UTC with a literal offset instead of dragging in a
 * timezone library, and means an organiser editing from another country still
 * enters the local start time rather than their own.
 */
export const VIENTIANE_OFFSET = '+07:00';

/** "2026-09-19T09:00" (Vientiane wall clock) → the corresponding UTC instant. */
export function fromVientianeInput(value: string): Date {
	const withSeconds = value.length === 16 ? `${value}:00` : value;
	return new Date(`${withSeconds}${VIENTIANE_OFFSET}`);
}

/** A UTC instant → "2026-09-19T09:00" for a `datetime-local` input. */
export function toVientianeInput(date: Date): string {
	const shifted = new Date(date.getTime() + 7 * 3_600_000);
	return shifted.toISOString().slice(0, 16);
}
