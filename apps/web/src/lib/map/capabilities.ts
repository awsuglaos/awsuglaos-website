/**
 * Device probes, deliberately kept in their own module.
 *
 * These decide whether three.js is downloaded at all, so they must not import it — a
 * capability check that pulls in the library it is gating has already lost the argument.
 */

export function supportsWebGL(): boolean {
	try {
		return Boolean(document.createElement('canvas').getContext('webgl2'));
	} catch {
		return false;
	}
}

export function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Which tier of the model to fetch.
 *
 * The audience is largely on mid-range Android phones over Lao mobile data, so the honest
 * default for a small or low-core device is the lighter city and no shadow pass — a model
 * that renders smoothly beats a denser one that stutters. `deviceMemory` is Chromium-only;
 * its absence is treated as "no evidence of a weak device" rather than as a weak device.
 */
export function detectQuality(): 'full' | 'lite' {
	const cores = navigator.hardwareConcurrency ?? 8;
	const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
	const narrow = window.matchMedia('(max-width: 767px)').matches;
	const coarse = window.matchMedia('(pointer: coarse)').matches;

	return cores <= 4 || memory <= 4 || (narrow && coarse) ? 'lite' : 'full';
}
