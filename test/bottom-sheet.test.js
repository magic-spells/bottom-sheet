import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./ignore-css-loader.js', import.meta.url));

class StubElement extends EventTarget {
	#attributes = new Map();
	closestDialog = null;
	closestPanel = null;
	children = {};

	getAttribute(name) {
		return this.#attributes.get(name) ?? null;
	}

	hasAttribute(name) {
		return this.#attributes.has(name);
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
		if (selector === 'dialog') return this.closestDialog;
		if (selector === 'dialog-panel') return this.closestPanel;
		return null;
	}

	querySelector(selector) {
		return this.children[selector] ?? null;
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

// Frames are collected rather than run, which is what makes a settle
// inspectable without a real clock. Nothing advances until a test turns the
// crank, so `#springTarget` and the inline height can be read mid-flight.
let animationFrames = [];
globalThis.requestAnimationFrame = (callback) => {
	animationFrames.push(callback);
	return animationFrames.length;
};

const FRAME_MS = 16.66;
let clock = 0;

/**
 * Drains the collected frames at a 60fps cadence, stopping early once the
 * engine stops asking for more.
 * @param {number} count - Frames to run; the default runs a settle to rest
 */
function runFrames(count = 400) {
	for (let i = 0; i < count; i++) {
		const queue = animationFrames;
		if (!queue.length) return i;

		animationFrames = [];
		clock += FRAME_MS;
		for (const callback of queue) callback(clock);
	}
	return count;
}

function resetFrames() {
	animationFrames = [];
	clock = 0;
}

const { BottomSheet } = await import('../src/bottom-sheet.js');

/**
 * A dialog whose measured height tracks whatever was last written to it, so a
 * settle reads back its own frames the way the real one does
 */
function makeDialog(restingHeight = 400) {
	const classes = new Set();
	return {
		classes,
		classList: {
			add: (...names) => names.forEach((name) => classes.add(name)),
			remove: (...names) => names.forEach((name) => classes.delete(name)),
			contains: (name) => classes.has(name),
		},
		style: {},
		addEventListener() {},
		removeEventListener() {},
		getBoundingClientRect() {
			const parsed = parseFloat(this.style.height);
			return {
				height:
					this.style.height?.endsWith('px') && Number.isFinite(parsed) ? parsed : restingHeight,
			};
		},
	};
}

/**
 * A panel that records closes and can refuse them, matching dialog-panel's
 * contract — it returns false both for a cancelled `beforeHide` and for a
 * close that arrives while the sheet is still opening
 */
function makePanel({ accepts = true } = {}) {
	return Object.assign(new EventTarget(), {
		hideCalls: 0,
		isOpen: true,
		// dialog-panel creates the backdrop itself, so the sheet binds its
		// gesture lazily on the first beforeShow rather than at connect
		backdrop: null,
		hide() {
			this.hideCalls++;
			return accepts;
		},
		show() {
			this.dispatchEvent(new Event('beforeShow'));
			return true;
		},
		getAttribute: () => 'shown',
		hasAttribute: () => false,
		querySelector(selector) {
			return selector === 'dialog-backdrop' ? this.backdrop : null;
		},
	});
}

/** A drag surface that hands back the listeners DragGesture binds to it */
function makeSurface() {
	const listeners = new Map();
	return {
		listeners,
		addEventListener: (type, handler) => listeners.set(type, handler),
		removeEventListener: (type) => listeners.delete(type),
		setPointerCapture() {},
	};
}

function makeSheet({ snapPoints = [40, 70], snap = null, accepts = true } = {}) {
	resetFrames();

	const dialog = makeDialog();
	const panel = makePanel({ accepts });
	const header = makeSurface();
	const sheet = new BottomSheet();

	sheet.closestDialog = dialog;
	sheet.closestPanel = panel;
	sheet.children['bottom-sheet-header'] = header;

	if (snapPoints.length) sheet.snapPoints = snapPoints;
	if (snap !== null) sheet.snap = snap;
	sheet.connectedCallback();

	return { sheet, dialog, panel, header };
}

/**
 * Drives a full pointer sequence through a bound surface
 * @param {Object} surface - A surface from makeSurface
 * @param {number[]} path - Absolute clientY positions, starting at the press
 */
function pointerDrag(surface, path) {
	let time = clock;
	const event = (y) => ({
		pointerId: 1,
		isPrimary: true,
		clientY: y,
		timeStamp: (time += FRAME_MS),
	});

	surface.listeners.get('pointerdown')({ ...event(path[0]), pointerId: 1, isPrimary: true });
	for (const y of path.slice(1)) surface.listeners.get('pointermove')(event(y));
	surface.listeners.get('pointerup')(event(path[path.length - 1]));
}

test('the first spring commit keeps a finite target through lazy engine initialization', () => {
	const { sheet, dialog } = makeSheet({ snapPoints: [40, 70] });

	assert.doesNotThrow(() => sheet.snapTo(70));
	assert.equal(sheet.snap, 70);
	// The settle owns the height from here, so the reflection must not have
	// overwritten frame one with the destination
	assert.equal(dialog.style.height, '40dvh');
	assert.equal(animationFrames.length, 1);
});

test('a settle lands on its snap and hands the height back in dvh', () => {
	const { sheet, dialog } = makeSheet({ snapPoints: [40, 70] });

	sheet.snapTo(70);
	runFrames();

	assert.equal(dialog.style.height, '70dvh');
	assert.equal(sheet.snap, 70);
});

test('retuning `spring` mid-settle finishes onto the snap instead of stranding the sheet', () => {
	const { sheet, dialog } = makeSheet({ snapPoints: [40, 70] });

	sheet.snapTo(70);
	runFrames(8);
	assert.ok(dialog.style.height.endsWith('px'), 'expected the settle to be mid-flight');

	sheet.setAttribute('spring', 'none');

	// The engine emits `stop` rather than `complete` when halted, so nothing
	// restores the height on its own — stopping alone left the sheet frozen at
	// the last frame's pixels while `snap` reported the destination.
	assert.equal(dialog.style.height, '70dvh');
	assert.equal(sheet.snap, 70);
	assert.ok(dialog.classList.contains('snapping'), 'the interruption should still be paced');

	runFrames();
	assert.equal(dialog.style.height, '70dvh');
});

test('retargeting `snap` mid-settle supersedes the settle rather than queueing behind it', () => {
	const { sheet, dialog } = makeSheet({ snapPoints: [40, 70, 90] });

	sheet.snapTo(70);
	runFrames(5);

	sheet.snap = 90;

	// The old spring used to run all the way out to 70 before the completion
	// handler jumped the sheet to 90 with no animation at all
	assert.equal(dialog.style.height, '90dvh');
	runFrames();
	assert.equal(dialog.style.height, '90dvh');
	assert.equal(sheet.snap, 90);
});

test('a refused close leaves a running settle alone and lets it land', () => {
	const { sheet, dialog, panel } = makeSheet({ snapPoints: [40, 70], accepts: false });

	sheet.snapTo(70);
	runFrames(8);

	assert.equal(sheet.hide(), false);
	assert.equal(panel.hideCalls, 1);

	runFrames();
	assert.equal(dialog.style.height, '70dvh', 'the settle should have been allowed to finish');
	assert.equal(sheet.snap, 70);
});

test('a refused close with no settle running restores the resting height', () => {
	const { sheet, dialog } = makeSheet({ snapPoints: [40, 70], snap: 40, accepts: false });

	dialog.style.transform = 'translate3d(0, 120px, 0)';
	dialog.style.height = '280px';

	assert.equal(sheet.hide(), false);

	assert.equal(dialog.style.transform, '');
	assert.equal(dialog.style.height, '40dvh');
});

test('an accepted close reports true and drops the snap pacing', () => {
	const { sheet, dialog, panel } = makeSheet({ snapPoints: [40, 70], snap: 40 });

	dialog.classList.add('snapping');
	dialog.style.transform = 'translate3d(0, 120px, 0)';

	assert.equal(sheet.hide(), true);
	assert.equal(panel.hideCalls, 1);
	assert.equal(dialog.style.transform, '');
	assert.equal(dialog.classList.contains('snapping'), false);
});

/**
 * Absolute pointer positions for a drag down and an optional reversal.
 * Steps stay small because claimOffset is recorded on the first move, so a
 * coarse path silently discards its own opening distance.
 * @param {number} down - How far to travel downward
 * @param {number} up - How far to come back before releasing
 * @param {number} step - Pixels per frame
 */
function path(down, up = 0, step = 10) {
	const points = [];
	for (let y = 0; y <= down; y += step) points.push(y);
	for (let y = down - step; y >= down - up; y -= step) points.push(y);
	return points;
}

test('reversing upward below the shortest snap does not dismiss', () => {
	const { sheet, panel, header } = makeSheet({ snapPoints: [40, 70], snap: 40 });

	// Pull well below the shortest snap, then reverse and release while still
	// 130px below it — past the distance threshold, but travelling away from
	// the dismissal. The binary path has always guarded this; the snap path
	// checked distance alone and closed the sheet under an upward finger.
	pointerDrag(header, path(160, 20));

	assert.equal(panel.hideCalls, 0, 'an upward release must not dismiss');
	assert.equal(sheet.snap, 40);
});

test('a slow downward release below the shortest snap still dismisses', () => {
	const { panel, header } = makeSheet({ snapPoints: [40, 70], snap: 40 });

	// Under the flick velocity, so this is the distance clause on its own
	pointerDrag(header, path(141, 0, 3));

	assert.equal(panel.hideCalls, 1);
});

test('a downward flick below the shortest snap dismisses', () => {
	const { panel, header } = makeSheet({ snapPoints: [40, 70], snap: 40 });

	pointerDrag(header, path(120, 0, 20));

	assert.equal(panel.hideCalls, 1);
});

test('a cancelled backdrop pointer is not treated as a tap', () => {
	const backdrop = makeSurface();
	const { sheet, panel } = makeSheet({ snapPoints: [] });

	// The backdrop gesture is bound lazily on the first beforeShow
	panel.backdrop = backdrop;
	sheet.show();

	assert.ok(backdrop.listeners.size > 0, 'expected the backdrop gesture to be bound');

	const event = (y, t) => ({ pointerId: 1, isPrimary: true, clientY: y, timeStamp: t });
	backdrop.listeners.get('pointerdown')(event(500, 0));
	backdrop.listeners.get('pointermove')(event(502, 16));
	backdrop.listeners.get('pointercancel')(event(502, 32));

	assert.equal(panel.hideCalls, 0, 'a cancelled pointer is not a tap');
});
