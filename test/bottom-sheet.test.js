import test, { afterEach } from 'node:test';
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
	getComputedStyle: (element) => element.style,
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
const connectedSheets = new Set();

afterEach(() => {
	for (const sheet of connectedSheets) {
		sheet.disconnectedCallback();
	}
	connectedSheets.clear();
	resetFrames();
});

/**
 * A dialog whose measured height tracks whatever was last written to it, so a
 * settle reads back its own frames the way the real one does
 */
function makeDialog(restingHeight = 400) {
	const classes = new Set();
	const props = new Map();
	return Object.assign(new EventTarget(), {
		classes,
		classList: {
			add: (...names) => names.forEach((name) => classes.add(name)),
			remove: (...names) => names.forEach((name) => classes.delete(name)),
			contains: (name) => classes.has(name),
		},
		// Custom properties live in their own bag rather than on `style` itself,
		// so `style.height` stays a plain string the way the rest of the suite
		// reads it.
		props,
		style: {
			setProperty: (name, value) => props.set(name, value),
			removeProperty: (name) => props.delete(name),
			getPropertyValue: (name) => props.get(name) ?? '',
		},
		getBoundingClientRect() {
			const parsed = parseFloat(this.style.height);
			return {
				height:
					this.style.height?.endsWith('px') && Number.isFinite(parsed) ? parsed : restingHeight,
			};
		},
	});
}

/**
 * A panel that records closes and can refuse them, matching dialog-panel's
 * contract — it returns false both for a cancelled `beforeHide` and for a
 * close that arrives while the sheet is still opening
 */
function makePanel({ accepts = true } = {}) {
	const props = new Map();
	return Object.assign(new EventTarget(), {
		hideCalls: 0,
		isOpen: true,
		state: 'shown',
		backdrop: null,
		// The scrim token is written here — the lowest common ancestor of the
		// <dialog-backdrop> overlay and the sheet's own subtree, both of which
		// read it. `props` is what the scrim assertions inspect.
		props,
		style: {
			setProperty: (name, value) => props.set(name, value),
			removeProperty: (name) => props.delete(name),
			getPropertyValue: (name) => props.get(name) ?? '',
		},
		hide() {
			this.hideCalls++;
			// `beforeHide` is cancelable and the state only moves if it survives,
			// which is exactly why the sheet's cleanup has to wait a microtask
			// before it reads the verdict rather than acting on the announcement
			this.dispatchEvent(new Event('beforeHide'));
			if (!accepts) return false;

			this.state = 'hiding';
			return true;
		},
		show() {
			this.dispatchEvent(new Event('beforeShow'));
			return true;
		},
		getAttribute(name) {
			return name === 'state' ? this.state : null;
		},
		hasAttribute: () => false,
		querySelector(selector) {
			return selector === 'dialog-backdrop' ? this.backdrop : null;
		},
	});
}

/**
 * Lets the deferred beforeHide cleanup run. A timer rather than an awaited
 * promise, so every already-queued microtask has drained by the time it
 * resolves regardless of how many ticks deep the deferral goes.
 */
