import test from 'node:test';
import assert from 'node:assert/strict';

import { DragGesture, VelocityTracker } from '../src/drag-gesture.js';

class StubElement {
	constructor() {
		this.listeners = new Map();
		this.capturedPointerId = null;
	}

	addEventListener(type, listener) {
		this.listeners.set(type, listener);
	}

	removeEventListener(type, listener) {
		if (this.listeners.get(type) === listener) {
			this.listeners.delete(type);
		}
	}

	setPointerCapture(pointerId) {
		this.capturedPointerId = pointerId;
	}

	releasePointerCapture(pointerId) {
		if (this.capturedPointerId === pointerId) this.capturedPointerId = null;
	}

	fire(type, event) {
		this.listeners.get(type)?.(event);
	}
}

const ev = (overrides = {}) => ({
	isPrimary: true,
	pointerId: 1,
	clientY: 0,
	timeStamp: 0,
	...overrides,
});

test('VelocityTracker calculates velocity over its sample window', () => {
	const tracker = new VelocityTracker();
	tracker.add(0, 0);
	tracker.add(100, 100);

	assert.equal(tracker.velocity, 1);
});

test('VelocityTracker evicts stale samples after a pause', () => {
	const tracker = new VelocityTracker(100);
	tracker.add(0, 0);
	tracker.add(100, 50);
	tracker.add(110, 200);

	assert.equal(tracker.velocity, 10 / 150);
});

test('VelocityTracker reports the direction of travel after a reversal', () => {
	const tracker = new VelocityTracker(100);
	// A fast run upward, then the finger turns around and heads back down
	tracker.add(600, 0);
	tracker.add(515, 32);
	tracker.add(490, 48);
	tracker.add(520, 80);
	tracker.add(545, 96);

	// Measured oldest-to-newest this window still averages to -0.57, which
	// would send a released sheet the opposite way to the finger holding it
	assert.ok(tracker.velocity > 0, 'must report where the pointer is going, not where it came from');
	assert.equal(tracker.velocity, 55 / 48);
});

test('VelocityTracker returns zero with fewer than two samples', () => {
	const tracker = new VelocityTracker();

	assert.equal(tracker.velocity, 0);
	tracker.add(20, 10);
	assert.equal(tracker.velocity, 0);
});

test('DragGesture reports a complete start, move, and end flow', () => {
	const el = new StubElement();
	const calls = [];
	const gesture = new DragGesture(el, {
		onStart: (info) => calls.push(['start', info]),
		onMove: (info) => calls.push(['move', info]),
		onEnd: (info) => calls.push(['end', info]),
	});

	el.fire('pointerdown', ev({ clientY: 20, timeStamp: 10 }));
	assert.equal(el.capturedPointerId, null, 'pointerdown must not capture');

	el.fire('pointermove', ev({ clientY: 120, timeStamp: 110 }));
	el.fire('pointerup', ev({ clientY: 130, timeStamp: 130 }));

	assert.equal(el.capturedPointerId, 1);
	assert.equal(calls[0][0], 'start');
	assert.equal(calls[0][1].y, 20);
	assert.equal(calls[1][0], 'move');
	assert.equal(calls[1][1].deltaY, 100);
	assert.equal(calls[1][1].moveY, 100);
	assert.equal(calls[1][1].direction, 'down');
	assert.ok(calls[1][1].velocityY > 0.9);
	assert.equal(calls[2][0], 'end');
	assert.equal(calls[2][1].deltaY, 110);
	assert.equal(calls[2][1].duration, 120);
	// This drag decelerates into its release — 100px over the first 100ms, then
	// only 10px over the final 20ms. The end velocity describes the release,
	// not the whole gesture, so it reads 0.5 rather than the 1.0 average.
	assert.equal(calls[2][1].velocityY, 0.5);
	assert.equal(calls[2][1].cancelled, false);

	gesture.destroy();
});

test('DragGesture leaves a tap uncaptured so clicks reach interactive children', () => {
	const el = new StubElement();
	const gesture = new DragGesture(el);

	// A tap wanders a pixel or two before release. Capturing here would
	// retarget pointerup to `el` and compose the click on `el` instead of
	// the button the user actually pressed.
	el.fire('pointerdown', ev({ clientY: 40, timeStamp: 0 }));
	el.fire('pointermove', ev({ clientY: 43, timeStamp: 20 }));
	el.fire('pointerup', ev({ clientY: 42, timeStamp: 40 }));

	assert.equal(el.capturedPointerId, null);

	gesture.destroy();
});

