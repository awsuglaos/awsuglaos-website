/**
 * The one place latitude and longitude become scene coordinates.
 *
 * Imported by *both* sides of the map: `scripts/bake-map.mjs` runs it in Node to place
 * contours, the border and the street network, and the browser runs it to place beacons
 * from `events.location_lat` / `location_lng`. A second implementation would let a pin
 * drift off its venue, so there deliberately is not one.
 *
 * There are two scales. The hero draws the whole country; the events and venue views draw
 * central Vientiane. They are separate projections rather than one zoomed projection
 * because a single tangent plane spanning 950 km and resolving individual streets would
 * spend all its float precision on the wrong end of the problem.
 *
 * Plain JS with JSDoc rather than TypeScript because Node imports it directly from a build
 * script while the app type-checks it under `checkJs`.
 */

const EARTH_RADIUS_M = 6378137;
const DEG_TO_RAD = Math.PI / 180;

/* -------------------------------------------------------------------------- */
/* Country scale — the hero                                                   */
/* -------------------------------------------------------------------------- */

/** Laos, from the Natural Earth admin-0 boundary, with a little air around it. */
export const COUNTRY_BBOX = Object.freeze({
	south: 13.9,
	west: 100.0,
	north: 22.55,
	east: 107.7
});

export const COUNTRY_ORIGIN_LAT = (COUNTRY_BBOX.south + COUNTRY_BBOX.north) / 2;
export const COUNTRY_ORIGIN_LNG = (COUNTRY_BBOX.west + COUNTRY_BBOX.east) / 2;

/** 1 scene unit = 10 km. Laos lands at roughly 96 × 80 units. */
export const COUNTRY_UNITS_PER_METRE = 1e-4;

/**
 * Vertical scale for the country view, ~14× the horizontal.
 *
 * At true scale Laos's highest point, Phou Bia at 2,819 m, is 0.28 units tall on a
 * 96-unit-wide map — flat enough that tilting the chart would reveal nothing at all. The
 * exaggeration is what makes the contour stack visible when the map moves, and it is a
 * single multiplier so every relative height stays honest.
 */
export const COUNTRY_ELEVATION_UNITS_PER_METRE = 0.0014;

const COUNTRY_M_PER_DEG_LAT = EARTH_RADIUS_M * DEG_TO_RAD;
const COUNTRY_M_PER_DEG_LNG =
	EARTH_RADIUS_M * DEG_TO_RAD * Math.cos(COUNTRY_ORIGIN_LAT * DEG_TO_RAD);

/**
 * Project a WGS84 coordinate onto the country plane.
 *
 * Three.js is Y-up, so the ground is XZ: east is +X and north is −Z, which puts a camera
 * on +Z looking north — the orientation a map is read in.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {{ x: number, z: number }}
 */
export function projectCountry(lat, lng) {
	return {
		x: (lng - COUNTRY_ORIGIN_LNG) * COUNTRY_M_PER_DEG_LNG * COUNTRY_UNITS_PER_METRE,
		z: -(lat - COUNTRY_ORIGIN_LAT) * COUNTRY_M_PER_DEG_LAT * COUNTRY_UNITS_PER_METRE
	};
}

export const COUNTRY_HALF_WIDTH =
	((COUNTRY_BBOX.east - COUNTRY_BBOX.west) / 2) * COUNTRY_M_PER_DEG_LNG * COUNTRY_UNITS_PER_METRE;
export const COUNTRY_HALF_DEPTH =
	((COUNTRY_BBOX.north - COUNTRY_BBOX.south) / 2) * COUNTRY_M_PER_DEG_LAT * COUNTRY_UNITS_PER_METRE;

/* -------------------------------------------------------------------------- */
/* City scale — the events board and the venue locator                        */
/* -------------------------------------------------------------------------- */

/**
 * Greater Vientiane: the Mekong bend, the downtown grid, Patuxai, Pha That Luang, the
 * National University campus at Dongdok, the road out to Thadeua, and the venues this group
 * actually meets at — the National Convention Centre and Toh-Lao Coworking among them.
 *
 * This box was tripled from the original ~4.8 × 5.1 km downtown crop. That crop was drawn
 * around the venues of the group's first years, and the city outgrew it: meetups moved to
 * campuses and offices past the old ring, and those events were silently losing their
 * beacon. The rule that produced the widening is the one worth keeping — the extent follows
 * where the group actually meets, not the other way round.
 *
 * Venues outside this box are still not faked: they get no beacon, and the event page falls
 * back to the map embed.
 */
export const CITY_BBOX = Object.freeze({
	south: 17.8945,
	west: 102.552,
	north: 18.031,
	east: 102.6885
});

export const CITY_ORIGIN_LAT = (CITY_BBOX.south + CITY_BBOX.north) / 2;
export const CITY_ORIGIN_LNG = (CITY_BBOX.west + CITY_BBOX.east) / 2;

/** 1 scene unit = 100 m. Greater Vientiane lands at roughly 145 × 152 units. */
export const CITY_UNITS_PER_METRE = 0.01;

const CITY_M_PER_DEG_LAT = EARTH_RADIUS_M * DEG_TO_RAD;
const CITY_M_PER_DEG_LNG = EARTH_RADIUS_M * DEG_TO_RAD * Math.cos(CITY_ORIGIN_LAT * DEG_TO_RAD);

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {{ x: number, z: number }}
 */
export function projectCity(lat, lng) {
	return {
		x: (lng - CITY_ORIGIN_LNG) * CITY_M_PER_DEG_LNG * CITY_UNITS_PER_METRE,
		z: -(lat - CITY_ORIGIN_LAT) * CITY_M_PER_DEG_LAT * CITY_UNITS_PER_METRE
	};
}

export const CITY_HALF_WIDTH =
	((CITY_BBOX.east - CITY_BBOX.west) / 2) * CITY_M_PER_DEG_LNG * CITY_UNITS_PER_METRE;
export const CITY_HALF_DEPTH =
	((CITY_BBOX.north - CITY_BBOX.south) / 2) * CITY_M_PER_DEG_LAT * CITY_UNITS_PER_METRE;

/**
 * Where side streets stop being drawn.
 *
 * The chart covers three times the ground it used to at the same size on screen, so every
 * residential lane in it would print as a grey wash rather than a grid — the same reason a
 * paper map drops side streets as its scale widens. Arterials are drawn everywhere;
 * residential roads are drawn in full inside this radius, which is roughly the old downtown
 * crop, and thin out over the band beyond it. See `bake-map.mjs`.
 */
export const CITY_MINOR_RADIUS = CITY_HALF_WIDTH / 3;

/** Where the last side street goes. Past this the chart is arterials and water only. */
export const CITY_MINOR_FADE_END = CITY_HALF_WIDTH * 0.72;

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Whether a coordinate falls inside a bounding box.
 * @param {{south:number,west:number,north:number,east:number}} bbox
 * @param {number} lat
 * @param {number} lng
 */
export function isInside(bbox, lat, lng) {
	return lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east;
}

/** @param {number} lat @param {number} lng */
export const isInCity = (lat, lng) => isInside(CITY_BBOX, lat, lng);

/** @param {number} lat @param {number} lng */
export const isInCountry = (lat, lng) => isInside(COUNTRY_BBOX, lat, lng);