function flush() {
	return new Promise((resolve) => setTimeout(resolve, 0));
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

/**
 * The <dialog-backdrop> sibling that now paints the overlay. It inherits the
 * scrim token from the panel rather than carrying it, so this only has to be a
 * surface — the listener map is what the "no gesture is bound here" assertion
 * inspects.
 */
function makeBackdrop() {
	const props = new Map();
	return Object.assign(makeSurface(), {
		props,
		style: {
			setProperty: (name, value) => props.set(name, value),
			removeProperty: (name) => props.delete(name),
			getPropertyValue: (name) => props.get(name) ?? '',
		},
	});
}

function makeSheet({ snapPoints = [40, 70], snap = null, accepts = true } = {}) {
	resetFrames();

	const dialog = makeDialog();
	const panel = makePanel({ accepts });
	const header = makeSurface();
	const backdrop = makeBackdrop();
	const sheet = new BottomSheet();
	connectedSheets.add(sheet);

	sheet.closestDialog = dialog;
	sheet.closestPanel = panel;
	sheet.children['bottom-sheet-header'] = header;
	panel.backdrop = backdrop;

	if (snapPoints.length) sheet.snapPoints = snapPoints;
	if (snap !== null) sheet.snap = snap;
	sheet.connectedCallback();

	return { sheet, dialog, panel, header, backdrop };
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

/**
 * Presses and drags without ever lifting, so a live gesture can be interrupted
 * @param {Object} surface - A surface from makeSurface
 * @param {number[]} path - Absolute clientY positions, starting at the press
 * @returns {Function} Fires one more move, at an absolute clientY
 */
function pointerHold(surface, path) {
	let time = clock;
	const event = (y) => ({
		pointerId: 1,
		isPrimary: true,
		clientY: y,
		timeStamp: (time += FRAME_MS),
	});

	surface.listeners.get('pointerdown')(event(path[0]));
	for (const y of path.slice(1)) surface.listeners.get('pointermove')(event(y));

	return (y) => surface.listeners.get('pointermove')(event(y));
}

function dispatchTransitionEnd(dialog, propertyName) {
	const event = new Event('transitionend');
	Object.defineProperty(event, 'propertyName', { value: propertyName });
	dialog.dispatchEvent(event);
}

test('unparseable snap-points are removed while valid points remain reflected', () => {
	const { sheet } = makeSheet({ snapPoints: [] });

	for (const value of ['40%,70%', 'none', '']) {
		sheet.setAttribute('snap-points', value);
		assert.equal(sheet.getAttribute('snap-points'), null, value);
		assert.deepEqual(sheet.snapPoints, [], value);
	}

	sheet.setAttribute('snap-points', '30,60');
	assert.equal(sheet.getAttribute('snap-points'), '30,60');
	assert.deepEqual(sheet.snapPoints, [30, 60]);
});

test('max-display-width accepts only complete finite numeric strings', () => {
	const { sheet } = makeSheet({ snapPoints: [] });

	for (const [value, expected] of [
		['100%', Infinity],
		['1e3', 1000],
		['  ', Infinity],
		['', Infinity],
		['768', 768],
	]) {
		sheet.setAttribute('max-display-width', value);
		assert.equal(sheet.maxDisplayWidth, expected, value);
	}
});

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
	const classes = new Set(dialog.classes);
	const height = dialog.style.height;

	assert.equal(sheet.hide(), false);
	assert.equal(panel.hideCalls, 1);
	assert.deepEqual(dialog.classes, classes);
	assert.equal(dialog.style.height, height);

	runFrames(1);
	assert.notEqual(dialog.style.height, height, 'the spring target should remain live');
	runFrames();
	assert.equal(dialog.style.height, '70dvh', 'the settle should have been allowed to finish');
	assert.equal(sheet.snap, 70);
});