test('DragGesture captures the pointer once movement passes the slop threshold', () => {
	const el = new StubElement();
	const gesture = new DragGesture(el);

	el.fire('pointerdown', ev({ clientY: 40, timeStamp: 0 }));
	el.fire('pointermove', ev({ clientY: 44, timeStamp: 20 }));
	assert.equal(el.capturedPointerId, null, 'still within slop');

	el.fire('pointermove', ev({ clientY: 60, timeStamp: 40 }));
	assert.equal(el.capturedPointerId, 1, 'captured once it is clearly a drag');

	gesture.destroy();
});

test('DragGesture captures on upward drags too', () => {
	const el = new StubElement();
	const gesture = new DragGesture(el);

	el.fire('pointerdown', ev({ clientY: 200, timeStamp: 0 }));
	el.fire('pointermove', ev({ clientY: 170, timeStamp: 20 }));

	assert.equal(el.capturedPointerId, 1);

	gesture.destroy();
});

test('DragGesture reports instantaneous movement separately from cumulative delta', () => {
	const el = new StubElement();
	const moves = [];
	const gesture = new DragGesture(el, {
		onMove: (info) =>
			moves.push({ deltaY: info.deltaY, moveY: info.moveY, direction: info.direction }),
	});

	el.fire('pointerdown', ev({ clientY: 100, timeStamp: 0 }));
	// Down, down, then a reversal that never crosses back past the start
	el.fire('pointermove', ev({ clientY: 140, timeStamp: 20 }));
	el.fire('pointermove', ev({ clientY: 180, timeStamp: 40 }));
	el.fire('pointermove', ev({ clientY: 150, timeStamp: 60 }));

	assert.deepEqual(moves, [
		{ deltaY: 40, moveY: 40, direction: 'down' },
		{ deltaY: 80, moveY: 40, direction: 'down' },
		// direction still reads 'down' because the pointer is below its origin;
		// only moveY sees the reversal, which is what a handoff decision needs
		{ deltaY: 50, moveY: -30, direction: 'down' },
	]);

	gesture.destroy();
});

test('DragGesture restarts moveY from the new origin on a second gesture', () => {
	const el = new StubElement();
	const moves = [];
	const gesture = new DragGesture(el, {
		onMove: (info) => moves.push(info.moveY),
	});

	el.fire('pointerdown', ev({ clientY: 100, timeStamp: 0 }));
	el.fire('pointermove', ev({ clientY: 160, timeStamp: 20 }));
	el.fire('pointerup', ev({ clientY: 160, timeStamp: 40 }));

	el.fire('pointerdown', ev({ clientY: 300, timeStamp: 60 }));
	el.fire('pointermove', ev({ clientY: 320, timeStamp: 80 }));

	assert.deepEqual(moves, [60, 20]);

	gesture.destroy();
});

test('DragGesture ignores non-primary and foreign pointers', () => {
	const el = new StubElement();
	const calls = [];
	const gesture = new DragGesture(el, {
		onStart: () => calls.push('start'),
		onMove: () => calls.push('move'),
		onEnd: () => calls.push('end'),
	});

	el.fire('pointerdown', ev({ isPrimary: false }));
	el.fire('pointermove', ev());
	el.fire('pointerup', ev());
	assert.deepEqual(calls, []);

	el.fire('pointerdown', ev());
	el.fire('pointermove', ev({ pointerId: 2, clientY: 100 }));
	el.fire('pointerup', ev({ pointerId: 2, clientY: 100 }));
	assert.deepEqual(calls, ['start']);

	el.fire('pointerup', ev());
	assert.deepEqual(calls, ['start', 'end']);

	gesture.destroy();
});

