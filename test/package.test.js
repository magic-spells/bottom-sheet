import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Both bundles register their custom elements at evaluation time, so the
// browser surface they touch has to exist before either one is loaded.
globalThis.HTMLElement = class extends EventTarget {};
globalThis.customElements = { get: () => undefined, define: () => {} };
globalThis.window = Object.assign(new EventTarget(), { innerHeight: 1000, innerWidth: 400 });

const require = createRequire(import.meta.url);
const dist = (file) => fileURLToPath(new URL(`../dist/${file}`, import.meta.url));

const EXPORTS = ['BottomSheet', 'BottomSheetContent', 'BottomSheetHeader', 'BottomSheetFooter'];

// The suite is meaningless without a build, and `npm test` must not require
// one. Skipping is honest; passing on a missing file would not be.
const built = existsSync(dist('bottom-sheet.esm.js'));

const SKIP = !built && 'run npm run build first';

test('the ESM entry loads and exposes every element', { skip: SKIP }, async () => {
	const module = await import(dist('bottom-sheet.esm.js'));
	assert.deepEqual(Object.keys(module).sort(), [...EXPORTS].sort());
});

test('the minified entry loads and exposes every element', { skip: SKIP }, async () => {
	const module = await import(dist('bottom-sheet.min.js'));
	assert.deepEqual(Object.keys(module).sort(), [...EXPORTS].sort());
});

test('package.json points at the files the build actually emits', { skip: SKIP }, () => {
	const pkg = require('../package.json');
	const entries = [
		pkg.main,
		pkg.module,
		pkg.unpkg,
		pkg.style,
		pkg.exports['.'].import,
		pkg.exports['.'].default,
		pkg.exports['./css'],
		pkg.exports['./css/min'],
	];

	for (const entry of new Set(entries)) {
		assert.ok(existsSync(dist(entry.replace(/^\.?\/?dist\//, ''))), `${entry} is not emitted`);
	}
});

// The package is ESM only. A `require` condition here would have to point at a
// CommonJS body, which cannot live under `"type": "module"` without a `.cjs`
// extension — the shape that silently shipped broken.
test('the package declares no CommonJS entry', () => {
	const pkg = require('../package.json');

	assert.equal(pkg.type, 'module');
	assert.equal(pkg.exports['.'].require, undefined);
	assert.ok(!JSON.stringify(pkg).includes('.cjs'));
});
