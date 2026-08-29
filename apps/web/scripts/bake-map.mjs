/*
 * Bakes the map the site is drawn on.
 *
 *   node scripts/bake-map.mjs
 *
 * Two outputs. `laos-terrain.bin` carries the country: elevation contours traced from real
 * SRTM data, plus the national border. `vientiane-streets.bin` carries the city: the street
 * network and the Mekong. Both are committed, so a normal install and a normal build never
 * touch the network — the same contract generate-brand-assets.mjs has.
 *
 * WHY CONTOURS ARE TRACED HERE AND NOT DRAWN IN A SHADER. The obvious alternative is to
 * ship the heightmap as a texture and derive isolines in a fragment shader. It was rejected
 * for two concrete reasons: Terrarium encodes elevation across RGB, so the low byte is
 * high-frequency noise that PNG cannot compress, and browsers truncate 16-bit PNGs to 8
 * bits when uploading them as textures — which quantises Laos's 2,819 m range to ~11 m
 * steps and puts visible stair-stepping in every line. Marching squares offline gives crisp
 * lines, per-level styling, and a smaller file.
 *
 * Elevation data: AWS Open Data Terrain Tiles (SRTM/ASTER), public domain.
 * Border: Natural Earth admin-0, public domain.
 * Streets and water: OpenStreetMap contributors, ODbL — the footer attribution is a licence
 * condition, do not remove it.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	CITY_BBOX,
	CITY_HALF_DEPTH,
	CITY_HALF_WIDTH,
	CITY_MINOR_FADE_END,
	CITY_MINOR_RADIUS,
	CITY_UNITS_PER_METRE,
	COUNTRY_ELEVATION_UNITS_PER_METRE,
	COUNTRY_HALF_DEPTH,
	COUNTRY_HALF_WIDTH,
	projectCity,
	projectCountry
} from '../src/lib/map/projection.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (name) => join(root, 'static', name);
const cacheDir = join(root, '.osm-cache');

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

/** Zoom 7 covers Laos in 20 tiles and resolves ridgelines at roughly 600 m. */
const DEM_ZOOM = 7;

/**
 * Contour interval. Laos's lowlands sit around 150–200 m along the Mekong, so starting at
 * 250 m leaves the river plain deliberately dark and lets the linework describe only the
 * mountains — which is where the country's character is.
 */
const CONTOUR_MIN = 250;
const CONTOUR_MAX = 2750;
const CONTOUR_STEP = 250;
/** Every fourth line reads brighter, the way an index contour does on a real chart. */
const MAJOR_EVERY = 1000;

/** Douglas–Peucker tolerance for contours, in scene units (1 unit = 10 km). */
const CONTOUR_SIMPLIFY = 0.045;
/** Traced rings shorter than this are speckle, not landform. */
const MIN_CONTOUR_POINTS = 5;

const ENDPOINTS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter'
];

