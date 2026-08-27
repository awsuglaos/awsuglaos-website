import { fromVientianeInput } from '$lib/datetime';
import { EMPTY_DOC, LOCALES, type RichTextDoc } from '@awsug/shared';
import { field } from './form';

/**
 * The rich text editor posts its document as a JSON string in a hidden field.
 * Malformed JSON becomes an empty document rather than an exception — the Zod
 * schema then rejects it with "Description is required", which is a far more
 * useful message than a parse error.
 */
function richTextField(data: FormData, name: string): RichTextDoc {
	const raw = field(data, name);
	if (!raw) return EMPTY_DOC;
	try {
		return JSON.parse(raw) as RichTextDoc;
	} catch {
		return EMPTY_DOC;
	}
}

/**
 * Turns the bilingual admin forms into the shape the Zod schemas expect.
 *
 * A locale is only included when its title is filled in, which is what lets an
 * editor publish in Lao first and add the English translation later without
 * storing an empty row.
 */
export function parseEventForm(data: FormData) {
	const start = field(data, 'startAt');
	const end = field(data, 'endAt');

	return {
		slug: field(data, 'slug') ?? '',
		startAt: start ? fromVientianeInput(start) : new Date(Number.NaN),
		endAt: end ? fromVientianeInput(end) : new Date(Number.NaN),
		capacity: field(data, 'capacity') ?? '0',
		locationUrl: field(data, 'locationUrl') ?? '',
		coverImageUrl: field(data, 'coverImageUrl') ?? '',
		status: field(data, 'status') ?? 'draft',
		translations: LOCALES.map((locale) => ({
			locale,
			title: field(data, `title_${locale}`) ?? '',
			description: richTextField(data, `description_${locale}`),
			locationName: field(data, `locationName_${locale}`) ?? ''
		})).filter((t) => t.title !== '')
	};
}

export function parseArticleForm(data: FormData) {
	return {
		slug: field(data, 'slug') ?? '',
		category: field(data, 'category') ?? '',
		coverImageUrl: field(data, 'coverImageUrl') ?? '',
		status: field(data, 'status') ?? 'draft',
		translations: LOCALES.map((locale) => ({
			locale,
			title: field(data, `title_${locale}`) ?? '',
			excerpt: field(data, `excerpt_${locale}`) ?? '',
			content: richTextField(data, `content_${locale}`)
		})).filter((t) => t.title !== '')
	};
}

export function parseSponsorForm(data: FormData) {
	return {
		name: field(data, 'name') ?? '',
		logoUrl: field(data, 'logoUrl') ?? '',
		websiteUrl: field(data, 'websiteUrl') ?? '',
		tier: field(data, 'tier') ?? 'community',
		sortOrder: field(data, 'sortOrder') ?? '0'
	};
}

export function parseSpeakerForm(data: FormData) {
	return {
		slug: field(data, 'slug') ?? '',
		photoUrl: field(data, 'photoUrl') ?? '',
		company: field(data, 'company') ?? '',
		communityRole: field(data, 'communityRole') ?? 'none',
		sortOrder: field(data, 'sortOrder') ?? '0',
		websiteUrl: field(data, 'websiteUrl') ?? '',
		linkedinUrl: field(data, 'linkedinUrl') ?? '',
		githubUrl: field(data, 'githubUrl') ?? '',
		translations: LOCALES.map((locale) => ({
			locale,
			name: field(data, `name_${locale}`) ?? '',
			title: field(data, `title_${locale}`) ?? '',
			bio: field(data, `bio_${locale}`) ?? ''
		})).filter((t) => t.name !== '')
	};
}

/**
 * The order board posts one flat pair of arrays in visual order: every card in
 * every role zone, top to bottom. Position in the array is the sort order, so
 * dragging between zones and reordering within one are the same submission.
 */
export function parseSpeakerOrderForm(data: FormData) {
	const ids = data.getAll('id').map(String);
	const roles = data.getAll('communityRole').map(String);

	return {
		speakers: ids.map((id, index) => ({
			id,
			communityRole: roles[index] ?? 'none',
			sortOrder: index
		}))
	};
}

/**
 * The speaker and sponsor pickers post parallel arrays of the same length —
 * `getAll` preserves row order, so index N of each array belongs to row N.
 */
export function parseEventSpeakersForm(data: FormData) {
	const ids = data.getAll('speakerId').map(String);

	return {
		speakers: ids.map((speakerId, index) => ({
			speakerId,
			sortOrder: index,
			translations: LOCALES.map((locale) => ({
				locale,
				talkTitle: String(data.getAll(`talkTitle_${locale}`)[index] ?? ''),
				abstract: String(data.getAll(`abstract_${locale}`)[index] ?? '')
			}))
		}))
	};
}

export function parseEventSponsorsForm(data: FormData) {
	const ids = data.getAll('sponsorId').map(String);
	const tiers = data.getAll('sponsorTier').map(String);

	return {
		sponsors: ids.map((sponsorId, index) => ({
			sponsorId,
			tier: tiers[index] ?? 'community',
			sortOrder: index
		}))
	};
}

/**
 * Parallel arrays, one entry per row, exactly as the sponsor picker does.
 *
 * Empty strings become null rather than being passed through: a link has no
 * size or content type, and the hidden inputs that carry them are simply blank
 * in that case.
 */
export function parseEventResourcesForm(data: FormData) {
	const titles = data.getAll('resourceTitle').map(String);
	const kinds = data.getAll('resourceKind').map(String);
	const urls = data.getAll('resourceUrl').map(String);
	const sizes = data.getAll('resourceSize').map(String);
	const types = data.getAll('resourceContentType').map(String);

	return {
		resources: titles.map((title, index) => ({
			title,
			kind: kinds[index] || 'document',
			url: urls[index] ?? '',
			sizeBytes: sizes[index] ? Number(sizes[index]) : null,
			contentType: types[index] || null
		}))
	};
}

export function parseEventPhotosForm(data: FormData) {
	const urls = data.getAll('photoUrl').map(String);
	const captions = data.getAll('photoCaption').map(String);

	return {
		photos: urls.map((url, index) => ({
			url,
			caption: captions[index]?.trim() ? captions[index]! : null
		}))
	};
}