test('a refused close after a plain drag re-arms the transition and clears the transform', () => {
	const { sheet, dialog, header } = makeSheet({
		snapPoints: [40, 70],
		snap: 40,
		accepts: false,
	});

	pointerHold(header, path(60));
	assert.ok(dialog.style.transform.includes('translate3d'), 'expected a live drag');
	assert.equal(dialog.classList.contains('transitioning'), false);

	assert.equal(sheet.hide(), false);

	assert.equal(dialog.classList.contains('transitioning'), true);
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

test('grabbing an opening sheet pins its painted transform before dropping transitions', () => {
	const { dialog, header } = makeSheet({ snapPoints: [] });
	dialog.classList.add('transitioning', 'snapping');

	const getComputedStyle = window.getComputedStyle;
	window.getComputedStyle = () => ({ transform: 'matrix(1, 0, 0, 1, 0, 240)' });
	try {
		header.listeners.get('pointerdown')({
			pointerId: 1,
			isPrimary: true,
			clientY: 0,
			timeStamp: FRAME_MS,
		});
	} finally {
		window.getComputedStyle = getComputedStyle;
	}

	assert.equal(dialog.style.transform, 'matrix(1, 0, 0, 1, 0, 240)');
	assert.equal(dialog.classList.contains('transitioning'), false);
	assert.equal(dialog.classList.contains('snapping'), false);
});

test('an unclaimed release clears the opening transform pin and re-arms its transition', () => {
	const { dialog, header } = makeSheet({ snapPoints: [] });
	dialog.style.transform = 'matrix(1, 0, 0, 1, 0, 240)';
	dialog.classList.add('transitioning');

	pointerDrag(header, [0]);

	assert.equal(dialog.style.transform, '');
	assert.equal(dialog.classList.contains('transitioning'), true);
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

test('a soft release below the shortest snap animates home instead of teleporting', () => {
	const { sheet, dialog, panel, header } = makeSheet({ snapPoints: [40, 70], snap: 40 });

	// Below the shortest snap the height is pinned there and the travel is
	// carried by the transform, so the spring has no height left to animate —
	// while its branch clears the transform with nothing armed to transition it.
	pointerDrag(header, path(60, 0, 3));

	assert.equal(panel.hideCalls, 0);
	assert.equal(animationFrames.length, 0, 'the spring has nothing to settle here');
	assert.equal(dialog.style.transform, '');
	assert.equal(dialog.style.height, '40dvh');
	assert.ok(dialog.classList.contains('transitioning'), 'the return must stay on a clock');
	assert.ok(dialog.classList.contains('snapping'));
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

test('a late settle height transition cannot cancel an active close transition', () => {
	const { dialog, panel } = makeSheet({ snapPoints: [40, 70] });
	dialog.classList.add('transitioning', 'snapping');
	panel.state = 'hiding';

	dispatchTransitionEnd(dialog, 'height');
	assert.equal(dialog.classList.contains('transitioning'), true);
	assert.equal(dialog.classList.contains('snapping'), true);

	dispatchTransitionEnd(dialog, 'transform');
	assert.equal(dialog.classList.contains('transitioning'), false);
	assert.equal(dialog.classList.contains('snapping'), false);
});

/* ---- Parent-driven closes ----
   Escape, a backdrop tap and every [data-action-hide-dialog] button call
   dialog-panel.hide() directly, so none of them reach BottomSheet.hide(). The
   sheet only learns about them through `beforeHide`. */

test('a parent-driven close drops the snap pacing the settle left behind', async () => {
	const { sheet, dialog, panel } = makeSheet({ snapPoints: [40, 70], snap: 40 });
	sheet.setAttribute('spring', 'none');

	sheet.snapTo(70);
	assert.ok(dialog.classList.contains('snapping'), 'expected the settle to be armed');

	panel.hide();
	await flush();

	// Left on, the snap pacing outranks the hiding rule and the close runs at
	// the settle's duration rather than the shared one
	assert.equal(dialog.classList.contains('snapping'), false);
	assert.ok(dialog.classList.contains('transitioning'), 'the hiding rule brings its own');
});

test('a parent-driven close halts a settle instead of letting it paint over the exit', async () => {
	const { sheet, dialog, panel } = makeSheet({ snapPoints: [40, 70], snap: 40 });

	sheet.snapTo(70);
	runFrames(8);
	assert.ok(dialog.style.height.endsWith('px'), 'expected the settle to be mid-flight');

	panel.hide();
	await flush();

	const halted = dialog.style.height;
	runFrames();
	assert.equal(dialog.style.height, halted, 'the spring must stop writing into a closing sheet');
	assert.equal(dialog.style.transform, '');
	assert.equal(dialog.classList.contains('snapping'), false);
});

test('a cancelled parent-driven close leaves a running settle alone', async () => {
	const { sheet, dialog, panel } = makeSheet({ snapPoints: [40, 70], accepts: false });

	sheet.snapTo(70);
	runFrames(8);

	// `beforeHide` announces a close; it does not commit to one. Tearing down on
	// the announcement kills a settle the panel then refuses to close over.
	assert.equal(panel.hide(), false);
	await flush();

	runFrames();
	assert.equal(dialog.style.height, '70dvh', 'the settle should have been allowed to finish');
	assert.equal(sheet.snap, 70);
});

test('a parent-driven close mid-drag releases the gesture and clears its transform', async () => {
	const { dialog, panel, header } = makeSheet({ snapPoints: [40, 70], snap: 40 });

	const move = pointerHold(header, path(120));
	assert.ok(dialog.style.transform.includes('translate3d'), 'expected a live drag');

	panel.hide();
	await flush();

	// An interrupted pointer never gets its pointerup, so nothing else would
	// ever clear the drag — and its transform sits on top of the exit animation
	assert.equal(dialog.style.transform, '');
	assert.equal(dialog.classList.contains('snapping'), false);

	move(200);
	assert.equal(dialog.style.transform, '', 'the abandoned pointer must be inert');
});

test('beforeShow does not bind a gesture to the backdrop sibling', () => {
	const { sheet, backdrop } = makeSheet({ snapPoints: [] });

	assert.equal(sheet.backdrop, backdrop);
	sheet.show();

	assert.equal(backdrop.listeners.size, 0);
});

/**
 * What the scrim is reading, or null when the token is absent. Read from the
 * overlay element, which is a SIBLING of the dialog — it never inherited the
 * token, so the component writes it there directly.
 */
const scrim = (panel) => panel.props.get('--bs-backdrop-progress') ?? null;

test('snap-to-snap travel leaves the scrim alone until the sheet drops below the shortest snap', () => {
	const { dialog, header, panel } = makeSheet({ snapPoints: [40, 70], snap: 70 });
	// The stub measures whatever px height was last written, so start the sheet
	// well above the 400px shortest snap and give the drag room to resize first.
	dialog.style.height = '600px';

	// claimOffset eats the opening 10px step, so this resizes to 410px — still
	// a resize, and a resize is not a dismissal.
	const move = pointerHold(header, path(200));
	assert.equal(scrim(panel), null, 'shrinking between snaps must not touch the scrim');

	// Past the shortest snap the height pins and the transform takes over. Only
	// now is the sheet actually leaving the screen.
	move(260);
	assert.equal(scrim(panel), '0.875', '350px of a 400px rest extent');
});

test('overscrolling up past the tallest snap never lightens the scrim', () => {
	const { dialog, header, panel } = makeSheet({ snapPoints: [40, 70], snap: 70 });
	dialog.style.height = '690px';

	pointerHold(header, [0, -10, -20, -30, -40]);

	assert.equal(scrim(panel), null);
});

test('a binary sheet tracks the scrim across its whole downward drag', () => {
	// No snaps, so the resting height IS the shortest snap and every pixel of
	// downward travel is dismissal travel.
	const { dialog, header, panel } = makeSheet({ snapPoints: [] });

	const move = pointerHold(header, path(50));
	assert.equal(scrim(panel), '0.900', '360px of a 400px rest extent');

	move(150);
	assert.equal(scrim(panel), '0.650');
});

test('releasing hands the scrim back to CSS', () => {
	const { dialog, header, panel } = makeSheet({ snapPoints: [40, 70], snap: 40 });

	pointerDrag(header, path(60, 0, 3));

	assert.equal(scrim(panel), null, 'the token must not survive the release');
	assert.equal(
		dialog.classList.contains('dragging'),
		false,
		'the transition has to be re-armed or the scrim cannot ride home'
	);
});

test('a close arriving mid-drag clears the scrim before the hiding rule takes over', async () => {
	const { dialog, panel, header } = makeSheet({ snapPoints: [40, 70], snap: 40 });

	pointerHold(header, path(60));
	assert.equal(scrim(panel), '0.875', 'expected a live dismissal drag');

	// Escape and a backdrop tap both land here, never in hide()
	panel.hide();
	await flush();

	assert.equal(scrim(panel), null);
	assert.equal(dialog.classList.contains('dragging'), false);
});

test('a refused close mid-drag restores the scrim with the rest of the gesture', () => {
	const { sheet, dialog, header, panel } = makeSheet({
		snapPoints: [40, 70],
		snap: 40,
		accepts: false,
	});

	pointerHold(header, path(60));
	assert.equal(scrim(panel), '0.875');

	assert.equal(sheet.hide(), false);

	assert.equal(scrim(panel), null, 'a sheet that is staying gets its scrim back');
	assert.equal(dialog.classList.contains('dragging'), false);
});

test('reopening after a drag-dismiss fades the scrim in from nothing', () => {
	const { sheet, dialog, panel, header } = makeSheet({ snapPoints: [] });

	pointerHold(header, path(150));
	assert.notEqual(scrim(panel), null);

	sheet.hide();
	panel.state = 'hidden';
	sheet.show();

	assert.equal(scrim(panel), null, 'the dismissing drag must not seed the reopen');
	assert.equal(dialog.classList.contains('dragging'), false);
});
