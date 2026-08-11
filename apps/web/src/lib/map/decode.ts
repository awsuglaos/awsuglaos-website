/**
 * Reads the containers written by `scripts/bake-map.mjs`.
 *
 * Layout: a little-endian uint32 byte length, that many bytes of UTF-8 JSON, then the
 * typed-array blocks the header describes, each aligned to 4 bytes so they can be viewed in
 * place rather than copied. The bake pads the header to keep that alignment unconditional.
 */

interface BlockRef {
	type: string;
	length: number;
	byteOffset: number;
	byteLength: number;
}

interface BaseHeader {
	version: number;
	kind: string;
	attribution: string;
	generated: string;
	/** Scene units per Int16 step. Positions are stored quantised; multiply to restore. */
	positionScale: number;
	blocks: Record<string, BlockRef>;
}

export interface CountryHeader extends BaseHeader {
	kind: 'country';
	elevationUnitsPerMetre: number;
	contourMajorEvery: number;
	contourRange: [number, number];
	/** Highest sampled elevation inside the border, in metres. */
	peak: number;
}

export interface CityHeader extends BaseHeader {
	kind: 'city';
	bbox: { south: number; west: number; north: number; east: number };
}

export interface CountryData {
	header: CountryHeader;
	/** Points per contour polyline. */
	counts: Uint16Array;
	/** Elevation of each polyline, in metres. */
	levels: Uint16Array;
	/** Interleaved quantised x, z for every contour point, polylines back to back. */
	coords: Int16Array;
	/** The national border as one closed ring of quantised x, z. */
	border: Int16Array;
}

export interface CityData {
	header: CityHeader;
	counts: Uint16Array;
	/** Street importance, 1 (residential) to 3 (trunk), for line weight and brightness. */
	weights: Uint8Array;
	coords: Int16Array;
	waterCounts: Uint16Array;
	waterCoords: Int16Array;
}

const VIEWS = {
	Int8Array,
	Uint8Array,
	Int16Array,
	Uint16Array,
	Int32Array,
	Uint32Array,
	Float32Array
} as const;

function read(buffer: ArrayBuffer) {
	const headerLength = new DataView(buffer).getUint32(0, true);
	const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength)));
	const base = 4 + headerLength;

	return {
		header,
		block: <T>(name: string): T => {
			const ref = header.blocks[name] as BlockRef | undefined;
			if (!ref) throw new Error(`Map data is missing the "${name}" block`);
			const View = VIEWS[ref.type as keyof typeof VIEWS];
			if (!View) throw new Error(`Map data uses an unknown array type "${ref.type}"`);
			return new View(buffer, base + ref.byteOffset, ref.length) as T;
		}
	};
}

export function decodeCountry(buffer: ArrayBuffer): CountryData {
	const { header, block } = read(buffer);
	return {
		header,
		counts: block<Uint16Array>('counts'),
		levels: block<Uint16Array>('levels'),
		coords: block<Int16Array>('coords'),
		border: block<Int16Array>('border')
	};
}

export function decodeCity(buffer: ArrayBuffer): CityData {
	const { header, block } = read(buffer);
	return {
		header,
		counts: block<Uint16Array>('counts'),
		weights: block<Uint8Array>('weights'),
		coords: block<Int16Array>('coords'),
		waterCounts: block<Uint16Array>('waterCounts'),
		waterCoords: block<Int16Array>('waterCoords')
	};
}
