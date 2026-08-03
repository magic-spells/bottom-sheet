//#region node_modules/@magic-spells/physics-engine/dist/physics-engine.esm.js
var f = class {
	#t;
	constructor() {
		this.#t = /* @__PURE__ */ new Map();
	}
	/**
	* Binds a listener to an event.
	* @param {string} event - The event to bind the listener to.
	* @param {Function} listener - The listener function to bind.
	* @returns {EventEmitter} The current instance for chaining.
	* @throws {TypeError} If the listener is not a function.
	*/
	on(t, i) {
		if (typeof i != "function") throw new TypeError("Listener must be a function");
		const s = this.#t.get(t) || [];
		return s.includes(i) || s.push(i), this.#t.set(t, s), this;
	}
	/**
	* Unbinds a listener from an event.
	* @param {string} event - The event to unbind the listener from.
	* @param {Function} listener - The listener function to unbind.
	* @returns {EventEmitter} The current instance for chaining.
	*/
	off(t, i) {
		const s = this.#t.get(t);
		if (!s) return this;
		const e = s.indexOf(i);
		return e !== -1 && (s.splice(e, 1), s.length === 0 ? this.#t.delete(t) : this.#t.set(t, s)), this;
	}
	/**
	* Triggers an event and calls all bound listeners.
	* @param {string} event - The event to trigger.
	* @param {...*} args - Arguments to pass to the listener functions.
	* @returns {boolean} True if the event had listeners, false otherwise.
	*/
	emit(t, ...i) {
		const s = this.#t.get(t);
		if (!s || s.length === 0) return !1;
		const e = s.slice();
		for (let n = 0, r = e.length; n < r; ++n) try {
			e[n].apply(this, i);
		} catch (h) {
			console.error(`Error in listener for event '${t}':`, h);
		}
		return !0;
	}
	/**
	* Removes all listeners for a specific event or all events.
	* @param {string} [event] - The event to remove listeners from. If not provided, removes all listeners.
	* @returns {EventEmitter} The current instance for chaining.
	*/
	removeAllListeners(t) {
		return t ? this.#t.delete(t) : this.#t.clear(), this;
	}
};
var b = class extends f {
	#t;
	#m;
	#o;
	#n;
	#s;
	#e;
	#r;
	#h;
	#i;
	/**
	* Creates an instance of PhysicsEngine.
	* @param {number} [attraction=0.026] - The attraction value for physics-based animation (0 < attraction < 1).
	* @param {number} [friction=0.28] - The friction value for physics-based animation (0 < friction < 1).
	*/
	constructor({ attraction: t = .026, friction: i = .28 } = {}) {
		if (super(), !Number.isFinite(t) || t <= 0 || t >= 1) throw new Error("Attraction must be a number between 0 and 1 (exclusive).");
		if (!Number.isFinite(i) || i <= 0 || i >= 1) throw new Error("Friction must be a number between 0 and 1 (exclusive).");
		this.#t = t, this.#m = i, this.#o = 1 - i, this.#n = 0, this.#s = 0, this.#e = 0, this.isAnimating = !1, this.#r = null, this.#h = 0, this.#i = null;
	}
	/**
	* Animates from a start value to an end value.
	* @param {number} startValue - The starting value.
	* @param {number} endValue - The target value.
	* @param {number} [velocity=0] - Initial velocity.
	* @returns {Promise} Resolves when animation completes or is stopped.
	*/
	animateTo(t, i, s = 0) {
		if (!Number.isFinite(t)) throw new Error("startValue must be a finite number.");
		if (!Number.isFinite(i)) throw new Error("endValue must be a finite number.");
		if (!Number.isFinite(s)) throw new Error("velocity must be a finite number.");
		if (this.isAnimating && this.#u(), t === i && s === 0) return this.emit("change", {
			position: i,
			progress: 1
		}), this.emit("complete", {
			position: i,
			progress: 1
		}), Promise.resolve();
		this.#s = t, this.#e = i, this.#n = s, this.isAnimating = !0, this.#r = null;
		const e = ++this.#h;
		return new Promise((n) => {
			this.#i = n;
			const r = (h) => {
				if (e !== this.#h || !this.isAnimating) return;
				if (this.#r === null) {
					this.#r = h, requestAnimationFrame(r);
					return;
				}
				const o = Math.min(h - this.#r, 64) / 16.66;
				this.#r = h;
				const l = (this.#e - this.#s) * this.#t;
				this.#n += l * o, this.#n *= Math.pow(this.#o, o), this.#s += this.#n * o;
				const m = this.#e - t;
				let u = 0;
				if (m !== 0 && (u = (this.#s - t) / m), this.emit("change", {
					position: this.#s,
					progress: u
				}), Math.abs(this.#s - this.#e) < .01 && Math.abs(this.#n) < .01) {
					this.isAnimating = !1;
					const c = this.#i;
					this.#i = null, this.emit("change", {
						position: this.#e,
						progress: 1
					}), this.emit("complete", {
						position: this.#e,
						progress: 1
					}), c();
					return;
				}
				requestAnimationFrame(r);
			};
			requestAnimationFrame(r);
		});
	}
	/**
	* Internal stop — resolves Promise without emitting 'stop'.
	* Used when a new animateTo supersedes the current one.
	*/
	#u() {
		this.isAnimating = !1, this.#i && (this.#i(), this.#i = null);
	}
	/**
	* Stops the ongoing animation.
	* Emits 'stop' event and resolves the pending Promise.
	*/
	stop() {
		if (!this.isAnimating) return;
		this.isAnimating = !1, this.#h++;
		const t = this.#i;
		this.#i = null, this.emit("stop", { position: this.#s }), t && t();
	}
	/**
	* Sets the attraction value
	* @param {number} attraction - The attraction value for physics-based animation (0 < attraction < 1).
	*/
	setAttraction(t) {
		if (!Number.isFinite(t) || t <= 0 || t >= 1) throw new Error("Attraction must be a number between 0 and 1 (exclusive).");
		this.#t = t;
	}
	/**
	* Sets the friction value
	* @param {number} friction - The friction value for physics-based animation (0 < friction < 1).
	*/
	setFriction(t) {
		if (!Number.isFinite(t) || t <= 0 || t >= 1) throw new Error("Friction must be a number between 0 and 1 (exclusive).");
		this.#m = t, this.#o = 1 - t;
	}
};
//#endregion
//#region src/drag-gesture.js
var VelocityTracker = class {
	#samples = [];
	#windowMs;
	constructor(windowMs = 100) {
		this.#windowMs = windowMs;
	}
	add(y, t) {
		const _ = this;
		_.#samples.push({
			y,
			t
		});
		const cutoff = t - _.#windowMs;
		while (_.#samples.length > 2 && _.#samples[0].t < cutoff) _.#samples.shift();
	}
	get velocity() {
		const samples = this.#samples;
		if (samples.length < 2) return 0;
		const last = samples[samples.length - 1];
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
};
var SLOP = 5;
var DragGesture = class {
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
			pointercancel: (event) => _.#handlePointerEnd(event, true)
		};
		for (const [type, handler] of Object.entries(_.#handlers)) el.addEventListener(type, handler);
	}
	#handlePointerDown(event) {
		const _ = this;
		if (!event.isPrimary || _.#active && _.#captured) return;
		_.#active = true;
		_.#captured = false;
		_.#pointerId = event.pointerId;
		_.#startY = event.clientY;
		_.#lastY = event.clientY;
		_.#startTime = event.timeStamp;
		_.#tracker.reset();
		_.#tracker.add(event.clientY, event.timeStamp);
		_.#onStart?.({
			event,
			y: event.clientY
		});
	}
	#handlePointerMove(event) {
		const _ = this;
		if (!_.#active || event.pointerId !== _.#pointerId) return;
		const deltaY = event.clientY - _.#startY;
		const moveY = event.clientY - _.#lastY;
		_.#lastY = event.clientY;
		if (!_.#captured && Math.abs(deltaY) > SLOP) {
			_.#captured = true;
			_.#el.setPointerCapture?.(event.pointerId);
		}
		_.#tracker.add(event.clientY, event.timeStamp);
		_.#onMove?.({
			event,
			deltaY,
			moveY,
			direction: deltaY < 0 ? "up" : "down",
			velocityY: _.#tracker.velocity
		});
	}
	#handlePointerEnd(event, cancelled) {
		const _ = this;
		if (!_.#active || event.pointerId !== _.#pointerId) return;
		_.#active = false;
		_.#captured = false;
		_.#tracker.add(event.clientY, event.timeStamp);
		_.#onEnd?.({
			event,
			deltaY: event.clientY - _.#startY,
			velocityY: cancelled ? 0 : _.#tracker.velocity,
			duration: event.timeStamp - _.#startTime,
			cancelled
		});
		_.#pointerId = null;
	}
	/**
	* Abandons a gesture in place, leaving the element ready for a fresh one.
	*
	* Deliberately silent: onEnd is never fired. This exists for a teardown the
	* user did not ask for — the surface is being closed out from under a finger
	* that has not lifted — and every release rule downstream would otherwise act
	* on a lift that never happened.
	*/
	cancel() {
		const _ = this;
		if (_.#captured && _.#pointerId !== null) try {
			_.#el.releasePointerCapture?.(_.#pointerId);
		} catch {}
		_.#active = false;
		_.#captured = false;
		_.#pointerId = null;
		_.#tracker.reset();
	}
	destroy() {
		const _ = this;
		for (const [type, handler] of Object.entries(_.#handlers)) _.#el.removeEventListener(type, handler);
		_.cancel();
	}
};
/**
* Parses a snap-points attribute into a sorted list of dvh percentages
* @param {string|null} value - Comma or whitespace separated numbers
* @returns {number[]} Ascending, deduped percentages; empty when nothing parses
*/
var parseSnapPoints = (value) => {
	if (!value) return [];
	const seen = /* @__PURE__ */ new Set();
	for (const token of String(value).split(/[\s,]+/)) {
		if (token === "") continue;
		const parsed = Number(token);
		if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) continue;
		seen.add(parsed);
	}
	return [...seen].sort((a, b) => a - b);
};
/**
* Chooses the snap a released gesture should land on. A flick steps exactly one
* snap in its own direction; anything slower lands on whichever snap is nearest.
* @param {Object} options
* @param {number} options.currentPx - Panel height at the moment of release
* @param {number} options.velocityY - Release velocity in px/ms, positive downward
* @param {number[]} options.snapsPx - Ascending snap heights in pixels
* @param {number} options.flickVelocity - Speed that counts as a flick
* @returns {number|null} Target height in pixels, or null to dismiss
*/
var resolveSnapTarget = ({ currentPx, velocityY, snapsPx, flickVelocity }) => {
	if (!snapsPx.length) return null;
	if (velocityY > flickVelocity) {
		const below = snapsPx.filter((px) => px < currentPx - 1);
		return below.length ? below[below.length - 1] : null;
	}
	if (velocityY < -flickVelocity) return snapsPx.find((px) => px > currentPx + 1) ?? snapsPx[snapsPx.length - 1];
	return snapsPx.reduce((best, px) => Math.abs(px - currentPx) < Math.abs(best - currentPx) ? px : best);
};
/**
* Maps a visible extent onto dismissal progress, which is what the scrim tracks.
*
* One clamp covers every case. `restExtent` is the sheet's resting extent — the
* SHORTEST snap on a snapping sheet, the panel height on a binary one — so any
* position at or above rest saturates at exactly 1, and only travel below it
* maps [rest -> off screen] onto [1 -> 0]. That is what leaves snap-to-snap
* travel and upward rubber-band overscroll alone without a single branch: a
* resize is not a dismissal, and only the gesture past the shortest snap is.
*
* A degenerate rest extent returns 1, not 0. An unmeasurable sheet is a sheet
* that has not laid out yet, and blanking the scrim is a far worse answer than
* leaving it alone.
* @param {number} visibleExtent - On-screen height along the dismiss axis, in pixels
* @param {number} restExtent - Resting height in pixels
* @returns {number} Progress in [0, 1]; 1 means fully on screen
*/
var dismissProgress = (visibleExtent, restExtent) => {
	if (!Number.isFinite(restExtent) || restExtent <= 0) return 1;
	if (!Number.isFinite(visibleExtent)) return 1;
	return Math.min(1, Math.max(0, visibleExtent / restExtent));
};
//#endregion
//#region src/bottom-sheet.js
var FRAME_MS = 16.66;
var VELOCITY_BOOST = 1.1;
/**
* BottomSheet class that manages drag gestures and delegates
* show/hide to a parent <dialog-panel> element.
*
* Expected HTML structure:
* <dialog-panel>
*   <dialog>
*     <bottom-sheet>
*       <bottom-sheet-header>...</bottom-sheet-header>
*       <bottom-sheet-content>...</bottom-sheet-content>
*     </bottom-sheet>
*   </dialog>
* </dialog-panel>
*/
var BottomSheet = class extends HTMLElement {
	#handlers = {};
	#gestures = [];
	#drag = { active: false };
	#scrollVeto = null;
	#overscrollResistance = .1;
	#dragThreshold = 100;
	#flickVelocity = .5;
	#maxDisplayWidth = Infinity;
	#snapPoints = [];
	#snap = null;
	#engine = null;
	#springTarget = null;
	#reflectingSnap = false;
	#backdropProgress = null;
	#panelRef = null;
	#dialogRef = null;
	/**
	* Define which attributes should be observed for changes
	* @returns {string[]} List of attribute names to observe
	*/
	static get observedAttributes() {
		return [
			"max-display-width",
			"snap-points",
			"snap",
			"spring"
		];
	}
	/**
	* Called when observed attributes change
	* @param {string} name - The name of the attribute that changed
	* @param {string} oldValue - The previous value of the attribute
	* @param {string} newValue - The new value of the attribute
	*/
	attributeChangedCallback(name, oldValue, newValue) {
		const _ = this;
		if (oldValue === newValue) return;
		if (name === "max-display-width") {
			if (newValue === null || newValue === "none") _.maxDisplayWidth = Infinity;
			else {
				const trimmed = newValue.trim();
				const parsed = Number(trimmed);
				_.maxDisplayWidth = trimmed === "" || !Number.isFinite(parsed) ? Infinity : parsed;
			}
			return;
		}
		if (name === "snap-points") {
			_.#snapPoints = parseSnapPoints(newValue);
			if (newValue !== null && _.#snapPoints.length === 0) {
				_.removeAttribute("snap-points");
				return;
			}
			_.#supersedeSettle();
			return;
		}
		if (name === "snap") {
			const parsed = Number(newValue);
			_.#snap = newValue !== null && Number.isFinite(parsed) ? parsed : null;
			if (_.#reflectingSnap) _.#applyRestingHeight();
			else _.#supersedeSettle();
			return;
		}
		if (name === "spring") {
			_.#supersedeSettle();
			_.#engine = null;
		}
	}
	/**
	* Whether the sheet settles on a spring. On by default — `spring="none"`
	* is the opt-out, matching how `max-display-width` spells the same idea.
	* @returns {boolean}
	*/
	get #springEnabled() {
		return this.getAttribute("spring") !== "none";
	}
	/**
	* The engine, built on first use and rebuilt whenever the tuning changes.
	* Lazy rather than eager because `snap-points` can be set at any time, and
	* a sheet that never settles should never construct one.
	* @returns {PhysicsEngine}
	*/
	#ensureEngine() {
		const _ = this;
		if (_.#engine) return _.#engine;
		const [attraction, friction] = String(_.getAttribute("spring") ?? "").split(/[\s,]+/).map(Number);
		const options = {
			attraction: .065,
			friction: .3
		};
		if (Number.isFinite(attraction) && attraction > 0 && attraction < 1) options.attraction = attraction;
		if (Number.isFinite(friction) && friction > 0 && friction < 1) options.friction = friction;
		_.#engine = new b(options);
		_.#engine.on("change", ({ position }) => {
			const dialog = _.dialog;
			if (dialog && !_.#drag.active) dialog.style.height = `${position}px`;
		});
		_.#engine.on("complete", () => {
			if (_.#springTarget === null) return;
			_.#springTarget = null;
			_.#applyRestingHeight();
		});
		return _.#engine;
	}
	/**
	* Halts a running settle without letting its completion write a height
	*/
	#stopSpring() {
		this.#springTarget = null;
		this.#engine?.stop();
	}
	/**
	* Hands a settle back to the resting snap because external state has moved
	* out from under it.
	*
	* The engine emits `stop` rather than `complete` when it is halted, so
	* nothing restores the height on its own — stopping alone stranded the sheet
	* at whatever pixel the last frame happened to write, with `snap` reporting
	* a value the sheet was not at. Finishing on the CSS clock keeps the
	* interruption visible rather than teleporting.
	*/
	#supersedeSettle() {
		const _ = this;
		const wasSettling = _.#springTarget !== null;
		_.#stopSpring();
		if (wasSettling) _.dialog?.classList.add("transitioning", "snapping");
		_.#applyRestingHeight();
	}
	/**
	* Get the maximum display width
	* @returns {number} The maximum width in pixels where the bottom sheet is shown
	*/
	get maxDisplayWidth() {
		return this.#maxDisplayWidth;
	}
	/**
	* Set the maximum display width and reflect to attribute
	* @param {number} value - The maximum width in pixels where the bottom sheet is shown
	*/
	set maxDisplayWidth(value) {
		const _ = this;
		_.#maxDisplayWidth = value;
		if (value === Infinity) _.removeAttribute("max-display-width");
		else _.setAttribute("max-display-width", value);
	}
	/**
	* Get the declared snap points
	* @returns {number[]} Ascending dvh percentages; empty when the sheet is binary
	*/
	get snapPoints() {
		return [...this.#snapPoints];
	}
	/**
	* Set the snap points and reflect to attribute
	* @param {number[]|string|null} value - Percentages of the viewport height
	*/
	set snapPoints(value) {
		const _ = this;
		const list = Array.isArray(value) ? value.join(",") : value ?? "";
		if (String(list).trim() === "") _.removeAttribute("snap-points");
		else _.setAttribute("snap-points", list);
	}
	/**
	* Get the snap the sheet is currently resting at. Reflects only on commit,
	* so it holds the last settled value for the duration of a drag.
	* @returns {number|null} The snap in dvh percent, or null when the sheet is binary
	*/
	get snap() {
		return this.#activeSnap;
	}
	/**
	* Set the resting snap and reflect to attribute
	* @param {number|null} value - A declared snap in dvh percent
	*/
	set snap(value) {
		const _ = this;
		if (value === null) _.removeAttribute("snap");
		else _.setAttribute("snap", value);
	}
	/**
	* Animates the sheet to a declared snap point. Undeclared values are ignored.
	* @param {number} value - A snap in dvh percent
	*/
	snapTo(value) {
		const _ = this;
		const target = Number(value);
		if (!_.#snapPoints.includes(target)) return;
		_.dialog?.classList.add("transitioning");
		_.#commitSnap(target);
	}
	/**
	* The snap currently in effect, falling back to the shortest declared snap
	* when the author has not pinned one
	* @returns {number|null}
	*/
	get #activeSnap() {
		const _ = this;
		if (!_.#snapPoints.length) return null;
		if (_.#snap !== null && _.#snapPoints.includes(_.#snap)) return _.#snap;
		return _.#snapPoints[0];
	}
	/**
	* Find parent dialog-panel element
	* @returns {HTMLElement|null}
	*/
	get panel() {
		return this.closest("dialog-panel");
	}
	/**
	* Get the dialog element
	* @returns {HTMLDialogElement|null}
	*/
	get dialog() {
		return this.closest("dialog");
	}
	/**
	* Get the header element
	* @returns {HTMLElement|null}
	*/
	get header() {
		return this.querySelector("bottom-sheet-header");
	}
	/**
	* Get the content element
	* @returns {HTMLElement|null}
	*/
	get content() {
		return this.querySelector("bottom-sheet-content");
	}
	/**
	* Get the footer element
	* @returns {HTMLElement|null}
	*/
	get footer() {
		return this.querySelector("bottom-sheet-footer");
	}
	/**
	* Get the backdrop element from dialog-panel
	* @returns {HTMLElement|null}
	*/
	get backdrop() {
		return this.panel?.querySelector("dialog-backdrop");
	}
	constructor() {
		super();
		const _ = this;
		_.#handlers = {
			transitionEnd: _.#handleTransitionEnd.bind(_),
			windowResize: () => {
				if (window.innerWidth > _.maxDisplayWidth && _.panel?.isOpen) _.hide();
			},
			beforeShow: () => {
				_.#applyRestingHeight();
				_.dialog?.classList.remove("snapping");
				_.dialog?.classList.remove("dragging");
				_.#syncBackdrop(null);
				_.dialog?.classList.add("transitioning");
			},
			beforeHide: () => {
				queueMicrotask(() => {
					if (_.#panelRef?.getAttribute("state") !== "hiding") return;
					_.#teardownForClose();
				});
			}
		};
	}
	/**
	* Shows the bottom sheet via dialog-panel
	* @param {HTMLElement} [triggerEl] - The element that triggered the show
	*/
	show(triggerEl) {
		const _ = this;
		if (window.innerWidth > _.maxDisplayWidth) return;
		_.panel?.show(triggerEl);
	}
	/**
	* Hides the bottom sheet via dialog-panel.
	*
	* The panel is asked first, because it can refuse — a `beforeHide` handler
	* may cancel, and it also rejects a close that arrives while the sheet is
	* still opening. Tearing the settle down before asking left a refused close
	* with a dead spring and the drag's inline pixels still on the dialog, so
	* the sheet stayed frozen wherever the last frame had painted it.
	*
	* @returns {boolean} False if the panel refused the close
	*/
	hide() {
		const _ = this;
		if (_.panel?.hide() === false) {
			if (_.dialog && _.#springTarget === null) {
				_.dialog.classList.add("transitioning");
				_.dialog.style.transform = "";
			}
			if (_.#springTarget === null) _.#applyRestingHeight();
			_.dialog?.classList.remove("dragging");
			_.#syncBackdrop(null);
			return false;
		}
		_.#stopSpring();
		if (_.dialog) {
			_.dialog.style.transform = "";
			_.dialog.classList.remove("snapping");
			_.dialog.classList.remove("dragging");
		}
		_.#syncBackdrop(null);
		return true;
	}
	/**
	* Hands the sheet back to the panel for a close it did not start.
	*
	* Idempotent by construction — stopping a stopped spring, clearing a cleared
	* transform and removing an absent class are all no-ops — because a close
	* that does come through hide() fires `beforeHide` as well and runs this a
	* second time.
	*
	* `transitioning` is deliberately left alone: the [state='hiding'] rule
	* carries its own transition, and removing the class mid-close would strand
	* a snap-back that was already running under it.
	*/
	#teardownForClose() {
		const _ = this;
		_.#stopSpring();
		for (const gesture of _.#gestures) gesture.cancel();
		_.#drag = { active: false };
		if (_.dialog) {
			_.dialog.style.transform = "";
			_.dialog.classList.remove("snapping");
			_.dialog.classList.remove("dragging");
		}
		_.#syncBackdrop(null);
	}
	connectedCallback() {
		const _ = this;
		_.#panelRef = _.panel;
		_.#dialogRef = _.dialog;
		window.addEventListener("resize", _.#handlers.windowResize);
		if (_.header) _.#gestures.push(new DragGesture(_.header, _.#surfaceCallbacks("header")));
		if (_.footer) _.#gestures.push(new DragGesture(_.footer, _.#surfaceCallbacks("footer")));
		if (_.content) {
			_.#gestures.push(new DragGesture(_.content, _.#surfaceCallbacks("content")));
			_.#scrollVeto = (event) => {
				if (_.#drag.active && _.#drag.claimed && event.cancelable) event.preventDefault();
			};
			_.content.addEventListener("touchmove", _.#scrollVeto, { passive: false });
		}
		_.#panelRef?.addEventListener("beforeShow", _.#handlers.beforeShow);
		_.#panelRef?.addEventListener("beforeHide", _.#handlers.beforeHide);
		if (_.#dialogRef) _.#dialogRef.addEventListener("transitionend", _.#handlers.transitionEnd);
		_.#applyRestingHeight();
	}
	disconnectedCallback() {
		const _ = this;
		window.removeEventListener("resize", _.#handlers.windowResize);
		for (const gesture of _.#gestures) gesture.destroy();
		_.#gestures = [];
		if (_.content && _.#scrollVeto) _.content.removeEventListener("touchmove", _.#scrollVeto);
		_.#scrollVeto = null;
		_.#drag = { active: false };
		_.#backdropProgress = null;
		_.#panelRef?.style.removeProperty("--bs-backdrop-progress");
		_.#dialogRef?.classList.remove("dragging");
		_.#stopSpring();
		_.#engine?.removeAllListeners();
		_.#engine = null;
		_.#panelRef?.removeEventListener("beforeShow", _.#handlers.beforeShow);
		_.#panelRef?.removeEventListener("beforeHide", _.#handlers.beforeHide);
		if (_.#dialogRef) _.#dialogRef.removeEventListener("transitionend", _.#handlers.transitionEnd);
		_.#panelRef = null;
		_.#dialogRef = null;
	}
	/**
	* Writes the current snap to the dialog as a dvh height. Keeping the resting
	* value in dvh rather than pixels is what makes viewport resizes free.
	*/
	#applyRestingHeight() {
		const _ = this;
		const dialog = _.dialog;
		if (!dialog) return;
		if (_.#springTarget !== null) return;
		const snap = _.#activeSnap;
		dialog.style.height = snap === null ? "" : `${snap}dvh`;
	}
	/**
	* Publishes how much of the sheet is still on screen as
	* `--bs-backdrop-progress`, which the overlay reads for its opacity.
	*
	* Written on the `<dialog-panel>`, which is the lowest common ancestor of the
	* two things that read it: the `<dialog-backdrop>` overlay and the sheet's own
	* subtree. The overlay is a SIBLING of the dialog, so a dialog-level write
	* never reaches it, and the documented contract — that anything inside the
	* sheet can read the token — has to keep working. One write satisfies both.
	*
	* The saturated case deliberately REMOVES the token rather than writing `1`:
	* an absent token and the CSS fallback say the same thing, and a custom
	* property invalidates the subtree it lands on — which includes the
	* consumer's scrolling list. Skipping it keeps snap-to-snap travel, upward
	* overscroll, and rest entirely off that path.
	*
	* Only a live drag calls this. A spring settle never needs to: the engine
	* only runs when there is height left to travel, and height travel only
	* exists at or above the shortest snap, where progress is pinned at 1. A
	* release from below that snap has no height left and takes the CSS clock
	* (see #commitSnap's heightAtTarget), so there is nothing here to animate.
	* @param {number|null} progress - Dismissal progress, or null to clear
	*/
	#syncBackdrop(progress) {
		const _ = this;
		const panel = _.#panelRef;
		if (!panel) return;
		if (progress === null || !(progress < 1)) {
			if (_.#backdropProgress === null) return;
			_.#backdropProgress = null;
			panel.style.removeProperty("--bs-backdrop-progress");
			return;
		}
		const value = Math.max(0, progress).toFixed(3);
		if (value === _.#backdropProgress) return;
		_.#backdropProgress = value;
		panel.style.setProperty("--bs-backdrop-progress", value);
	}
	/**
	* Resolves the declared snaps to pixels against the current viewport
	* @returns {number[]} Ascending snap heights in pixels
	*/
	#snapsPx() {
		return this.#snapPoints.map((value) => value / 100 * window.innerHeight);
	}
	#surfaceCallbacks(surface) {
		const _ = this;
		return {
			onStart: () => _.#dragStart(),
			onMove: (info) => _.#dragMove(surface, info),
			onEnd: (info) => _.#dragEnd(surface, info)
		};
	}
	#dragStart() {
		const _ = this;
		const state = _.panel?.getAttribute("state");
		if (_.panel?.hasAttribute("morph") && (state === "showing" || state === "hiding")) return;
		_.#stopSpring();
		const dialog = _.dialog;
		const startHeight = dialog?.getBoundingClientRect().height ?? 0;
		if (dialog && _.#snapPoints.length) dialog.style.height = `${startHeight}px`;
		const computedTransform = dialog && typeof window.getComputedStyle === "function" ? window.getComputedStyle(dialog).transform : "";
		const normalizedTransform = computedTransform?.replace(/\s+/g, "");
		if (dialog && computedTransform && ![
			"none",
			"matrix(1,0,0,1,0,0)",
			"matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)"
		].includes(normalizedTransform)) dialog.style.transform = computedTransform;
		_.#drag = {
			active: true,
			claimed: false,
			claimOffset: 0,
			startHeight,
			belowLowest: 0
		};
		dialog?.classList.remove("transitioning", "snapping", "dragging");
	}
	/**
	* Applies resistance to a drag value to create a rubber-band effect
	* @param {number} value - The raw drag distance
	* @returns {number} The drag with resistance applied
	*/
	#applyResistance(value) {
		return Math.sqrt(value) * 10 * this.#overscrollResistance;
	}
	/**
	* Decides whether the panel takes a gesture over from the content scroller.
	* Re-evaluated on every move until it succeeds, so the handoff can happen
	* part way through a single continuous drag.
	* @param {string} surface - The surface the gesture started on
	* @param {number} moveY - Instantaneous travel, positive downward
	* @returns {boolean}
	*/
	#shouldClaim(surface, moveY) {
		const _ = this;
		if (surface !== "content") return true;
		if (moveY === 0) return false;
		if (moveY > 0) return _.content?.scrollTop === 0;
		const snaps = _.#snapPoints;
		return snaps.length > 0 && _.#activeSnap < snaps[snaps.length - 1];
	}
	#dragMove(surface, { deltaY, moveY }) {
		const _ = this;
		const drag = _.#drag;
		if (!drag.active) return;
		if (!drag.claimed) {
			if (!_.#shouldClaim(surface, moveY)) return;
			drag.claimed = true;
			drag.claimOffset = deltaY;
			_.dialog?.classList.add("dragging");
		}
		const travel = deltaY - drag.claimOffset;
		if (_.#snapPoints.length) _.#moveBySnap(travel);
		else _.#moveByTransform(travel);
	}
	/**
	* Drives a snapping sheet by its height, so the footer stays pinned and the
	* scroll region always matches what is actually on screen
	* @param {number} travel - Claimed drag distance, positive downward
	*/
	#moveBySnap(travel) {
		const _ = this;
		const dialog = _.dialog;
		if (!dialog) return;
		const snapsPx = _.#snapsPx();
		const minPx = snapsPx[0];
		const maxPx = snapsPx[snapsPx.length - 1];
		const height = _.#drag.startHeight - travel;
		if (height > maxPx) {
			dialog.style.height = `${maxPx + _.#applyResistance(height - maxPx)}px`;
			dialog.style.transform = "";
			_.#drag.belowLowest = 0;
			_.#syncBackdrop(1);
			return;
		}
		if (height < minPx) {
			const below = minPx - height;
			dialog.style.height = `${minPx}px`;
			dialog.style.transform = `translate3d(0, ${below}px, 0)`;
			_.#drag.belowLowest = below;
			_.#syncBackdrop(dismissProgress(minPx - below, minPx));
			return;
		}
		dialog.style.height = `${height}px`;
		dialog.style.transform = "";
		_.#drag.belowLowest = 0;
		_.#syncBackdrop(1);
	}
	/**
	* Drives a binary sheet by transform alone
	* @param {number} travel - Claimed drag distance, positive downward
	*/
	#moveByTransform(travel) {
		const _ = this;
		const dialog = _.dialog;
		if (!dialog) return;
		if (travel < 0) {
			const resisted = _.#applyResistance(-travel);
			dialog.style.transform = `translate3d(0, ${-resisted}px, 0)`;
			_.#syncBackdrop(1);
		} else {
			dialog.style.transform = `translate3d(0, ${travel}px, 0)`;
			_.#syncBackdrop(dismissProgress(_.#drag.startHeight - travel, _.#drag.startHeight));
		}
	}
	#dragEnd(surface, { deltaY, velocityY, cancelled }) {
		const _ = this;
		const drag = _.#drag;
		if (!drag.active) return;
		_.#drag = { active: false };
		_.dialog?.classList.add("transitioning");
		_.dialog?.classList.remove("dragging");
		_.#syncBackdrop(null);
		if (!drag.claimed) {
			if (_.dialog) _.dialog.style.transform = "";
			_.#applyRestingHeight();
			return;
		}
		if (_.#snapPoints.length) {
			_.#releaseToSnap(drag, velocityY, cancelled);
			return;
		}
		const travel = deltaY - drag.claimOffset;
		const flick = !cancelled && velocityY > _.#flickVelocity;
		const pastThreshold = !cancelled && travel > _.#dragThreshold && velocityY > -.05;
		if (flick || pastThreshold) _.hide();
		else if (_.dialog) _.dialog.style.transform = "";
	}
	/**
	* Settles a snapping sheet after release
	* @param {Object} drag - The drag state as it stood at release
	* @param {number} velocityY - Release velocity in px/ms, positive downward
	* @param {boolean} cancelled - Whether the pointer was cancelled
	*/
	#releaseToSnap(drag, velocityY, cancelled) {
		const _ = this;
		if (cancelled) {
			_.#commitSnap(_.#activeSnap);
			return;
		}
		if (drag.belowLowest > 0) {
			const flick = velocityY > _.#flickVelocity;
			const pastThreshold = drag.belowLowest > _.#dragThreshold && velocityY > -.05;
			if (flick || pastThreshold) _.hide();
			else _.#commitSnap(_.#snapPoints[0], velocityY);
			return;
		}
		const snapsPx = _.#snapsPx();
		const targetPx = resolveSnapTarget({
			currentPx: _.dialog?.getBoundingClientRect().height ?? 0,
			velocityY,
			snapsPx,
			flickVelocity: _.#flickVelocity
		});
		if (targetPx === null) {
			_.hide();
			return;
		}
		_.#commitSnap(_.#snapPoints[snapsPx.indexOf(targetPx)], velocityY);
	}
	/**
	* Settles the sheet on a snap, reflects it, and announces the change
	* @param {number} value - The snap in dvh percent
	*/
	#commitSnap(value, velocityY = 0) {
		const _ = this;
		const from = _.#activeSnap;
		const dialog = _.dialog;
		const targetPx = value / 100 * window.innerHeight;
		const startPx = dialog?.getBoundingClientRect().height ?? targetPx;
		const heightAtTarget = Math.abs(startPx - targetPx) <= 1;
		if (dialog && _.#springEnabled && !heightAtTarget) {
			const engine = _.#ensureEngine();
			dialog.classList.remove("transitioning", "snapping");
			dialog.style.transform = "";
			_.#springTarget = targetPx;
			const seed = -velocityY * FRAME_MS * VELOCITY_BOOST;
			engine.animateTo(startPx, targetPx, seed);
		} else if (dialog) {
			dialog.classList.add("snapping");
			dialog.style.transform = "";
			dialog.style.height = `${value}dvh`;
		}
		_.#snap = value;
		_.#reflectingSnap = true;
		_.setAttribute("snap", value);
		_.#reflectingSnap = false;
		if (from !== value) _.dispatchEvent(new CustomEvent("snapChange", {
			bubbles: true,
			detail: {
				from,
				to: value
			}
		}));
	}
	/**
	* Runs when a CSS transition finishes
	* @param {TransitionEvent} e - The transition event
	*/
	#handleTransitionEnd(e) {
		const _ = this;
		if (e.target === _.dialog && (e.propertyName === "transform" || e.propertyName === "height")) {
			if (e.propertyName === "height" && _.panel?.getAttribute("state") === "hiding") return;
			_.dialog.classList.remove("transitioning", "snapping");
		}
	}
};
var BottomSheetContent = class extends HTMLElement {};
var BottomSheetHeader = class extends HTMLElement {};
var BottomSheetFooter = class extends HTMLElement {};
if (!customElements.get("bottom-sheet")) customElements.define("bottom-sheet", BottomSheet);
if (!customElements.get("bottom-sheet-content")) customElements.define("bottom-sheet-content", BottomSheetContent);
if (!customElements.get("bottom-sheet-header")) customElements.define("bottom-sheet-header", BottomSheetHeader);
if (!customElements.get("bottom-sheet-footer")) customElements.define("bottom-sheet-footer", BottomSheetFooter);
//#endregion
export { BottomSheet, BottomSheetContent, BottomSheetFooter, BottomSheetHeader };

//# sourceMappingURL=bottom-sheet.esm.js.map