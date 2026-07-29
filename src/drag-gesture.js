class VelocityTracker {
	#samples = [];
	#windowMs;

	constructor(windowMs = 100) {
		this.#windowMs = windowMs;
	}

	add(y, t) {
		const _ = this;
		_.#samples.push({ y, t });

		const cutoff = t - _.#windowMs;
		while (_.#samples.length > 2 && _.#samples[0].t < cutoff) {
			_.#samples.shift();
		}
	}

	get velocity() {
		const samples = this.#samples;
		if (samples.length < 2) return 0;

		const last = samples[samples.length - 1];

		// Walk back from the newest sample and stop at the first reversal.
		// Averaging the whole window instead would keep reporting the direction
		// a gesture came from: pull a fast upward drag back down and lift, and
		// the window still reads upward, so the sheet leaves in the opposite
		// direction to the finger that released it. Zero-length steps are
		// skipped rather than treated as a turn — a slow drag quantises to
		// them constantly.
		let direction = 0;
		let start = samples.length - 1;
		while (start > 0) {
			const step = Math.sign(samples[start].y - samples[start - 1].y);
			if (step !== 0) {
				if (direction === 0) direction = step;
				else if (step !== direction) break;
			}
			start--;
		}

		const first = samples[start];
		const deltaTime = last.t - first.t;

		return deltaTime === 0 ? 0 : (last.y - first.y) / deltaTime;
	}

	reset() {
		this.#samples = [];
	}
}

// Movement, in pixels, that separates a tap from a drag. Below this the
// pointer stays uncaptured so clicks compose on whatever the user pressed.
const SLOP = 5;

class DragGesture {
	#active = false;
	#captured = false;
	#el;
	#handlers;
	#onStart;
	#onMove;
	#onEnd;
	#pointerId = null;
	#startY = 0;
	#lastY = 0;
	#startTime = 0;
	#tracker = new VelocityTracker();

	constructor(el, { onStart, onMove, onEnd } = {}) {
		const _ = this;
		_.#el = el;
		_.#onStart = onStart;
		_.#onMove = onMove;
		_.#onEnd = onEnd;
		_.#handlers = {
			pointerdown: _.#handlePointerDown.bind(_),
			pointermove: _.#handlePointerMove.bind(_),
			pointerup: (event) => _.#handlePointerEnd(event, false),
			pointercancel: (event) => _.#handlePointerEnd(event, true),
		};

		for (const [type, handler] of Object.entries(_.#handlers)) {
			el.addEventListener(type, handler);
		}
	}

	#handlePointerDown(event) {
		const _ = this;
		// A captured gesture is guaranteed its own pointerup, so never let a
		// second pointer interrupt it. An uncaptured one may have been
		// abandoned outside the element, so allow it to be restarted.
		if (!event.isPrimary || (_.#active && _.#captured)) return;

		_.#active = true;
		_.#captured = false;
		_.#pointerId = event.pointerId;
		_.#startY = event.clientY;
		_.#lastY = event.clientY;
		_.#startTime = event.timeStamp;
		_.#tracker.reset();
		_.#tracker.add(event.clientY, event.timeStamp);
		// Deliberately no setPointerCapture here. Capturing on pointerdown
		// retargets pointerup to this element, so the browser composes the
		// click on it instead of the button the user pressed — which silently
		// breaks every interactive child of a drag surface.
		_.#onStart?.({ event, y: event.clientY });
	}

	#handlePointerMove(event) {
		const _ = this;
		if (!_.#active || event.pointerId !== _.#pointerId) return;

		const deltaY = event.clientY - _.#startY;
		// deltaY is cumulative, so its sign only ever reports where the pointer
		// sits relative to where it started. moveY reports which way it is
		// travelling right now, which is what a mid-gesture handoff needs.
		const moveY = event.clientY - _.#lastY;
		_.#lastY = event.clientY;

		// Once the pointer has clearly moved this is a drag, not a tap, so
		// capture to keep receiving events if it leaves the element.
		if (!_.#captured && Math.abs(deltaY) > SLOP) {
			_.#captured = true;
			_.#el.setPointerCapture?.(event.pointerId);
		}

		_.#tracker.add(event.clientY, event.timeStamp);
		_.#onMove?.({
			event,
			deltaY,
			moveY,
			direction: deltaY < 0 ? 'up' : 'down',
			velocityY: _.#tracker.velocity,
		});
	}

	#handlePointerEnd(event, cancelled) {
		const _ = this;
		if (!_.#active || event.pointerId !== _.#pointerId) return;

		_.#active = false;
		_.#captured = false;
		// The release is itself a sample. A stationary pointer fires no
		// pointermove, so without this the window never ages past the last
		// motion and a finger that stopped dead still reports a full flick.
		_.#tracker.add(event.clientY, event.timeStamp);
		_.#onEnd?.({
			event,
			deltaY: event.clientY - _.#startY,
			velocityY: cancelled ? 0 : _.#tracker.velocity,
			duration: event.timeStamp - _.#startTime,
			cancelled,
		});
		_.#pointerId = null;
	}

	destroy() {
		const _ = this;
		for (const [type, handler] of Object.entries(_.#handlers)) {
			_.#el.removeEventListener(type, handler);
		}
		_.#active = false;
		_.#captured = false;
		_.#pointerId = null;
		_.#tracker.reset();
	}
}

export { DragGesture, VelocityTracker };
