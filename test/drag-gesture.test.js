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
	el.fire('pointermove', ev({ clientY: 120, timeStamp: 110 }));
	el.fire('pointerup', ev({ clientY: 130, timeStamp: 130 }));

	assert.equal(el.capturedPointerId, 1);
	assert.equal(calls[0][0], 'start');
	assert.equal(calls[0][1].y, 20);
	assert.equal(calls[1][0], 'move');
	assert.equal(calls[1][1].deltaY, 100);
	assert.equal(calls[1][1].direction, 'down');
	assert.ok(calls[1][1].velocityY > 0.9);
	assert.equal(calls[2][0], 'end');
	assert.equal(calls[2][1].deltaY, 110);
	assert.equal(calls[2][1].duration, 120);
	assert.ok(calls[2][1].velocityY > 0.9);
	assert.equal(calls[2][1].cancelled, false);

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
