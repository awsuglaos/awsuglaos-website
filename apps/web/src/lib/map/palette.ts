/**
 * Bridges the design tokens into the map.
 *
 * DESIGN.md's standing rule is "never write a raw colour" — theme.css is the single source
 * of truth and `dark:` overrides are banned because the tokens already switch. A WebGL
 * scene is the easiest place in a codebase to quietly break that, so every colour here is
 * derived from the same custom properties the stylesheet uses.
 *
 * The tokens are authored in OKLCH, which THREE.Color cannot parse. The conversion is done
 * in full — OKLCH → OKLab → linear sRGB, handed to three in the space it renders in — so
 * nothing is quantised through an 8-bit hex step on the way in.
 *
 * The map inverts cleanly between themes rather than being a dark artifact bolted onto a
 * light site. In dark mode it is a lit console chart: glowing line-work on near-black. In
 * light mode it is the same chart printed — dark ink on paper. Both fall out of mixing
 * `--background` toward `--foreground`, because those two swap roles with the theme.
 */
import { AdditiveBlending, Color, LinearSRGBColorSpace, NormalBlending } from 'three';

interface Oklch {
	l: number;
	c: number;
	h: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** `oklch(0.5999 0.2412 293.08)`, with optional `%` on L and an optional `/ alpha`. */
function parseOklch(value: string): Oklch | null {
	const match = /oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)/i.exec(value);
	if (!match) return null;
	const number = (raw: string, basis: number) =>
		raw.endsWith('%') ? (Number.parseFloat(raw) / 100) * basis : Number.parseFloat(raw);
	return { l: number(match[1], 1), c: number(match[2], 0.4), h: Number.parseFloat(match[3]) };
}

/** Björn Ottosson's OKLab matrices. Output is linear-light sRGB, not gamma-encoded. */
function toColor({ l: L, c, h }: Oklch): Color {
	const hr = (h * Math.PI) / 180;
	const a = c * Math.cos(hr);
	const b = c * Math.sin(hr);

	const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

	return new Color().setRGB(
		clamp01(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
		clamp01(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
		clamp01(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
		LinearSRGBColorSpace
	);
}

/** Blend two tokens in OKLCH, taking the short way round the hue wheel. */
function mix(a: Oklch, b: Oklch, t: number): Oklch {
	const dh = ((b.h - a.h + 540) % 360) - 180;
	return {
		l: clamp01(a.l + (b.l - a.l) * t),
		c: Math.max(0, a.c + (b.c - a.c) * t),
		h: (a.h + dh * t + 360) % 360
	};
}

const FALLBACK: Oklch = { l: 0.6, c: 0, h: 0 };
const readToken = (styles: CSSStyleDeclaration, name: string): Oklch =>
	parseOklch(styles.getPropertyValue(name).trim()) ?? FALLBACK;

export interface MapPalette {
	/** The chart's ground. */
	ground: Color;
	/** Lowest contours — near the ground, barely there. */
	contourLow: Color;
	/** Highest contours — the ridges, brightest. */
	contourHigh: Color;
	/** Index contours, every `contourMajorEvery` metres. */
	contourMajor: Color;
	/** The national border. */
	border: Color;
	/** The Mekong and other water. */
	water: Color;
	/** Street ink by importance, index 0 = residential. */
	streets: [Color, Color, Color];
	/** Beacons, arcs and the sweep — the only saturated things on the chart. */
	accent: Color;
	/**
	 * The accent as an emitter, for anything blended additively.
	 *
	 * Additive blending adds the source to what is already there, so the same violet that
	 * saturates instantly against white barely lifts off near-black — which is why the
	 * beacons read clearly in light mode and almost disappeared in dark. Pushing the colour
	 * past 1.0 in dark mode gives it the headroom to actually glow; the clamp at the end of
	 * the pipeline is what turns the centre of a pulse white-hot.
	 */
	accentGlow: Color;
	/** Quieter accent for past venues and idle arcs. */
	accentMuted: Color;
	isDark: boolean;
	/** Additive reads as glow on a dark ground and as fog on a light one. */
	lineBlending: typeof AdditiveBlending | typeof NormalBlending;
}

/**
 * Sample the live tokens. Called on mount and again whenever mode-watcher flips `.dark`,
 * so there is no second palette to keep in step with theme.css.
 */
export function readPalette(element: HTMLElement = document.documentElement): MapPalette {
	const styles = getComputedStyle(element);
	const isDark = element.classList.contains('dark');

	const background = readToken(styles, '--background');
	const foreground = readToken(styles, '--foreground');
	const primary = readToken(styles, '--primary');

	/** Distance from the page's own ground toward its own ink. Inverts with the theme. */
	const ink = (t: number) => toColor(mix(background, foreground, t));

	/*
	 * The chart's ground is not the page's. It sits a step *away* from the page in both
	 * themes so the map reads as a surface laid on the page rather than a hole in it —
	 * deeper in dark mode, a faint tint in light mode.
	 */
	const ground = toColor(mix(background, foreground, isDark ? 0.045 : 0.03));

	return {
		ground,
		/*
		 * Low ground is quieter than the ridges, but not silent. Most of Laos sits at the
		 * bottom of its own range, so nearly every line on the chart is a low one — pitch
		 * those too close to the ground and the map reads as an empty page with an outline
		 * on it, which is exactly what the first build did.
		 */
		contourLow: ink(isDark ? 0.26 : 0.34),
		contourHigh: ink(isDark ? 0.72 : 0.82),
		contourMajor: toColor(mix(mix(background, foreground, isDark ? 0.8 : 0.9), primary, 0.35)),
		border: toColor(mix(mix(background, foreground, isDark ? 0.9 : 1), primary, 0.2)),
		water: toColor({ ...mix(background, foreground, isDark ? 0.4 : 0.5), h: primary.h, c: 0.05 }),
		streets: [ink(isDark ? 0.18 : 0.22), ink(isDark ? 0.34 : 0.42), ink(isDark ? 0.55 : 0.66)],
		accent: toColor(primary),
		accentGlow: toColor(primary).multiplyScalar(isDark ? 2.6 : 1),
		accentMuted: toColor(mix(primary, background, isDark ? 0.3 : 0.55)),
		isDark,
		/*
		 * Additive on a dark ground is what makes overlapping line-work bloom where it
		 * crosses, which is the whole look. On a light ground additive only ever lightens,
		 * so ink would vanish exactly where it should be densest — there, normal blending.
		 */
		lineBlending: isDark ? AdditiveBlending : NormalBlending
	};
}
