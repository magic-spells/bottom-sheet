import './bottom-sheet.css';
import { DragGesture } from './drag-gesture.js';

/**
 * A throttle utility function to limit how often a function can be called
 * @param {Function} func - The function to throttle
 * @param {number} limit - The time limit in ms for the throttling
 * @returns {Function} A throttled function
 */
const throttle = (func, limit) => {
	let inThrottle;
	return function (...args) {
		if (!inThrottle) {
			func.apply(this, args);
			inThrottle = true;
			setTimeout(() => (inThrottle = false), limit);
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
class BottomSheet extends HTMLElement {
	#handlers = {};
	#gestures = [];
	#drag = { active: false };
	#scrollVeto = null;

	// physics constants
	#overscrollResistance = 0.1;
	#dragThreshold = 100;
	#flickVelocity = 0.5;

	// private backing fields
	#maxDisplayWidth = Infinity;

	// cached references for reliable cleanup in disconnectedCallback
	#panelRef = null;
	#dialogRef = null;
	#backdropBound = false;

	/**
	 * Define which attributes should be observed for changes
	 * @returns {string[]} List of attribute names to observe
	 */
	static get observedAttributes() {
		return ['max-display-width'];
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

		if (name === 'max-display-width') {
			if (newValue === null || newValue === 'none') {
				_.maxDisplayWidth = Infinity;
			} else {
				const parsed = parseInt(newValue);
				_.maxDisplayWidth = !isNaN(parsed) ? parsed : Infinity;
			}
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

		if (value === Infinity) {
			_.removeAttribute('max-display-width');
		} else {
			_.setAttribute('max-display-width', value);
		}
	}

	/**
	 * Find parent dialog-panel element
	 * @returns {HTMLElement|null}
	 */
	get panel() {
		return this.closest('dialog-panel');
	}

	/**
	 * Get the dialog element
	 * @returns {HTMLDialogElement|null}
	 */
	get dialog() {
		return this.closest('dialog');
	}

	/**
	 * Get the header element
	 * @returns {HTMLElement|null}
	 */
	get header() {
		return this.querySelector('bottom-sheet-header');
	}

	/**
	 * Get the content element
	 * @returns {HTMLElement|null}
	 */
	get content() {
		return this.querySelector('bottom-sheet-content');
	}

	/**
	 * Get the backdrop element from dialog-panel
	 * @returns {HTMLElement|null}
	 */
	get backdrop() {
		return this.panel?.querySelector('dialog-backdrop');
	}

	constructor() {
		super();
		const _ = this;

		_.#handlers = {
			transitionEnd: _.#handleTransitionEnd.bind(_),
			windowResize: throttle(() => {
				if (window.innerWidth > _.maxDisplayWidth && _.panel?.isOpen) {
					_.hide();
				}
			}, 100),
			// Lazily bind the backdrop gesture on first show (it may not exist at connectedCallback)
			// Also add transitioning class so the open slide-up animates
			beforeShow: () => {
				const backdrop = _.backdrop;
				if (backdrop && !_.#backdropBound) {
					_.#gestures.push(new DragGesture(backdrop, _.#surfaceCallbacks('backdrop')));
					_.#backdropBound = true;
				}
				_.dialog?.classList.add('transitioning');
			},
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
		// Clear any inline transform from drag gestures so CSS state transitions work
		if (this.dialog) {
			this.dialog.style.transform = '';
		}
		this.panel?.hide();
	}

	connectedCallback() {
		const _ = this;

		// Cache references so disconnectedCallback can reliably unbind
		_.#panelRef = _.panel;
		_.#dialogRef = _.dialog;

		window.addEventListener('resize', _.#handlers.windowResize);

		if (_.header) {
			_.#gestures.push(new DragGesture(_.header, _.#surfaceCallbacks('header')));
		}

		if (_.content) {
			_.#gestures.push(new DragGesture(_.content, _.#surfaceCallbacks('content')));
			_.#scrollVeto = (event) => {
				if (_.#drag.active && _.#drag.claimed && event.cancelable) {
					event.preventDefault();
				}
			};
			_.content.addEventListener('touchmove', _.#scrollVeto, { passive: false });
		}

		// Backdrop may not exist yet (dialog-panel auto-creates it),
		// so bind its gesture lazily on first show
		_.#backdropBound = false;
		_.#panelRef?.addEventListener('beforeShow', _.#handlers.beforeShow);

		if (_.#dialogRef) {
			_.#dialogRef.addEventListener('transitionend', _.#handlers.transitionEnd);
		}
	}

	disconnectedCallback() {
		const _ = this;

		window.removeEventListener('resize', _.#handlers.windowResize);

		for (const gesture of _.#gestures) {
			gesture.destroy();
		}
		_.#gestures = [];

		if (_.content && _.#scrollVeto) {
			_.content.removeEventListener('touchmove', _.#scrollVeto);
		}
		_.#scrollVeto = null;
		_.#backdropBound = false;
		_.#drag = { active: false };

		_.#panelRef?.removeEventListener('beforeShow', _.#handlers.beforeShow);

		if (_.#dialogRef) {
			_.#dialogRef.removeEventListener('transitionend', _.#handlers.transitionEnd);
		}

		_.#panelRef = null;
		_.#dialogRef = null;
	}

	#surfaceCallbacks(surface) {
		const _ = this;
		return {
			onStart: () => _.#dragStart(surface),
			onMove: (info) => _.#dragMove(surface, info),
			onEnd: (info) => _.#dragEnd(surface, info),
		};
	}

	#dragStart(surface) {
		const _ = this;
		const state = _.panel?.getAttribute('state');
		if (_.panel?.hasAttribute('morph') && (state === 'showing' || state === 'hiding')) {
			return;
		}

		_.#drag = {
			active: true,
			claimed: false,
			surface,
			isAtTop: surface === 'content' ? _.content?.scrollTop === 0 : true,
			direction: null,
		};
		_.dialog?.classList.remove('transitioning');
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
		if (!drag.direction) {
			drag.direction = direction;
		}

		if (surface === 'content' && (!drag.isAtTop || drag.direction === 'up')) {
			return;
		}

		drag.claimed = true;
		if (deltaY < 0) {
			const resistedDelta = _.#applyResistance(-deltaY);
			if (_.dialog) {
				_.dialog.style.transform = `translate3d(0, ${-resistedDelta}px, 0)`;
			}
		} else if (_.dialog) {
			_.dialog.style.transform = `translate3d(0, ${deltaY}px, 0)`;
		}
	}

	#dragEnd(surface, { deltaY, velocityY, duration, cancelled }) {
		const _ = this;
		const drag = _.#drag;

		if (!drag.active) return;
		_.#drag = { active: false };

		if (surface === 'backdrop' && Math.abs(deltaY) < 10 && duration < 300) {
			_.hide();
			return;
		}

		if (!drag.claimed) return;
		_.dialog?.classList.add('transitioning');

		const flick = !cancelled && velocityY > _.#flickVelocity;
		const pastThreshold = !cancelled && deltaY > _.#dragThreshold && velocityY > -0.05;

		if (flick || pastThreshold) {
			_.hide();
		} else if (_.dialog) {
			_.dialog.style.transform = '';
		}
	}

	/**
	 * Runs when a CSS transition finishes
	 * @param {TransitionEvent} e - The transition event
	 */
	#handleTransitionEnd(e) {
		if (e.target === this.dialog && e.propertyName === 'transform') {
			this.dialog.classList.remove('transitioning');
		}
	}
}

class BottomSheetContent extends HTMLElement {
	constructor() {
		super();
	}
}

class BottomSheetHeader extends HTMLElement {
	constructor() {
		super();
	}
}

if (!customElements.get('bottom-sheet')) {
	customElements.define('bottom-sheet', BottomSheet);
}
if (!customElements.get('bottom-sheet-content')) {
	customElements.define('bottom-sheet-content', BottomSheetContent);
}
if (!customElements.get('bottom-sheet-header')) {
	customElements.define('bottom-sheet-header', BottomSheetHeader);
}

export { BottomSheet, BottomSheetContent, BottomSheetHeader };
