/**
 * The Laos survey chart.
 *
 * A map that reads flat and cartographic when you look straight at it, and proves it is
 * three-dimensional the moment it moves: contours sit at their true elevations, network
 * arcs bow up off the surface, and every beacon throws a vertical column of light. A few
 * degrees of pointer-driven tilt is all it takes to reveal the depth — which is the whole
 * idea, and why the camera sits at a high angle behind a long lens rather than in the
 * three-quarter view a 3D scene usually wants.
 *
 * Nothing here is lit. There is no key light, no shadow map and no PBR material: every
 * object is emissive line-work whose colour comes straight from the design tokens, so the
 * renderer runs with tone mapping off and the palette is the only thing deciding how the
 * chart looks in each theme.
 *
 * Framework-free on purpose. The Svelte component owns mounting, lifecycle and data; this
 * file owns pixels — which is what lets the same scene serve the hero, the events board and
 * a single-venue locator without three copies of the rendering code.
 */
import {
	AdditiveBlending,
	BufferAttribute,
	BufferGeometry,
	Color,
	CylinderGeometry,
	DoubleSide,
	Group,
	InstancedBufferAttribute,
	InstancedMesh,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	MeshBasicMaterial,
	NoToneMapping,
	Object3D,
	PerspectiveCamera,
	PlaneGeometry,
	Raycaster,
	RingGeometry,
	SRGBColorSpace,
	Scene,
	ShaderMaterial,
	SphereGeometry,
	Vector2,
	Vector3,
	WebGLRenderer
} from 'three';
import {
	CITY_HALF_DEPTH,
	CITY_HALF_WIDTH,
	COUNTRY_HALF_DEPTH,
	COUNTRY_HALF_WIDTH,
	isInCity,
	projectCity,
	projectCountry
} from './projection.js';
import { HUB, PLACES } from './places';
import { readPalette } from './palette';
import type { CityData, CountryData } from './decode';

export type MapView = 'country' | 'city' | 'venue';

export interface MapBeacon {
	id: string;
	lat: number;
	lng: number;
	/** Past venues sit quiet; upcoming ones pulse. */
	past?: boolean;
	/** Shown on the projected label. */
	label?: string;
}

/** A label the HTML overlay should draw, in screen pixels. */
export interface MapLabel {
	id: string;
	kind: 'country' | 'place' | 'hub' | 'venue';
	text: string;
	textLo?: string;
	/** Screen position of the label anchor, in CSS pixels relative to the canvas. */
	x: number;
	y: number;
	/** False when behind the camera or culled for collision. */
	visible: boolean;
}

export interface MapSceneOptions {
	view: MapView;
	quality: 'full' | 'lite';
	reducedMotion: boolean;
	onBeaconSelect?: (id: string) => void;
	onBeaconHover?: (id: string | null) => void;
	/** Called every frame with the current label screen positions. */
	onLabels?: (labels: MapLabel[]) => void;
}

/**
 * Camera poses. The elevation is deliberately steep and the field of view narrow: together
 * they flatten perspective almost to an orthographic projection, so the chart reads as a
 * map rather than as a landscape seen from a hill.
 */
const POSES: Record<MapView, { azimuth: number; elevation: number; distance: number }> = {
	/*
	 * Laos stands 81 × 96 scene units north-up, and at this field of view its foreshortened
	 * depth needs most of the frame height — so the distance is set by the country's height,
	 * not its width. The width it leaves over is where the copy goes. Closer than this and
	 * the south, Pakse and the Bolaven, falls off the bottom of the hero, which is the one
	 * crop a Lao visitor would notice immediately.
	 */
	country: { azimuth: 0.16, elevation: 1.02, distance: 276 },
	/*
	 * Central Vientiane is ~48 × 50 units, and at this elevation its depth projects to more
	 * than the frame height allows from close in — which quietly cropped the southern
	 * venues off the board. This distance fits the whole modelled area, so every beacon the
	 * list mentions is actually on the map.
	 */
	city: { azimuth: 0.1, elevation: 1.06, distance: 142 },
	venue: { azimuth: 0.1, elevation: 0.98, distance: 26 }
};

/** How far the pointer may tilt the chart. Small — this is a map, not a turntable. */
const TILT_AZIMUTH = 0.16;
const TILT_ELEVATION = 0.13;

/** Height the label anchors float above their ground point, in scene units. */
const LABEL_HEIGHT: Record<MapView, number> = { country: 5.5, city: 3.4, venue: 1.6 };

export interface MapScene {
	loadCountry(data: CountryData): void;
	loadCity(data: CityData): void;
	setBeacons(beacons: MapBeacon[]): void;
	setActive(id: string | null): void;
	focus(lat: number, lng: number, immediate?: boolean): void;
	refreshPalette(): void;
	resize(): void;
	setRunning(running: boolean): void;
	dispose(): void;
}