test('DragGesture reports no velocity when the pointer is held still before release', () => {
	const el = new StubElement();
	let endInfo;
	const gesture = new DragGesture(el, {
		onEnd: (info) => {
			endInfo = info;
		},
	});

	el.fire('pointerdown', ev({ clientY: 500, timeStamp: 0 }));
	el.fire('pointermove', ev({ clientY: 480, timeStamp: 16 }));
	el.fire('pointermove', ev({ clientY: 450, timeStamp: 32 }));
	el.fire('pointermove', ev({ clientY: 430, timeStamp: 48 }));
	// The finger parks for a quarter second before lifting. A stationary
	// pointer fires no pointermove, so the release is the only thing that can
	// retire those samples — without it the tracker still reports the flick.
	el.fire('pointerup', ev({ clientY: 430, timeStamp: 298 }));

	assert.equal(endInfo.velocityY, 0);

	gesture.destroy();
});

test('DragGesture reports the release direction after a mid-gesture reversal', () => {
	const el = new StubElement();
	let endInfo;
	const gesture = new DragGesture(el, {
		onEnd: (info) => {
			endInfo = info;
		},
	});

	el.fire('pointerdown', ev({ clientY: 600, timeStamp: 0 }));
	el.fire('pointermove', ev({ clientY: 515, timeStamp: 32 }));
	el.fire('pointermove', ev({ clientY: 490, timeStamp: 48 }));
	// Pulled back down before lifting
	el.fire('pointermove', ev({ clientY: 520, timeStamp: 80 }));
	el.fire('pointermove', ev({ clientY: 545, timeStamp: 96 }));
	el.fire('pointerup', ev({ clientY: 545, timeStamp: 100 }));

	assert.ok(endInfo.velocityY > 0, 'released heading downward, so velocity must be downward');

	gesture.destroy();
});

test('DragGesture reports pointer cancellation with zero velocity', () => {
	const el = new StubElement();
	let endInfo;
	const gesture = new DragGesture(el, {
		onEnd: (info) => {
			endInfo = info;
		},
	});

	el.fire('pointerdown', ev());
	el.fire('pointermove', ev({ clientY: 100, timeStamp: 100 }));
	el.fire('pointercancel', ev({ clientY: 120, timeStamp: 120 }));

	assert.equal(endInfo.cancelled, true);
	assert.equal(endInfo.velocityY, 0);

	gesture.destroy();
});

test('DragGesture cancel abandons the gesture without reporting a release', () => {
	const el = new StubElement();
	const calls = [];
	const gesture = new DragGesture(el, {
		onStart: () => calls.push('start'),
		onMove: () => calls.push('move'),
		onEnd: () => calls.push('end'),
	});

	el.fire('pointerdown', ev({ clientY: 100, timeStamp: 0 }));
	el.fire('pointermove', ev({ clientY: 160, timeStamp: 20 }));
	assert.equal(el.capturedPointerId, 1);

	gesture.cancel();

	// The surface is closing out from under a finger that never lifted, so no
	// release rule downstream is allowed to see an end
	assert.deepEqual(calls, ['start', 'move']);
	assert.equal(el.capturedPointerId, null, 'capture must not outlive the gesture');

	// The abandoned pointer is inert, but the element is ready for a new one
	el.fire('pointermove', ev({ clientY: 200, timeStamp: 40 }));
	el.fire('pointerup', ev({ clientY: 200, timeStamp: 60 }));
	assert.deepEqual(calls, ['start', 'move']);

	el.fire('pointerdown', ev({ clientY: 300, timeStamp: 80 }));
	el.fire('pointermove', ev({ clientY: 340, timeStamp: 100 }));
	assert.deepEqual(calls, ['start', 'move', 'start', 'move']);

	gesture.destroy();
});

test('DragGesture cancel is a no-op when no gesture is running', () => {
	const el = new StubElement();
	const gesture = new DragGesture(el, {
		onEnd: () => assert.fail('cancel must never report a release'),
	});

	assert.doesNotThrow(() => gesture.cancel());
	assert.equal(el.capturedPointerId, null);

	gesture.destroy();
});

test('DragGesture destroy removes every listener', () => {
	const el = new StubElement();
	const gesture = new DragGesture(el);

	assert.deepEqual([...el.listeners.keys()].sort(), [
		'pointercancel',
		'pointerdown',
		'pointermove',
		'pointerup',
	]);

	gesture.destroy();
	assert.equal(el.listeners.size, 0);
});
