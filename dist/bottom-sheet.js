(function(global, factory) {
	typeof exports === "object" && typeof module !== "undefined" ? factory(exports) : typeof define === "function" && define.amd ? define(["exports"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global.BottomSheet = {}));
})(this, function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
			const first = samples[0];
			const last = samples[samples.length - 1];
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
			if (!_.#captured && Math.abs(deltaY) > SLOP) {
				_.#captured = true;
				_.#el.setPointerCapture?.(event.pointerId);
			}
			_.#tracker.add(event.clientY, event.timeStamp);
			_.#onMove?.({
				event,
				deltaY,
				direction: deltaY < 0 ? "up" : "down",
				velocityY: _.#tracker.velocity
			});
		}
		#handlePointerEnd(event, cancelled) {
			const _ = this;
			if (!_.#active || event.pointerId !== _.#pointerId) return;
			_.#active = false;
			_.#captured = false;
			_.#onEnd?.({
				event,
				deltaY: event.clientY - _.#startY,
				velocityY: cancelled ? 0 : _.#tracker.velocity,
				duration: event.timeStamp - _.#startTime,
				cancelled
			});
			_.#pointerId = null;
		}
		destroy() {
			const _ = this;
			for (const [type, handler] of Object.entries(_.#handlers)) _.#el.removeEventListener(type, handler);
			_.#active = false;
			_.#captured = false;
			_.#pointerId = null;
			_.#tracker.reset();
		}
	};
	//#endregion
	//#region src/bottom-sheet.js
	/**
	* A throttle utility function to limit how often a function can be called
	* @param {Function} func - The function to throttle
	* @param {number} limit - The time limit in ms for the throttling
	* @returns {Function} A throttled function
	*/
	var throttle = (func, limit) => {
		let inThrottle;
		return function(...args) {
			if (!inThrottle) {
				func.apply(this, args);
				inThrottle = true;
				setTimeout(() => inThrottle = false, limit);
			}
		};
	};
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
		#panelRef = null;
		#dialogRef = null;
		#backdropBound = false;
		/**
		* Define which attributes should be observed for changes
		* @returns {string[]} List of attribute names to observe
		*/
		static get observedAttributes() {
			return ["max-display-width"];
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
			if (name === "max-display-width") if (newValue === null || newValue === "none") _.maxDisplayWidth = Infinity;
			else {
				const parsed = parseInt(newValue);
				_.maxDisplayWidth = !isNaN(parsed) ? parsed : Infinity;
			}
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
				windowResize: throttle(() => {
					if (window.innerWidth > _.maxDisplayWidth && _.panel?.isOpen) _.hide();
				}, 100),
				beforeShow: () => {
					const backdrop = _.backdrop;
					if (backdrop && !_.#backdropBound) {
						_.#gestures.push(new DragGesture(backdrop, _.#surfaceCallbacks("backdrop")));
						_.#backdropBound = true;
					}
					_.dialog?.classList.add("transitioning");
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
		* Hides the bottom sheet via dialog-panel
		*/
		hide() {
			if (this.dialog) this.dialog.style.transform = "";
			this.panel?.hide();
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
			_.#backdropBound = false;
			_.#panelRef?.addEventListener("beforeShow", _.#handlers.beforeShow);
			if (_.#dialogRef) _.#dialogRef.addEventListener("transitionend", _.#handlers.transitionEnd);
		}
		disconnectedCallback() {
			const _ = this;
			window.removeEventListener("resize", _.#handlers.windowResize);
			for (const gesture of _.#gestures) gesture.destroy();
			_.#gestures = [];
			if (_.content && _.#scrollVeto) _.content.removeEventListener("touchmove", _.#scrollVeto);
			_.#scrollVeto = null;
			_.#backdropBound = false;
			_.#drag = { active: false };
			_.#panelRef?.removeEventListener("beforeShow", _.#handlers.beforeShow);
			if (_.#dialogRef) _.#dialogRef.removeEventListener("transitionend", _.#handlers.transitionEnd);
			_.#panelRef = null;
			_.#dialogRef = null;
		}
		#surfaceCallbacks(surface) {
			const _ = this;
			return {
				onStart: () => _.#dragStart(surface),
				onMove: (info) => _.#dragMove(surface, info),
				onEnd: (info) => _.#dragEnd(surface, info)
			};
		}
		#dragStart(surface) {
			const _ = this;
			const state = _.panel?.getAttribute("state");
			if (_.panel?.hasAttribute("morph") && (state === "showing" || state === "hiding")) return;
			_.#drag = {
				active: true,
				claimed: false,
				surface,
				isAtTop: surface === "content" ? _.content?.scrollTop === 0 : true,
				direction: null
			};
			_.dialog?.classList.remove("transitioning");
		}
		/**
		* Applies resistance to a drag value to create a rubber-band effect
		* @param {number} value - The raw drag distance
		* @returns {number} The drag with resistance applied
		*/
		#applyResistance(value) {
			return Math.sqrt(value) * 10 * this.#overscrollResistance;
		}
		#dragMove(surface, { deltaY, direction }) {
			const _ = this;
			const drag = _.#drag;
			if (!drag.active) return;
			if (!drag.direction) drag.direction = direction;
			if (surface === "content" && (!drag.isAtTop || drag.direction === "up")) return;
			drag.claimed = true;
			if (deltaY < 0) {
				const resistedDelta = _.#applyResistance(-deltaY);
				if (_.dialog) _.dialog.style.transform = `translate3d(0, ${-resistedDelta}px, 0)`;
			} else if (_.dialog) _.dialog.style.transform = `translate3d(0, ${deltaY}px, 0)`;
		}
		#dragEnd(surface, { deltaY, velocityY, duration, cancelled }) {
			const _ = this;
			const drag = _.#drag;
			if (!drag.active) return;
			_.#drag = { active: false };
			if (surface === "backdrop" && Math.abs(deltaY) < 10 && duration < 300) {
				_.hide();
				return;
			}
			if (!drag.claimed) return;
			_.dialog?.classList.add("transitioning");
			const flick = !cancelled && velocityY > _.#flickVelocity;
			const pastThreshold = !cancelled && deltaY > _.#dragThreshold && velocityY > -.05;
			if (flick || pastThreshold) _.hide();
			else if (_.dialog) _.dialog.style.transform = "";
		}
		/**
		* Runs when a CSS transition finishes
		* @param {TransitionEvent} e - The transition event
		*/
		#handleTransitionEnd(e) {
			if (e.target === this.dialog && e.propertyName === "transform") this.dialog.classList.remove("transitioning");
		}
	};
	var BottomSheetContent = class extends HTMLElement {
		constructor() {
			super();
		}
	};
	var BottomSheetHeader = class extends HTMLElement {
		constructor() {
			super();
		}
	};
	var BottomSheetFooter = class extends HTMLElement {
		constructor() {
			super();
		}
	};
	if (!customElements.get("bottom-sheet")) customElements.define("bottom-sheet", BottomSheet);
	if (!customElements.get("bottom-sheet-content")) customElements.define("bottom-sheet-content", BottomSheetContent);
	if (!customElements.get("bottom-sheet-header")) customElements.define("bottom-sheet-header", BottomSheetHeader);
	if (!customElements.get("bottom-sheet-footer")) customElements.define("bottom-sheet-footer", BottomSheetFooter);
	//#endregion
	exports.BottomSheet = BottomSheet;
	exports.BottomSheetContent = BottomSheetContent;
	exports.BottomSheetFooter = BottomSheetFooter;
	exports.BottomSheetHeader = BottomSheetHeader;
});

//# sourceMappingURL=bottom-sheet.js.map