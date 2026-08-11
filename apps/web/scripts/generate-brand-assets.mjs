/*
 * Derives the favicon set and the default social image from the brand logos.
 *
 * The source files are 1254px transparent PNGs — right for an asset library,
 * far too heavy for a browser tab. Run this after either logo changes:
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * Everything it writes lands in static/ and is committed, so a normal install
 * never needs sharp at build time. sharp arrives with @sveltejs/enhanced-img.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (name) => join(root, 'src', 'lib', 'assets', name);
const out = (name) => join(root, 'static', name);

/** The hexagon's own interior, sampled from the artwork. */
const BRAND_NAVY = { r: 0x12, g: 0x17, b: 0x2d, alpha: 1 };

/** Tab and home-screen icons, from the stupa mark. */
const ICONS = [
	['favicon-32.png', 32],
	['favicon-192.png', 192],
	['favicon-512.png', 512],
	['apple-touch-icon.png', 180]
];

async function icons() {
	for (const [name, size] of ICONS) {
		/*
		 * Apple ignores transparency and composites onto white, which would leave
		 * the dark hexagon floating on a white square. Giving the touch icon the
		 * brand navy as a real background makes it read as a deliberate tile.
		 */
		const appleIcon = name === 'apple-touch-icon.png';

		await sharp(src('awsuglaos-mark.png'))
			.resize(size, size, {
				fit: 'contain',
				background: appleIcon ? BRAND_NAVY : { r: 0, g: 0, b: 0, alpha: 0 }
			})
			.flatten(appleIcon ? { background: BRAND_NAVY } : false)
			.png({ compressionLevel: 9 })
			.toFile(out(name));

		console.log(`  static/${name}  ${size}×${size}`);
	}
}

/**
 * The fallback og:image — every page without its own cover falls back here, so
 * it has to carry the name on its own. The lockup already contains the
 * wordmark, so it just needs centring on a card of the brand navy.
 */
async function socialCard() {
	const W = 1200;
	const H = 630;
	const lockup = await sharp(src('awsuglaos-lockup.png'))
		.resize(460, 460, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.toBuffer();

	await sharp({ create: { width: W, height: H, channels: 4, background: BRAND_NAVY } })
		.composite([{ input: lockup, gravity: 'centre' }])
		.png({ compressionLevel: 9 })
		.toFile(out('og-default.png'));

	console.log(`  static/og-default.png  ${W}×${H}`);
}

/**
 * A vector favicon for browsers that prefer one. It cannot reproduce the line
 * art, so it draws the hexagon and the brand initials instead — legible at
 * 16px in a way the full mark is not.
 */
async function faviconSvg() {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="AWS User Group Lao">
	<path d="M32 2 58 17v30L32 62 6 47V17Z" fill="#12172d" stroke="#8b5cf6" stroke-width="4" stroke-linejoin="round"/>
	<text x="32" y="41" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">UG</text>
</svg>
`;
	await writeFile(out('favicon.svg'), svg, 'utf8');
	console.log('  static/favicon.svg');
}

await mkdir(join(root, 'static'), { recursive: true });
console.log('Generating brand assets…');
await icons();
await socialCard();
await faviconSvg();
console.log('Done.');
