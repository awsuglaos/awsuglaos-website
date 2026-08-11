/**
 * The places named on the country map.
 *
 * A short, curated list rather than an OSM query: at hero scale only a handful of labels
 * can be read at once, and which ones appear is an editorial decision about what a Lao
 * visitor expects to see, not something to be decided by whatever a `place=city` filter
 * happens to return. Coordinates are the real ones.
 *
 * `hub` is Vientiane — where the group meets, where the network arcs originate, and the
 * only label that is never dropped when space runs out.
 */
export interface Place {
	/** Latin name. */
	name: string;
	/** Lao name, shown when the page is in Lao. */
	nameLo: string;
	lat: number;
	lng: number;
	/** The hub anchors the network; spokes receive arcs from it. */
	role: 'hub' | 'spoke';
}

export const PLACES: readonly Place[] = [
	{ name: 'Vientiane', nameLo: 'ວຽງຈັນ', lat: 17.9757, lng: 102.6331, role: 'hub' },
	{ name: 'Luang Prabang', nameLo: 'ຫຼວງພະບາງ', lat: 19.8834, lng: 102.135, role: 'spoke' },
	{ name: 'Luang Namtha', nameLo: 'ຫຼວງນ້ຳທາ', lat: 20.9489, lng: 101.4025, role: 'spoke' },
	{ name: 'Xam Neua', nameLo: 'ຊຳເໜືອ', lat: 20.4172, lng: 104.0489, role: 'spoke' },
	{ name: 'Thakhek', nameLo: 'ທ່າແຂກ', lat: 17.4103, lng: 104.8214, role: 'spoke' },
	{ name: 'Savannakhet', nameLo: 'ສະຫວັນນະເຂດ', lat: 16.5569, lng: 104.7519, role: 'spoke' },
	{ name: 'Pakse', nameLo: 'ປາກເຊ', lat: 15.1202, lng: 105.7987, role: 'spoke' }
];

export const HUB = PLACES.find((place) => place.role === 'hub')!;