export function createMapScene(canvas: HTMLCanvasElement, options: MapSceneOptions): MapScene {
	const { view, quality, reducedMotion } = options;
	const lite = quality === 'lite';
	const isCountry = view === 'country';

	let palette = readPalette();

	/* ---------------------------------------------------------------------- */
	/* Renderer                                                               */
	/* ---------------------------------------------------------------------- */

	const renderer = new WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
		powerPreference: 'high-performance'
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.25 : 2));
	renderer.outputColorSpace = SRGBColorSpace;
	// Emissive line-work, not a lit scene: tone mapping would only crush the accents.
	renderer.toneMapping = NoToneMapping;

	const scene = new Scene();
	// A long lens. At 20° the near and far edges of the chart are almost the same size,
	// which is what sells "map" over "landscape".
	const camera = new PerspectiveCamera(20, 1, 1, 900);

	const world = new Group();
	/*
	 * North is up, always.
	 *
	 * The chart was briefly rotated to lay Laos across the diagonal and fill a landscape
	 * frame better. That is a composition argument, and it loses to a stronger one: this is
	 * a map of someone's country, and people know its shape at one orientation. Tilting it
	 * made the country subtly unrecognisable to exactly the audience who would know. The
	 * dead air either side is composition's problem to solve, not the map's.
	 */
	scene.add(world);

	const halfWidth = isCountry ? COUNTRY_HALF_WIDTH : CITY_HALF_WIDTH;
	const halfDepth = isCountry ? COUNTRY_HALF_DEPTH : CITY_HALF_DEPTH;
	const project = isCountry ? projectCountry : projectCity;

	/* ---------------------------------------------------------------------- */
	/* Ground                                                                 */
	/* ---------------------------------------------------------------------- */

	const groundUniforms = {
		uColor: { value: palette.ground.clone() },
		uAccent: { value: palette.accent.clone() },
		uHub: { value: new Vector2(0, 0) },
		uRadius: { value: Math.max(halfWidth, halfDepth) },
		uDark: { value: palette.isDark ? 1 : 0 }
	};

	/**
	 * The chart's paper. A single radial falloff centred on the hub does two jobs: it lifts
	 * the middle of the map so the eye starts where the community is, and it lets the
	 * corners fall back toward the page so the plane has no visible edge to give away that
	 * it is a rectangle.
	 */
	const ground = new Mesh(
		new PlaneGeometry(halfWidth * 4, halfDepth * 4).rotateX(-Math.PI / 2),
		new ShaderMaterial({
			transparent: true,
			depthWrite: false,
			uniforms: groundUniforms,
			vertexShader: `
				varying vec2 vXZ;
				void main() {
					vXZ = position.xz;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}`,
			fragmentShader: `
				uniform vec3 uColor;
				uniform vec3 uAccent;
				uniform vec2 uHub;
				uniform float uRadius;
				uniform float uDark;
				varying vec2 vXZ;
				void main() {
					float d = distance(vXZ, uHub) / uRadius;
					float core = 1.0 - smoothstep(0.0, 1.35, d);
					vec3 color = mix(uColor, uColor + uAccent * 0.16, core * uDark);
					// Fades out before the plane's own edge, so the chart has no rectangle.
					float alpha = (1.0 - smoothstep(0.75, 1.6, d)) * mix(0.72, 0.9, uDark);
					gl_FragColor = vec4(color, alpha);
				}`
		})
	);
	ground.position.y = -0.02;
	world.add(ground);

	/* ---------------------------------------------------------------------- */
	/* Line layers                                                            */
	/* ---------------------------------------------------------------------- */

	const lineGroup = new Group();
	world.add(lineGroup);

	/** One draw call for every contour on the chart, coloured per vertex. */
	function buildLines(
		positions: Float32Array,
		colors: Float32Array,
		opacity: number
	): LineSegments {
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new BufferAttribute(positions, 3));
		geometry.setAttribute('color', new BufferAttribute(colors, 3));
		geometry.computeBoundingSphere();

		return new LineSegments(
			geometry,
			new LineBasicMaterial({
				vertexColors: true,
				transparent: true,
				opacity,
				depthWrite: false,
				blending: palette.lineBlending
			})
		);
	}

	/**
	 * How much of a line survives at a given point, 0 at the edge of the data.
	 *
	 * The street network stops dead at the bounding box it was queried with, and a hard
	 * rectangle of severed roads is the single most obvious sign that a map is a crop rather
	 * than a place. Fading the ink out before it reaches that edge turns the cut into a
	 * vignette. The country chart needs none of this: its data ends at a national border,
	 * which is a real edge worth drawing.
	 */
	const edgeFade = (x: number, z: number) => {
		if (isCountry) return 1;
		const d = Math.max(Math.abs(x) / halfWidth, Math.abs(z) / halfDepth);
		return 1 - Math.max(0, Math.min(1, (d - 0.62) / 0.38));
	};

	/** Walk quantised polylines, emitting one line segment per adjacent pair. */
	function polylinesToSegments(
		counts: Uint16Array,
		coords: Int16Array,
		scale: number,
		colorFor: (index: number) => Color,
		heightFor: (index: number) => number,
		closed = false
	) {
		let segments = 0;
		for (let i = 0; i < counts.length; i++) segments += counts[i] - (closed ? 0 : 1);

		const positions = new Float32Array(segments * 6);
		const colors = new Float32Array(segments * 6);
		const color = new Color();

		let cursor = 0;
		let v = 0;

		for (let i = 0; i < counts.length; i++) {
			const n = counts[i];
			const y = heightFor(i);
			color.copy(colorFor(i));

			const limit = closed ? n : n - 1;
			for (let j = 0; j < limit; j++) {
				const a = cursor + j * 2;
				const b = cursor + ((j + 1) % n) * 2;

				const ax = coords[a] * scale;
				const az = coords[a + 1] * scale;
				const bx = coords[b] * scale;
				const bz = coords[b + 1] * scale;

				positions[v] = ax;
				positions[v + 1] = y;
				positions[v + 2] = az;
				positions[v + 3] = bx;
				positions[v + 4] = y;
				positions[v + 5] = bz;

				// Per-vertex, so a road crossing the edge fades along its own length.
				const fa = edgeFade(ax, az);
				const fb = edgeFade(bx, bz);
				colors[v] = color.r * fa;
				colors[v + 1] = color.g * fa;
				colors[v + 2] = color.b * fa;
				colors[v + 3] = color.r * fb;
				colors[v + 4] = color.g * fb;
				colors[v + 5] = color.b * fb;
				v += 6;
			}
			cursor += n * 2;
		}

		return { positions, colors };
	}

	let contours: LineSegments | null = null;
	let border: LineSegments | null = null;
	let streets: LineSegments | null = null;
	let water: LineSegments | null = null;

	function loadCountry(data: CountryData) {
		const { positionScale, elevationUnitsPerMetre, contourMajorEvery, contourRange } = data.header;
		const [low, high] = contourRange;
		const gradient = new Color();

		const contourColor = (i: number) => {
			const level = data.levels[i];
			if (level % contourMajorEvery === 0) return palette.contourMajor;
			const t = (level - low) / Math.max(1, high - low);
			return gradient.copy(palette.contourLow).lerp(palette.contourHigh, t);
		};

		const built = polylinesToSegments(
			data.counts,
			data.coords,
			positionScale,
			contourColor,
			// True elevation, exaggerated once. This is the depth the tilt reveals.
			(i) => data.levels[i] * elevationUnitsPerMetre
		);
		contours = buildLines(built.positions, built.colors, palette.isDark ? 0.9 : 0.75);
		lineGroup.add(contours);

		/*
		 * Rewriting the colour buffer is what a theme flip costs here. It is one pass over
		 * a few hundred thousand floats — cheaper than rebuilding the geometry, and the
		 * only way vertex-coloured lines can follow the tokens.
		 */
		recolour = () => {
			if (!contours || !border) return;
			const colors = contours.geometry.getAttribute('color') as BufferAttribute;
			const array = colors.array as Float32Array;
			let v = 0;
			for (let i = 0; i < data.counts.length; i++) {
				const colour = contourColor(i);
				for (let j = 0; j < data.counts[i] - 1; j++) {
					array[v] = array[v + 3] = colour.r;
					array[v + 1] = array[v + 4] = colour.g;
					array[v + 2] = array[v + 5] = colour.b;
					v += 6;
				}
			}
			colors.needsUpdate = true;
			(contours.material as LineBasicMaterial).opacity = palette.isDark ? 0.9 : 0.75;

			const borderColors = border.geometry.getAttribute('color') as BufferAttribute;
			const borderArray = borderColors.array as Float32Array;
			for (let i = 0; i < borderArray.length; i += 3) {
				borderArray[i] = palette.border.r;
				borderArray[i + 1] = palette.border.g;
				borderArray[i + 2] = palette.border.b;
			}
			borderColors.needsUpdate = true;
		};

		// The border is a single closed ring; it ships as one flat coordinate list.
		const borderCounts = new Uint16Array([data.border.length / 2]);
		const borderBuilt = polylinesToSegments(
			borderCounts,
			data.border,
			positionScale,
			() => palette.border,
			() => 0.02,
			true
		);
		border = buildLines(borderBuilt.positions, borderBuilt.colors, 1);
		lineGroup.add(border);

		buildNetwork();
		rebuildLabelAnchors();
		rebuildLeaders();
		invalidate();
	}

	function loadCity(data: CityData) {
		const { positionScale } = data.header;

		const streetBuilt = polylinesToSegments(
			data.counts,
			data.coords,
			positionScale,
			(i) => palette.streets[Math.min(2, Math.max(0, data.weights[i] - 1))],
			() => 0
		);
		streets = buildLines(streetBuilt.positions, streetBuilt.colors, palette.isDark ? 0.95 : 0.8);
		lineGroup.add(streets);

		if (data.waterCounts.length > 0) {
			const waterBuilt = polylinesToSegments(
				data.waterCounts,
				data.waterCoords,
				positionScale,
				() => palette.water,
				() => 0.01,
				true
			);
			water = buildLines(waterBuilt.positions, waterBuilt.colors, 1);
			lineGroup.add(water);
		}

		/*
		 * Recolouring runs the same builder again and keeps only its colour buffer. Writing
		 * the colours by hand here was tried and immediately drifted: this path forgot the
		 * edge fade, so the first theme switch restored the hard rectangle the fade exists
		 * to hide. One function owns what a vertex's colour is.
		 */
		recolour = () => {
			if (!streets) return;
			const rebuilt = polylinesToSegments(
				data.counts,
				data.coords,
				positionScale,
				(i) => palette.streets[Math.min(2, Math.max(0, data.weights[i] - 1))],
				() => 0
			);
			const colors = streets.geometry.getAttribute('color') as BufferAttribute;
			(colors.array as Float32Array).set(rebuilt.colors);
			colors.needsUpdate = true;
			(streets.material as LineBasicMaterial).opacity = palette.isDark ? 0.95 : 0.8;

			if (water) {
				const rebuiltWater = polylinesToSegments(
					data.waterCounts,
					data.waterCoords,
					positionScale,
					() => palette.water,
					() => 0.01,
					true
				);
				const waterColors = water.geometry.getAttribute('color') as BufferAttribute;
				(waterColors.array as Float32Array).set(rebuiltWater.colors);
				waterColors.needsUpdate = true;
			}
		};

		rebuildLabelAnchors();
		rebuildLeaders();
		invalidate();
	}

	/* ---------------------------------------------------------------------- */
	/* Network arcs                                                           */
	/* ---------------------------------------------------------------------- */

	const arcGroup = new Group();
	world.add(arcGroup);

	const arcUniforms = {
		uTime: { value: 0 },
		uColor: { value: palette.accentGlow.clone() },
		uIdle: { value: palette.accentMuted.clone() }
	};

	/**
	 * One quadratic bézier per spoke city, bowed into the air.
	 *
	 * The bow is what makes the network read as infrastructure rather than as lines drawn on
	 * the paper, and it is the second thing the tilt reveals after the contour stack. A
	 * pulse travels each arc on its own phase so the chart never looks synchronised.
	 */
	function buildNetwork() {
		const hub = project(HUB.lat, HUB.lng);
		const spokes = PLACES.filter((place) => place.role === 'spoke');

		const SEGMENTS = 48;
		const positions = new Float32Array(spokes.length * SEGMENTS * 2 * 3);
		const along = new Float32Array(spokes.length * SEGMENTS * 2);
		const phase = new Float32Array(spokes.length * SEGMENTS * 2);

		let v = 0;
		let s = 0;

		spokes.forEach((place, index) => {
			const end = project(place.lat, place.lng);
			const span = Math.hypot(end.x - hub.x, end.z - hub.z);
			// Longer hops arc higher, the way a great circle does on a globe.
			const lift = Math.min(18, 4 + span * 0.34);
			const mid = new Vector3((hub.x + end.x) / 2, lift, (hub.z + end.z) / 2);
			const from = new Vector3(hub.x, 0.1, hub.z);
			const to = new Vector3(end.x, 0.1, end.z);
			const point = new Vector3();
			const previous = new Vector3();
			const offset = index / spokes.length;

			for (let i = 0; i <= SEGMENTS; i++) {
				const t = i / SEGMENTS;
				const inv = 1 - t;
				point.set(
					inv * inv * from.x + 2 * inv * t * mid.x + t * t * to.x,
					inv * inv * from.y + 2 * inv * t * mid.y + t * t * to.y,
					inv * inv * from.z + 2 * inv * t * mid.z + t * t * to.z
				);

				if (i > 0) {
					positions[v] = previous.x;
					positions[v + 1] = previous.y;
					positions[v + 2] = previous.z;
					positions[v + 3] = point.x;
					positions[v + 4] = point.y;
					positions[v + 5] = point.z;
					along[s] = (i - 1) / SEGMENTS;
					along[s + 1] = t;
					phase[s] = phase[s + 1] = offset;
					v += 6;
					s += 2;
				}
				previous.copy(point);
			}
		});

		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new BufferAttribute(positions, 3));
		geometry.setAttribute('aAlong', new BufferAttribute(along, 1));
		geometry.setAttribute('aPhase', new BufferAttribute(phase, 1));
		geometry.computeBoundingSphere();

		arcGroup.add(
			new LineSegments(
				geometry,
				new ShaderMaterial({
					transparent: true,
					depthWrite: false,
					blending: palette.lineBlending,
					uniforms: arcUniforms,
					vertexShader: `
						attribute float aAlong;
						attribute float aPhase;
						varying float vAlong;
						varying float vPhase;
						void main() {
							vAlong = aAlong;
							vPhase = aPhase;
							gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
						}`,
					fragmentShader: `
						uniform float uTime;
						uniform vec3 uColor;
						uniform vec3 uIdle;
						varying float vAlong;
						varying float vPhase;
						void main() {
							// The resting line, faded at both ends so it grows out of the node.
							float base = 0.42 * smoothstep(0.0, 0.12, vAlong) * smoothstep(1.0, 0.88, vAlong);
							// A packet running hub → city.
							float head = fract(uTime * 0.16 + vPhase);
							float pulse = smoothstep(0.055, 0.0, abs(vAlong - head));
							vec3 color = mix(uIdle, uColor, pulse);
							gl_FragColor = vec4(color, base + pulse * 0.85);
						}`
				})
			)
		);
	}

	/* ---------------------------------------------------------------------- */
	/* Beacons                                                                */
	/* ---------------------------------------------------------------------- */

	const beaconGroup = new Group();
	world.add(beaconGroup);

	const beaconUniforms = {
		uTime: { value: 0 },
		uColor: { value: palette.accentGlow.clone() }
	};

	/** Three rings per beacon, offset in phase so one is always expanding. */
	const RINGS_PER_BEACON = 3;
	const ringGeometry = new RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
	const columnGeometry = new CylinderGeometry(1, 1, 1, 14, 1, true);
	const hitGeometry = new SphereGeometry(1, 8, 6);
	const hitMaterial = new MeshBasicMaterial();
	// Not rendered, still raycast: Mesh.raycast never consults material.visible.
	hitMaterial.visible = false;

	/**
	 * The radar return.
	 *
	 * The expansion happens in object space, *before* the instance matrix is applied, so
	 * each ring grows around its own venue rather than around the world origin. Three rings
	 * share every beacon on staggered phases, which is what makes the pulse continuous
	 * instead of a single ring blinking.
	 */
	const ringMaterial = new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		side: DoubleSide,
		blending: AdditiveBlending,
		uniforms: beaconUniforms,
		vertexShader: `
			uniform float uTime;
			attribute float aPhase;
			attribute float aQuiet;
			varying float vFade;
			varying float vQuiet;
			void main() {
				float t = fract(uTime * 0.32 + aPhase);
				vFade = (1.0 - t) * (1.0 - t);
				vQuiet = aQuiet;
				vec4 local = instanceMatrix * vec4(position * mix(0.25, 1.0, t), 1.0);
				gl_Position = projectionMatrix * modelViewMatrix * local;
			}`,
		fragmentShader: `
			uniform vec3 uColor;
			varying float vFade;
			varying float vQuiet;
			void main() {
				gl_FragColor = vec4(uColor, vFade * mix(0.85, 0.16, vQuiet));
			}`
	});

	/** A shaft of light standing on the venue — the clearest depth cue when the map tilts. */
	const columnMaterial = new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		side: DoubleSide,
		blending: AdditiveBlending,
		uniforms: beaconUniforms,
		vertexShader: `
			attribute float aQuiet;
			varying float vY;
			varying float vQuiet;
			void main() {
				vY = uv.y;
				vQuiet = aQuiet;
				gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: `
			uniform vec3 uColor;
			varying float vY;
			varying float vQuiet;
			void main() {
				// Bright at the base, gone by the top.
				float a = pow(1.0 - vY, 2.2) * mix(0.5, 0.12, vQuiet);
				gl_FragColor = vec4(uColor, a);
			}`
	});

	let beacons: MapBeacon[] = [];
	let ringMesh: InstancedMesh | null = null;
	let columnMesh: InstancedMesh | null = null;
	let hitMesh: InstancedMesh | null = null;
	let activeId: string | null = null;
	let hoveredIndex = -1;

	const dummy = new Object3D();
	/** Beacon footprint and column height per view, so markers stay frame-sized. */
	const beaconScale = () => (isCountry ? 3.4 : view === 'city' ? 2.1 : 0.9);

	function setBeacons(next: MapBeacon[]) {
		const inRange = isCountry ? () => true : (b: MapBeacon) => isInCity(b.lat, b.lng);
		beacons = next.filter(inRange);

		for (const mesh of [ringMesh, columnMesh, hitMesh]) {
			if (mesh) {
				beaconGroup.remove(mesh);
				mesh.dispose();
			}
		}
		ringMesh = columnMesh = hitMesh = null;
		if (beacons.length === 0) {
			invalidate();
			return;
		}

		const radius = beaconScale();
		const ringCount = beacons.length * RINGS_PER_BEACON;

		ringMesh = new InstancedMesh(ringGeometry, ringMaterial, ringCount);
		columnMesh = new InstancedMesh(columnGeometry, columnMaterial, beacons.length);
		hitMesh = new InstancedMesh(hitGeometry, hitMaterial, beacons.length);
		for (const mesh of [ringMesh, columnMesh, hitMesh]) mesh.frustumCulled = false;

		const ringPhase = new Float32Array(ringCount);
		const ringQuiet = new Float32Array(ringCount);
		const columnQuiet = new Float32Array(beacons.length);

		beacons.forEach((beacon, i) => {
			const { x, z } = project(beacon.lat, beacon.lng);
			const quiet = beacon.past ? 1 : 0;

			for (let r = 0; r < RINGS_PER_BEACON; r++) {
				const index = i * RINGS_PER_BEACON + r;
				dummy.position.set(x, 0.05, z);
				dummy.scale.setScalar(radius * (beacon.past ? 0.6 : 1));
				dummy.rotation.set(0, 0, 0);
				dummy.updateMatrix();
				ringMesh!.setMatrixAt(index, dummy.matrix);
				ringPhase[index] = r / RINGS_PER_BEACON;
				ringQuiet[index] = quiet;
			}

			const height = radius * (beacon.past ? 1.1 : 2.6);
			dummy.position.set(x, height / 2, z);
			dummy.scale.set(radius * 0.09, height, radius * 0.09);
			dummy.updateMatrix();
			columnMesh!.setMatrixAt(i, dummy.matrix);
			columnQuiet[i] = quiet;

			// A generous invisible target: a light column is a hard thing to tap.
			dummy.position.set(x, height * 0.4, z);
			dummy.scale.setScalar(radius * 1.5);
			dummy.updateMatrix();
			hitMesh!.setMatrixAt(i, dummy.matrix);
		});

		ringMesh.geometry.setAttribute('aPhase', new InstancedBufferAttribute(ringPhase, 1));
		ringMesh.geometry.setAttribute('aQuiet', new InstancedBufferAttribute(ringQuiet, 1));
		columnMesh.geometry.setAttribute('aQuiet', new InstancedBufferAttribute(columnQuiet, 1));

		beaconGroup.add(ringMesh, columnMesh, hitMesh);
		invalidate();
	}

	function setActive(id: string | null) {
		if (activeId === id) return;
		activeId = id;
		invalidate();
	}

	/* ---------------------------------------------------------------------- */
	/* Sweep                                                                  */
	/* ---------------------------------------------------------------------- */

	const sweepUniforms = {
		uTime: { value: 0 },
		uColor: { value: palette.accent.clone() }
	};

	/** A slow radar pass over the chart. Purely atmospheric; it reads nothing and hides nothing. */
	const sweep = new Mesh(
		new PlaneGeometry(halfWidth * 3.4, halfDepth * 3.4).rotateX(-Math.PI / 2),
		new ShaderMaterial({
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			uniforms: sweepUniforms,
			vertexShader: `
				varying vec2 vXZ;
				void main() {
					vXZ = position.xz;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}`,
			fragmentShader: `
				uniform float uTime;
				uniform vec3 uColor;
				varying vec2 vXZ;
				void main() {
					float angle = atan(vXZ.y, vXZ.x);
					float head = mod(uTime * 0.12, 6.2831853) - 3.1415927;
					float delta = mod(angle - head + 9.4247780, 6.2831853) - 3.1415927;
					/*
					 * A narrow wedge trailing the leading edge. Wide was tried and read as a
					 * lens flare laid across the map rather than as something sweeping over
					 * it — a sweep is legible by its edge, not by its area.
					 */
					float wedge = smoothstep(-0.30, 0.0, delta) * step(delta, 0.0);
					float radial = 1.0 - smoothstep(0.0, 1.0, length(vXZ) / ${(Math.max(halfWidth, halfDepth) * 1.3).toFixed(2)});
					gl_FragColor = vec4(uColor, wedge * radial * 0.05);
				}`
		})
	);
	sweep.position.y = 0.01;
	if (!reducedMotion) world.add(sweep);

	/* ---------------------------------------------------------------------- */
	/* Labels                                                                 */
	/* ---------------------------------------------------------------------- */

	const labelAnchors: Array<{ id: string; kind: MapLabel['kind']; text: string; textLo?: string; point: Vector3 }> = [];
	const labelOut: MapLabel[] = [];
	const projected = new Vector3();

	function rebuildLabelAnchors() {
		labelAnchors.length = 0;
		const height = LABEL_HEIGHT[view];

		if (isCountry) {
			for (const place of PLACES) {
				const { x, z } = project(place.lat, place.lng);
				labelAnchors.push({
					id: `place:${place.name}`,
					kind: place.role === 'hub' ? 'hub' : 'place',
					text: place.name,
					textLo: place.nameLo,
					point: new Vector3(x, place.role === 'hub' ? height : height * 0.55, z)
				});
			}
		}

		for (const beacon of beacons) {
			if (!beacon.label) continue;
			// On the country chart Vientiane already carries a label; venue names there
			// would stack on top of it.
			if (isCountry) continue;
			const { x, z } = project(beacon.lat, beacon.lng);
			labelAnchors.push({
				id: `venue:${beacon.id}`,
				kind: 'venue',
				text: beacon.label,
				point: new Vector3(x, height, z)
			});
		}
	}

	/** Leader lines: a hairline from the ground point up to where the label floats. */
	let leaders: LineSegments | null = null;

	function rebuildLeaders() {
		if (leaders) {
			lineGroup.remove(leaders);
			leaders.geometry.dispose();
			(leaders.material as LineBasicMaterial).dispose();
			leaders = null;
		}
		if (labelAnchors.length === 0) return;

		const positions = new Float32Array(labelAnchors.length * 6);
		const colors = new Float32Array(labelAnchors.length * 6);
		const color = new Color();

		labelAnchors.forEach((anchor, i) => {
			color.copy(anchor.kind === 'hub' || anchor.kind === 'venue' ? palette.accent : palette.contourHigh);
			const v = i * 6;
			positions[v] = positions[v + 3] = anchor.point.x;
			positions[v + 1] = 0;
			positions[v + 2] = positions[v + 5] = anchor.point.z;
			positions[v + 4] = anchor.point.y;
			colors[v] = colors[v + 3] = color.r;
			colors[v + 1] = colors[v + 4] = color.g;
			colors[v + 2] = colors[v + 5] = color.b;
		});

		leaders = buildLines(positions, colors, palette.isDark ? 0.55 : 0.4);
		lineGroup.add(leaders);
	}

	function emitLabels() {
		if (!options.onLabels) return;
		const width = canvas.clientWidth || 1;
		const height = canvas.clientHeight || 1;
		labelOut.length = 0;

		/*
		 * Below tablet width the chart keeps only the labels that carry the story — the hub
		 * and the venues. Seven place names on a 390 px frame overlap each other and the
		 * headline, and thinning the annotation as the scale drops is what a real map does
		 * rather than a compromise.
		 */
		const compact = width < 640;

		for (const anchor of labelAnchors) {
			if (compact && anchor.kind === 'place') continue;
			projected.copy(anchor.point).applyMatrix4(world.matrixWorld).project(camera);
			labelOut.push({
				id: anchor.id,
				kind: anchor.kind,
				text: anchor.text,
				textLo: anchor.textLo,
				x: (projected.x * 0.5 + 0.5) * width,
				y: (-projected.y * 0.5 + 0.5) * height,
				visible: projected.z < 1 && Math.abs(projected.x) < 1.15 && Math.abs(projected.y) < 1.15
			});
		}

		options.onLabels(labelOut);
	}

	/* ---------------------------------------------------------------------- */
	/* Camera                                                                 */
	/* ---------------------------------------------------------------------- */

	const pose = { ...POSES[view] };
	const current = { ...pose };
	const target = { ...pose };
	const currentTarget = new Vector3(0, 0, 0);
	const desiredTarget = new Vector3(0, 0, 0);

	const pointer = new Vector2(0, 0);
	const pointerTarget = new Vector2(0, 0);

	function focus(lat: number, lng: number, immediate = false) {
		const { x, z } = project(lat, lng);
		desiredTarget.set(x, 0, z);
		if (immediate) currentTarget.copy(desiredTarget);
		invalidate();
	}

	function placeCamera() {
		const sway = reducedMotion ? 0 : 1;
		const azimuth = current.azimuth + pointer.x * TILT_AZIMUTH * sway;
		const elevation = Math.max(
			0.35,
			Math.min(1.45, current.elevation - pointer.y * TILT_ELEVATION * sway)
		);

		camera.position.set(
			currentTarget.x + Math.sin(azimuth) * Math.cos(elevation) * current.distance,
			currentTarget.y + Math.sin(elevation) * current.distance,
			currentTarget.z + Math.cos(azimuth) * Math.cos(elevation) * current.distance
		);
		camera.lookAt(currentTarget);
	}

	/* ---------------------------------------------------------------------- */
	/* Interaction                                                            */
	/* ---------------------------------------------------------------------- */

	const raycaster = new Raycaster();
	const ndc = new Vector2();

	function pickAt(clientX: number, clientY: number): number {
		if (!hitMesh) return -1;
		const rect = canvas.getBoundingClientRect();
		ndc.set(
			((clientX - rect.left) / rect.width) * 2 - 1,
			-((clientY - rect.top) / rect.height) * 2 + 1
		);
		raycaster.setFromCamera(ndc, camera);
		const hits = raycaster.intersectObject(hitMesh, false);
		return hits.length > 0 && hits[0].instanceId !== undefined ? hits[0].instanceId : -1;
	}

	function onPointerMove(event: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		pointerTarget.set(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			((event.clientY - rect.top) / rect.height) * 2 - 1
		);

		if (event.pointerType === 'mouse') {
			const index = pickAt(event.clientX, event.clientY);
			if (index !== hoveredIndex) {
				hoveredIndex = index;
				canvas.style.cursor = index >= 0 ? 'pointer' : '';
				options.onBeaconHover?.(index >= 0 ? beacons[index].id : null);
				invalidate();
			}
		}
		if (!reducedMotion) invalidate();
	}

	function onPointerLeave() {
		pointerTarget.set(0, 0);
		if (hoveredIndex !== -1) {
			hoveredIndex = -1;
			canvas.style.cursor = '';
			options.onBeaconHover?.(null);
		}
		invalidate();
	}

	function onClick(event: MouseEvent) {
		const index = pickAt(event.clientX, event.clientY);
		if (index >= 0) options.onBeaconSelect?.(beacons[index].id);
	}

	canvas.addEventListener('pointermove', onPointerMove, { passive: true });
	canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
	canvas.addEventListener('click', onClick);

	/* ---------------------------------------------------------------------- */
	/* Theme                                                                  */
	/* ---------------------------------------------------------------------- */

	/**
	 * Re-reads the tokens and rebuilds what cannot be recoloured in place.
	 *
	 * Contour and street colours live in vertex buffers, so a theme flip has to rewrite
	 * them; uniforms and material colours are just assigned. The line-work also swaps
	 * blending mode, because additive means "glow" on a dark ground and "invisible" on a
	 * light one.
	 */
	function refreshPalette() {
		palette = readPalette();

		groundUniforms.uColor.value.copy(palette.ground);
		groundUniforms.uAccent.value.copy(palette.accent);
		groundUniforms.uDark.value = palette.isDark ? 1 : 0;
		arcUniforms.uColor.value.copy(palette.accentGlow);
		arcUniforms.uIdle.value.copy(palette.accentMuted);
		beaconUniforms.uColor.value.copy(palette.accentGlow);
		sweepUniforms.uColor.value.copy(palette.accent);

		for (const object of [contours, border, streets, water, leaders]) {
			if (!object) continue;
			const material = object.material as LineBasicMaterial;
			material.blending = palette.lineBlending;
			material.needsUpdate = true;
		}
		for (const material of arcGroup.children.map((c) => (c as LineSegments).material as ShaderMaterial)) {
			material.blending = palette.lineBlending;
			material.needsUpdate = true;
		}

		// Contour, street and leader colours live in vertex buffers, so they are rewritten
		// rather than reassigned.
		recolour();
		invalidate();
	}

	/** Set by the loaders so a theme flip can rewrite the vertex colours it baked. */
	let recolour: () => void = () => {};

	/* ---------------------------------------------------------------------- */
	/* Loop                                                                   */
	/* ---------------------------------------------------------------------- */

	let running = false;
	let frame = 0;
	let last = performance.now();

	/** Requests one more frame. Under reduced motion the loop only wakes on these. */
	function invalidate() {
		if (reducedMotion && running && frame === 0) frame = requestAnimationFrame(tick);
	}

	function tick(now: number) {
		frame = reducedMotion ? 0 : requestAnimationFrame(tick);

		// Clamp: a tab restored after a minute must not integrate a minute of motion.
		const dt = Math.min((now - last) / 1000, 1 / 30);
		last = now;
		const elapsed = now / 1000;

		// Exponential smoothing — frame-rate independent, unlike a fixed lerp factor.
		const ease = reducedMotion ? 1 : 1 - Math.exp(-5 * dt);
		pointer.lerp(pointerTarget, ease);
		current.azimuth += (target.azimuth - current.azimuth) * ease;
		current.elevation += (target.elevation - current.elevation) * ease;
		current.distance += (target.distance - current.distance) * ease;
		currentTarget.lerp(desiredTarget, ease);

		arcUniforms.uTime.value = elapsed;
		beaconUniforms.uTime.value = elapsed;
		sweepUniforms.uTime.value = elapsed;

		placeCamera();
		world.updateMatrixWorld();
		renderer.render(scene, camera);
		emitLabels();
	}

	function setRunning(next: boolean) {
		if (next === running) return;
		running = next;
		if (running) {
			last = performance.now();
			frame = requestAnimationFrame(tick);
		} else if (frame) {
			cancelAnimationFrame(frame);
			frame = 0;
		}
	}

	function resize() {
		const width = canvas.clientWidth || 1;
		const height = canvas.clientHeight || 1;
		renderer.setSize(width, height, false);
		camera.aspect = width / height;

		/*
		 * A portrait frame sees a narrower slice, so the camera retreats. The country chart
		 * is allowed to retreat furthest because losing the shape of Laos costs more than
		 * the extra distance does; the venue view never retreats at all.
		 */
		const wide = camera.aspect >= 1.3;
		const cap = view === 'venue' ? 1 : isCountry && !wide ? 1.5 : 1.75;
		const pullback = Math.min(cap, Math.max(1, 1.5 / camera.aspect));
		target.distance = pose.distance * pullback;

		if (isCountry) {
			/*
			 * On a wide screen the copy owns the left of the hero, so the country is aimed
			 * past it — which pushes the chart into the right of the frame and takes its
			 * labels out from under the headline.
			 */
			desiredTarget.x = wide ? -30 : 0;
			// Aimed a little south of centre, which lifts the country in frame so Pakse and
			// the southern tip clear the bottom edge rather than running off it.
			desiredTarget.z = 2;
			/*
			 * On a phone the copy is full-bleed across the top, so the chart is aimed above
			 * the ground plane to drop it into the lower half of the hero. It is kept small
			 * because aiming high also pushes the ground further from the camera, and every
			 * unit here costs scale.
			 */
			desiredTarget.y = wide ? 0 : 44;
			if (!running) currentTarget.copy(desiredTarget);
		}

		if (!running) current.distance = target.distance;

		camera.updateProjectionMatrix();
		placeCamera();
		world.updateMatrixWorld();
		renderer.render(scene, camera);
		emitLabels();
	}

	function dispose() {
		setRunning(false);
		canvas.removeEventListener('pointermove', onPointerMove);
		canvas.removeEventListener('pointerleave', onPointerLeave);
		canvas.removeEventListener('click', onClick);

		scene.traverse((object) => {
			const mesh = object as Mesh;
			if (mesh.geometry) mesh.geometry.dispose();
			const material = mesh.material;
			if (Array.isArray(material)) material.forEach((m) => m.dispose());
			else if (material) material.dispose();
		});
		ringGeometry.dispose();
		columnGeometry.dispose();
		hitGeometry.dispose();
		renderer.dispose();
		renderer.forceContextLoss();
	}

	resize();

	return {
		loadCountry,
		loadCity,
		setBeacons(next) {
			setBeacons(next);
			rebuildLabelAnchors();
			rebuildLeaders();
			invalidate();
		},
		setActive,
		focus,
		refreshPalette,
		resize,
		setRunning,
		dispose
	};
}
