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

		const first = samples[0];
		const last = samples[samples.length - 1];
		const deltaTime = last.t - first.t;

		return deltaTime === 0 ? 0 : (last.y - first.y) / deltaTime;
	}

	reset() {
		this.#samples = [];
	}
}

class DragGesture {
	#active = false;
	#el;
	#handlers;
	#onStart;
	#onMove;
	#onEnd;
	#pointerId = null;
	#startY = 0;
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
		if (!event.isPrimary || _.#active) return;

		_.#active = true;
		_.#pointerId = event.pointerId;
		_.#startY = event.clientY;
		_.#startTime = event.timeStamp;
		_.#tracker.reset();
		_.#tracker.add(event.clientY, event.timeStamp);
		_.#el.setPointerCapture?.(event.pointerId);
		_.#onStart?.({ event, y: event.clientY });
	}

	#handlePointerMove(event) {
		const _ = this;
		if (!_.#active || event.pointerId !== _.#pointerId) return;

		const deltaY = event.clientY - _.#startY;
		_.#tracker.add(event.clientY, event.timeStamp);
		_.#onMove?.({
			event,
			deltaY,
			direction: deltaY < 0 ? 'up' : 'down',
			velocityY: _.#tracker.velocity,
		});
	}

	#handlePointerEnd(event, cancelled) {
		const _ = this;
		if (!_.#active || event.pointerId !== _.#pointerId) return;

		_.#active = false;
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
		_.#pointerId = null;
		_.#tracker.reset();
	}
}

export { DragGesture, VelocityTracker };
