import { currentLocale } from '$lib/locale';

/** Every event is in Vientiane, so times are always shown in local Lao time. */
export const TIME_ZONE = 'Asia/Vientiane';

function tag(): string {
	return currentLocale() === 'lo' ? 'lo-LA' : 'en-GB';
}

function safeFormat(date: Date, options: Intl.DateTimeFormatOptions): string {
	try {
		return new Intl.DateTimeFormat(tag(), { ...options, timeZone: TIME_ZONE }).format(date);
	} catch {
		// A Node build without full ICU falls back rather than throwing.
		return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: TIME_ZONE }).format(date);
	}
}

export function formatDate(date: Date): string {
	return safeFormat(date, { dateStyle: 'long' });
}

export function formatDateTime(date: Date): string {
	return safeFormat(date, { dateStyle: 'full', timeStyle: 'short' });
}

export function formatTime(date: Date): string {
	return safeFormat(date, { timeStyle: 'short' });
}

/** "9:00 – 17:00" for a same-day event, otherwise both full dates. */
export function formatEventRange(startAt: Date, endAt: Date): string {
	const sameDay =
		safeFormat(startAt, { dateStyle: 'short' }) === safeFormat(endAt, { dateStyle: 'short' });
	return sameDay
		? `${formatDateTime(startAt)} – ${formatTime(endAt)}`
		: `${formatDateTime(startAt)} – ${formatDateTime(endAt)}`;
}

/** ISO date for <time datetime> and structured data. */
export function isoDate(date: Date): string {
	return date.toISOString();
}
