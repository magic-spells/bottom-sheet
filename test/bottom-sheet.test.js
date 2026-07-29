import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./ignore-css-loader.js', import.meta.url));

class StubElement extends EventTarget {
	#attributes = new Map();
	closestDialog = null;

	getAttribute(name) {
		return this.#attributes.get(name) ?? null;
	}

	setAttribute(name, value) {
		const oldValue = this.getAttribute(name);
		const newValue = String(value);
		this.#attributes.set(name, newValue);

		if (this.constructor.observedAttributes?.includes(name)) {
			this.attributeChangedCallback?.(name, oldValue, newValue);
		}
	}

	removeAttribute(name) {
		const oldValue = this.getAttribute(name);
		if (oldValue === null) return;

		this.#attributes.delete(name);
		if (this.constructor.observedAttributes?.includes(name)) {
			this.attributeChangedCallback?.(name, oldValue, null);
		}
	}

	closest(selector) {
		return selector === 'dialog' ? this.closestDialog : null;
	}

	querySelector() {
		return null;
	}
}

const registry = new Map();
globalThis.HTMLElement = StubElement;
globalThis.customElements = {
	get: (name) => registry.get(name),
	define: (name, constructor) => registry.set(name, constructor),
};
globalThis.window = Object.assign(new EventTarget(), {
	innerHeight: 1000,
	innerWidth: 400,
});

const animationFrames = [];
globalThis.requestAnimationFrame = (callback) => {
	animationFrames.push(callback);
	return animationFrames.length;
};

const { BottomSheet } = await import('../src/bottom-sheet.js');

test('the first spring commit keeps a finite target through lazy engine initialization', () => {
	const classes = new Set();
	const dialog = {
		classList: {
			add: (...names) => names.forEach((name) => classes.add(name)),
			remove: (...names) => names.forEach((name) => classes.delete(name)),
		},
		style: {},
		getBoundingClientRect: () => ({ height: 400 }),
	};
	const sheet = new BottomSheet();
	sheet.closestDialog = dialog;
	sheet.snapPoints = [40, 70];

	assert.doesNotThrow(() => sheet.snapTo(70));
	assert.equal(sheet.snap, 70);
	assert.equal(dialog.style.height, '40dvh');
	assert.equal(animationFrames.length, 1);
});