const USER_AGENT =
	'awsug-lao-website/1.0 (Laos map bake; +https://github.com/awsuglaos)';

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Perpendicular distance from p to segment ab. */
function segmentDistance(p, a, b) {
	const dx = b[0] - a[0];
	const dz = b[1] - a[1];
	const lengthSq = dx * dx + dz * dz;
	if (lengthSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
	let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** Ramer–Douglas–Peucker on an open polyline. Iterative: contour rings get long. */
function simplify(points, tolerance) {
	if (points.length < 3) return points;

	const keep = new Uint8Array(points.length);
	keep[0] = keep[points.length - 1] = 1;
	const stack = [[0, points.length - 1]];

	while (stack.length > 0) {
		const [first, last] = stack.pop();
		let index = -1;
		let maxDistance = tolerance;

		for (let i = first + 1; i < last; i++) {
			const distance = segmentDistance(points[i], points[first], points[last]);
			if (distance > maxDistance) {
				index = i;
				maxDistance = distance;
			}
		}

		if (index !== -1) {
			keep[index] = 1;
			stack.push([first, index], [index, last]);
		}
	}

	return points.filter((_, i) => keep[i]);
}

/**
 * Length-prefixed JSON header followed by 4-byte-aligned typed arrays.
 *
 * The header is padded to a multiple of 4. Blocks are aligned relative to the payload, but
 * the payload starts at `4 + headerLength`, so an odd header shifts every block by an odd
 * number of bytes and the browser refuses to create the views over them. Whether that
 * happened used to depend on how many characters the JSON came out to, which made an
 * unrelated header edit able to break decoding. Trailing spaces are valid JSON whitespace.
 */
function pack(header, blocks) {
	const aligned = [];
	let offset = 0;

	for (const [name, array] of Object.entries(blocks)) {
		const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
		const padding = (4 - (offset % 4)) % 4;
		if (padding) {
			aligned.push(new Uint8Array(padding));
			offset += padding;
		}
		header.blocks[name] = {
			type: array.constructor.name,
			length: array.length,
			byteOffset: offset,
			byteLength: bytes.byteLength
		};
		aligned.push(bytes);
		offset += bytes.byteLength;
	}

	let headerJson = JSON.stringify(header);
	while (Buffer.byteLength(headerJson, 'utf8') % 4 !== 0) headerJson += ' ';

	const headerBytes = Buffer.from(headerJson, 'utf8');
	const prefix = Buffer.alloc(4);
	prefix.writeUInt32LE(headerBytes.byteLength, 0);
	return Buffer.concat([prefix, headerBytes, ...aligned.map((a) => Buffer.from(a))]);
}

async function write(name, header, blocks) {
	const buffer = pack(header, blocks);
	await writeFile(out(name), buffer);
	const gzipped = gzipSync(buffer, { level: 9 }).byteLength;
	console.log(
		`  ${name.padEnd(26)} ${(buffer.byteLength / 1024).toFixed(0).padStart(5)} KB raw` +
			`  ${(gzipped / 1024).toFixed(0).padStart(4)} KB gzipped`
	);
	return gzipped;
}

async function cached(label, produce) {
	const path = join(cacheDir, `${label}.json`);
	try {
		const hit = JSON.parse(await readFile(path, 'utf8'));
		console.log(`  ${label}: cached`);
		return hit;
	} catch {
		const value = await produce();
		await mkdir(cacheDir, { recursive: true });
		await writeFile(path, JSON.stringify(value));
		return value;
	}
}

/* -------------------------------------------------------------------------- */
/* Elevation                                                                  */
/* -------------------------------------------------------------------------- */

const lon2tile = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2tile = (lat, z) =>
	Math.floor(
		((1 - Math.log(Math.tan(lat * (Math.PI / 180)) + 1 / Math.cos(lat * (Math.PI / 180))) / Math.PI) /
			2) *
			2 ** z
	);
const tile2lon = (x, z) => (x / 2 ** z) * 360 - 180;
const tile2lat = (y, z) => {
	const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
	return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/**
 * Fetch and stitch the Terrarium tiles covering Laos into one height grid.
 *
 * Terrarium packs elevation as `(R * 256 + G + B / 256) - 32768` metres. The tiles come
 * from the AWS Open Data registry, which is a pleasing provenance for this particular
 * community: the terrain under their map is served from the platform they meet to learn.
 */
async function fetchHeightGrid(bbox) {
	const x0 = lon2tile(bbox.west, DEM_ZOOM);
	const x1 = lon2tile(bbox.east, DEM_ZOOM);
	const y0 = lat2tile(bbox.north, DEM_ZOOM);
	const y1 = lat2tile(bbox.south, DEM_ZOOM);

	const tilesX = x1 - x0 + 1;
	const tilesY = y1 - y0 + 1;
	const width = tilesX * 256;
	const height = tilesY * 256;
	const grid = new Float32Array(width * height);

	console.log(`  DEM: ${tilesX}×${tilesY} tiles at z${DEM_ZOOM} → ${width}×${height} samples`);

	for (let ty = 0; ty < tilesY; ty++) {
		for (let tx = 0; tx < tilesX; tx++) {
			const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_ZOOM}/${x0 + tx}/${y0 + ty}.png`;
			const png = await fetchTile(url);
			const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });

			for (let py = 0; py < 256; py++) {
				for (let px = 0; px < 256; px++) {
					const s = (py * info.width + px) * info.channels;
					const elevation = data[s] * 256 + data[s + 1] + data[s + 2] / 256 - 32768;
					grid[(ty * 256 + py) * width + (tx * 256 + px)] = elevation;
				}
			}
		}
	}

	return {
		grid,
		width,
		height,
		x0,
		y0,
		/** Grid column/row → geographic coordinate. */
		lngAt: (gx) => tile2lon(x0 + gx / 256, DEM_ZOOM),
		latAt: (gy) => tile2lat(y0 + gy / 256, DEM_ZOOM)
	};
}

async function fetchTile(url) {
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const res = await fetch(url, {
				headers: { 'user-agent': USER_AGENT },
				signal: AbortSignal.timeout(60_000)
			});
			if (!res.ok) throw new Error(`${res.status}`);
			return Buffer.from(await res.arrayBuffer());
		} catch (error) {
			if (attempt === 3) throw new Error(`DEM tile ${url} failed`, { cause: error });
			await new Promise((r) => setTimeout(r, 2 ** attempt * 1500));
		}
	}
	throw new Error('unreachable');
}

/** One pass of a 3×3 box blur. SRTM is speckly and speckle becomes contour confetti. */
function smooth(grid, width, height) {
	const output = new Float32Array(grid.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0;
			let n = 0;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
					sum += grid[ny * width + nx];
					n++;
				}
			}
			output[y * width + x] = sum / n;
		}
	}
	return output;
}

/* -------------------------------------------------------------------------- */
/* Border                                                                     */
/* -------------------------------------------------------------------------- */

const NATURAL_EARTH =
	'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

async function fetchLaosRing() {
	return cached('laos-border', async () => {
		const res = await fetch(NATURAL_EARTH, {
			headers: { 'user-agent': USER_AGENT },
			signal: AbortSignal.timeout(120_000)
		});
		if (!res.ok) throw new Error(`Natural Earth ${res.status}`);
		const geo = await res.json();
		const laos = geo.features.find((f) => /^Lao/.test(f.properties?.NAME ?? ''));
		if (!laos) throw new Error('Laos not found in Natural Earth admin-0');

		const rings =
			laos.geometry.type === 'MultiPolygon'
				? laos.geometry.coordinates.flat(1)
				: laos.geometry.coordinates;
		// Largest ring is the mainland; the rest are river islands too small to draw.
		return rings.reduce((best, ring) => (ring.length > best.length ? ring : best), []);
	});
}

/**
 * Rasterise the border into a per-row span mask.
 *
 * Scanline rather than point-in-polygon per cell: the grid holds ~1.3M samples and the ring
 * has 390 edges, so testing every cell against every edge is half a billion operations.
 * Because every grid row is a line of constant latitude, one crossing list per row does the
 * same job in a few hundred thousand.
 */
function buildMask(ring, width, height, latAt, lngAt) {
	const mask = new Uint8Array(width * height);

	for (let y = 0; y < height; y++) {
		const lat = latAt(y + 0.5);
		const crossings = [];

		for (let i = 0; i < ring.length; i++) {
			const [x1, y1] = ring[i];
			const [x2, y2] = ring[(i + 1) % ring.length];
			if (y1 === y2) continue;
			if (lat < Math.min(y1, y2) || lat >= Math.max(y1, y2)) continue;
			crossings.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
		}

		if (crossings.length < 2) continue;
		crossings.sort((a, b) => a - b);

		for (let c = 0; c + 1 < crossings.length; c += 2) {
			for (let x = 0; x < width; x++) {
				const lng = lngAt(x + 0.5);
				if (lng >= crossings[c] && lng <= crossings[c + 1]) mask[y * width + x] = 1;
			}
		}
	}

	return mask;
}

/* -------------------------------------------------------------------------- */
/* Marching squares                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Trace one elevation level, returning polylines in scene units.
 *
 * Segments are emitted per cell and then chained end to end, because a bag of loose
 * segments cannot be simplified — and unsimplified contours over a whole country are the
 * difference between a 60 KB file and a megabyte.
 */
function traceLevel(grid, mask, width, height, level, latAt, lngAt) {
	/** Key a shared endpoint so segments can be chained without an O(n²) search. */
	const key = (x, y) => `${Math.round(x * 4096)},${Math.round(y * 4096)}`;
	const segments = [];

	const interpolate = (xa, ya, va, xb, yb, vb) => {
		const t = (level - va) / (vb - va);
		return [xa + (xb - xa) * t, ya + (yb - ya) * t];
	};

	for (let y = 0; y < height - 1; y++) {
		for (let x = 0; x < width - 1; x++) {
			// A cell touching the border is skipped entirely, which clips the contours to
			// the country without a second clipping pass.
			if (
				!mask[y * width + x] ||
				!mask[y * width + x + 1] ||
				!mask[(y + 1) * width + x] ||
				!mask[(y + 1) * width + x + 1]
			) {
				continue;
			}

			const tl = grid[y * width + x];
			const tr = grid[y * width + x + 1];
			const br = grid[(y + 1) * width + x + 1];
			const bl = grid[(y + 1) * width + x];

			const code =
				(tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
			if (code === 0 || code === 15) continue;

			const top = () => interpolate(x, y, tl, x + 1, y, tr);
			const right = () => interpolate(x + 1, y, tr, x + 1, y + 1, br);
			const bottom = () => interpolate(x, y + 1, bl, x + 1, y + 1, br);
			const left = () => interpolate(x, y, tl, x, y + 1, bl);

			switch (code) {
				case 1: case 14: segments.push([left(), bottom()]); break;
				case 2: case 13: segments.push([bottom(), right()]); break;
				case 3: case 12: segments.push([left(), right()]); break;
				case 4: case 11: segments.push([top(), right()]); break;
				case 6: case 9: segments.push([top(), bottom()]); break;
				case 7: case 8: segments.push([left(), top()]); break;
				// Saddles: both diagonals cross. Splitting them the same way every time
				// keeps the two branches from joining into one wrong ring.
				case 5: segments.push([left(), top()], [bottom(), right()]); break;
				case 10: segments.push([left(), bottom()], [top(), right()]); break;
			}
		}
	}

	// Chain segments into polylines by shared endpoints.
	const starts = new Map();
	for (const segment of segments) {
		const k = key(segment[0][0], segment[0][1]);
		if (!starts.has(k)) starts.set(k, []);
		starts.get(k).push(segment);
	}

	const used = new Set();
	const polylines = [];

	for (const segment of segments) {
		if (used.has(segment)) continue;
		used.add(segment);

		const chain = [segment[0], segment[1]];
		let guard = 0;
		while (guard++ < 20000) {
			const next = (starts.get(key(chain[chain.length - 1][0], chain[chain.length - 1][1])) ?? []).find(
				(s) => !used.has(s)
			);
			if (!next) break;
			used.add(next);
			chain.push(next[1]);
		}

		if (chain.length < MIN_CONTOUR_POINTS) continue;

		// Grid space → geographic → scene units, then simplify in the space we draw in.
		const projected = chain.map(([gx, gy]) => {
			const { x, z } = projectCountry(latAt(gy), lngAt(gx));
			return [x, z];
		});
		const reduced = simplify(projected, CONTOUR_SIMPLIFY);
		if (reduced.length >= 2) polylines.push(reduced);
	}

	return polylines;
}

/* -------------------------------------------------------------------------- */
/* Streets                                                                    */
/* -------------------------------------------------------------------------- */

const CITY_BOX = `${CITY_BBOX.south},${CITY_BBOX.west},${CITY_BBOX.north},${CITY_BBOX.east}`;

/*
 * The cache key carries a digest of the query, not just the label.
 *
 * It used to be the label alone, which made the cache lie the moment `CITY_BBOX` changed: a
 * widened box would hit the file baked from the old narrow one, and the rebake would
 * silently reproduce the map it already had. Keying on the query means a changed extent
 * misses by construction.
 */
async function overpass(query, label) {
	const digest = createHash('sha256').update(query).digest('hex').slice(0, 8);
	const path = join(cacheDir, `${label}-${digest}.json`);
	try {
		const hit = JSON.parse(await readFile(path, 'utf8'));
		console.log(`  ${label}: ${hit.length} elements (cached)`);
		return hit;
	} catch {
		// Not cached — fetch below.
	}

	const body = new URLSearchParams({ data: query }).toString();

	for (let attempt = 0; attempt < 6; attempt++) {
		const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
		try {
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					accept: 'application/json',
					// Both endpoints reject an anonymous client, and Node's fetch sends no
					// User-Agent at all. Overpass asks automated callers to identify themselves.
					'user-agent': USER_AGENT
				},
				body,
				signal: AbortSignal.timeout(300_000)
			});
			const text = await res.text();
			if (!res.ok || !text.trimStart().startsWith('{')) {
				throw new Error(text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160));
			}
			const json = JSON.parse(text);
			console.log(`  ${label}: ${json.elements.length} elements (fetched)`);
			await mkdir(cacheDir, { recursive: true });
			await writeFile(path, JSON.stringify(json.elements));
			return json.elements;
		} catch (error) {
			const wait = 2 ** attempt * 2000;
			console.log(`  ${label}: attempt ${attempt + 1} failed (${error.message}); retrying in ${wait / 1000}s`);
			if (attempt === 5) throw new Error(`${label}: giving up after 6 attempts`, { cause: error });
			await new Promise((r) => setTimeout(r, wait));
		}
	}
	return [];
}

const clampCity = (points) =>
	points.map(([x, z]) => [
		Math.max(-CITY_HALF_WIDTH, Math.min(CITY_HALF_WIDTH, x)),
		Math.max(-CITY_HALF_DEPTH, Math.min(CITY_HALF_DEPTH, z))
	]);

/** Street classes, ordered so the renderer can weight them. */
const STREET_WEIGHT = {
	motorway: 3, trunk: 3, primary: 3,
	secondary: 2, tertiary: 2,
	residential: 1, unclassified: 1, living_street: 1
};

/** The classes that thin out with distance. Arterials are drawn to the edge of the box. */
const MINOR = new Set(['residential', 'unclassified', 'living_street']);

/**
 * A stable [0, 1) from an OSM way id.
 *
 * Stable is the point: the same id must survive, or not, across rebakes. Anything random
 * reshuffles which side streets exist every time the map is regenerated, and the diff
 * becomes unreadable.
 */
function hashUnit(id) {
	let h = 0x811c9dc5;
	const text = String(id);
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h / 0x100000000;
}

/**
 * Whether a side street is drawn, given where it sits.
 *
 * Inside the old downtown crop, all of them: that grid is the texture the city is recognised
 * by. Past it they thin out to nothing, because at this extent a complete residential
 * network prints as a grey wash rather than as streets — the same reason a paper map drops
 * side streets as its scale widens.
 *
 * The thinning is probabilistic rather than a hard radius on purpose. A clean circle where
 * side streets stop dead is the same tell as the severed rectangle `edgeFade` exists to
 * hide: it reads as a crop. Dissolved, it reads as a city petering out.
 */
function keepMinor(way, line) {
	if (!MINOR.has(way.tags?.highway)) return true;

	let x = 0;
	let z = 0;
	for (const [px, pz] of line) {
		x += px;
		z += pz;
	}
	const distance = Math.hypot(x / line.length, z / line.length);

	if (distance <= CITY_MINOR_RADIUS) return true;
	if (distance >= CITY_MINOR_FADE_END) return false;

	const t = (distance - CITY_MINOR_RADIUS) / (CITY_MINOR_FADE_END - CITY_MINOR_RADIUS);
	return hashUnit(way.id) > t;
}

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

async function buildCountry() {
	console.log('Country — Laos');

	const ring = await fetchLaosRing();
	const dem = await fetchHeightGrid({
		south: 13.9, west: 100.0, north: 22.55, east: 107.7
	});

	console.log('  smoothing…');
	const grid = smooth(dem.grid, dem.width, dem.height);

	console.log('  masking to the border…');
	const mask = buildMask(ring, dem.width, dem.height, dem.latAt, dem.lngAt);
	const covered = mask.reduce((n, v) => n + v, 0);
	console.log(`  mask covers ${((covered / mask.length) * 100).toFixed(1)}% of the grid`);

	let peak = 0;
	for (let i = 0; i < grid.length; i++) if (mask[i] && grid[i] > peak) peak = grid[i];
	console.log(`  highest masked sample: ${peak.toFixed(0)} m`);

	const counts = [];
	const levels = [];
	const coords = [];
	let traced = 0;

	for (let level = CONTOUR_MIN; level <= CONTOUR_MAX; level += CONTOUR_STEP) {
		const polylines = traceLevel(grid, mask, dem.width, dem.height, level, dem.latAt, dem.lngAt);
		traced += polylines.length;
		for (const line of polylines) {
			if (line.length > 65535) continue;
			counts.push(line.length);
			levels.push(level);
			for (const [x, z] of line) coords.push(x, z);
		}
		process.stdout.write(`  ${level} m: ${polylines.length} lines\r`);
	}
	console.log(`  ${traced} contour polylines across ${(CONTOUR_MAX - CONTOUR_MIN) / CONTOUR_STEP + 1} levels`);

	const border = clampNothing(ring.map(([lng, lat]) => {
		const { x, z } = projectCountry(lat, lng);
		return [x, z];
	}));

	const scale = Math.max(COUNTRY_HALF_WIDTH, COUNTRY_HALF_DEPTH) / 32000;
	const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v / scale)));

	const header = {
		version: 1,
		kind: 'country',
		attribution: 'Elevation: AWS Open Data Terrain Tiles · Border: Natural Earth',
		generated: new Date().toISOString().slice(0, 10),
		positionScale: scale,
		elevationUnitsPerMetre: COUNTRY_ELEVATION_UNITS_PER_METRE,
		contourMajorEvery: MAJOR_EVERY,
		contourRange: [CONTOUR_MIN, CONTOUR_MAX],
		peak: Math.round(peak),
		blocks: {}
	};

	return write('laos-terrain.bin', header, {
		counts: new Uint16Array(counts),
		levels: new Uint16Array(levels),
		coords: new Int16Array(coords.map(q)),
		border: new Int16Array(border.flat().map(q))
	});
}

/** The border ring needs no clamping; named so the intent is not mistaken for an omission. */
const clampNothing = (points) => points;

async function buildCity() {
	console.log('City — Greater Vientiane');

	const streets = await overpass(
		`[out:json][timeout:300];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)$"](${CITY_BOX});out geom;`,
		'streets'
	);
	const water = await overpass(
		`[out:json][timeout:300];(way["natural"="water"](${CITY_BOX});relation["natural"="water"](${CITY_BOX});way["waterway"="riverbank"](${CITY_BOX}););out geom;`,
		'water'
	);

	const counts = [];
	const weights = [];
	const coords = [];
	let thinned = 0;

	for (const way of streets) {
		if (!way.geometry) continue;
		const raw = way.geometry
			.filter(Boolean)
			.map((n) => {
				const { x, z } = projectCity(n.lat, n.lon);
				return [x, z];
			});
		if (raw.length < 2) continue;

		/*
		 * 9 m, not 3 m. The tolerance is a screen budget dressed as a distance: one pixel of
		 * this chart covers three times the ground it used to, so holding 3 m would only ship
		 * vertices no display can resolve.
		 */
		const line = simplify(clampCity(raw), 9 * CITY_UNITS_PER_METRE);
		if (line.length < 2 || line.length > 65535) continue;
		if (!keepMinor(way, line)) {
			thinned++;
			continue;
		}

		counts.push(line.length);
		weights.push(STREET_WEIGHT[way.tags?.highway] ?? 1);
		for (const [x, z] of line) coords.push(x, z);
	}

	// Water ships as outlines too: this map is line-work, so the Mekong is drawn as a bank
	// rather than filled.
	const waterCounts = [];
	const waterCoords = [];
	for (const element of water) {
		const rings =
			element.type === 'relation'
				? (element.members ?? []).filter((m) => m.role !== 'inner' && m.geometry).map((m) => m.geometry)
				: [element.geometry];

		for (const ring of rings) {
			if (!ring) continue;
			const raw = ring.filter(Boolean).map((n) => {
				const { x, z } = projectCity(n.lat, n.lon);
				return [x, z];
			});
			if (raw.length < 4) continue;
			const line = simplify(clampCity(raw), 18 * CITY_UNITS_PER_METRE);
			if (line.length < 3 || line.length > 65535) continue;
			waterCounts.push(line.length);
			for (const [x, z] of line) waterCoords.push(x, z);
		}
	}

	console.log(
		`  ${counts.length} streets · ${waterCounts.length} water outlines · ${thinned} side streets thinned`
	);

	const scale = Math.max(CITY_HALF_WIDTH, CITY_HALF_DEPTH) / 32000;
	const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v / scale)));

	const header = {
		version: 1,
		kind: 'city',
		attribution: '© OpenStreetMap contributors (ODbL)',
		generated: new Date().toISOString().slice(0, 10),
		positionScale: scale,
		bbox: CITY_BBOX,
		blocks: {}
	};

	return write('vientiane-streets.bin', header, {
		counts: new Uint16Array(counts),
		weights: new Uint8Array(weights),
		coords: new Int16Array(coords.map(q)),
		waterCounts: new Uint16Array(waterCounts),
		waterCoords: new Int16Array(waterCoords.map(q))
	});
}

async function main() {
	console.log('Baking the map…\n');
	const country = await buildCountry();
	console.log('');
	const city = await buildCity();

	const total = country + city;
	console.log(
		`\nCombined: ${(total / 1024).toFixed(0)} KB gzipped — budget 150 KB — ${total <= 150 * 1024 ? 'within' : 'OVER'}.`
	);
}

await main();
