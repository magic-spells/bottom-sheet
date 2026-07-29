import './bottom-sheet.css';
import { DragGesture } from './drag-gesture.js';
import { parseSnapPoints, resolveSnapTarget } from './snap-points.js';

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
	#snapPoints = [];
	#snap = null;

	// cached references for reliable cleanup in disconnectedCallback
	#panelRef = null;
	#dialogRef = null;
	#backdropBound = false;

	/**
	 * Define which attributes should be observed for changes
	 * @returns {string[]} List of attribute names to observe
	 */
	static get observedAttributes() {
		return ['max-display-width', 'snap-points', 'snap'];
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
			return;
		}

		if (name === 'snap-points') {
			_.#snapPoints = parseSnapPoints(newValue);
			_.#applyRestingHeight();
			return;
		}

		if (name === 'snap') {
			const parsed = Number(newValue);
			_.#snap = newValue !== null && Number.isFinite(parsed) ? parsed : null;
			_.#applyRestingHeight();
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
		const list = Array.isArray(value) ? value.join(',') : (value ?? '');

		if (String(list).trim() === '') {
			_.removeAttribute('snap-points');
		} else {
			_.setAttribute('snap-points', list);
		}
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

		if (value === null) {
			_.removeAttribute('snap');
		} else {
			_.setAttribute('snap', value);
		}
	}

	/**
	 * Animates the sheet to a declared snap point. Undeclared values are ignored.
	 * @param {number} value - A snap in dvh percent
	 */
	snapTo(value) {
		const _ = this;
		const target = Number(value);
		if (!_.#snapPoints.includes(target)) return;

		_.dialog?.classList.add('transitioning');
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
	 * Get the footer element
	 * @returns {HTMLElement|null}
	 */
	get footer() {
		return this.querySelector('bottom-sheet-footer');
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
				// Restore the resting height before the transition is armed, so a
				// sheet reopened after a drag-dismiss opens at its snap rather
				// than animating out to it.
				_.#applyRestingHeight();
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
		// Clear any inline transform from drag gestures so CSS state transitions work.
		// The inline height stays put — the hiding transform is a percentage of it.
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

		if (_.footer) {
			_.#gestures.push(new DragGesture(_.footer, _.#surfaceCallbacks('footer')));
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

		// Attributes parsed before connection could not reach the dialog
		_.#applyRestingHeight();
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

	/**
	 * Writes the current snap to the dialog as a dvh height. Keeping the resting
	 * value in dvh rather than pixels is what makes viewport resizes free.
	 */
	#applyRestingHeight() {
		const _ = this;
		const dialog = _.dialog;
		if (!dialog) return;

		const snap = _.#activeSnap;
		dialog.style.height = snap === null ? '' : `${snap}dvh`;
	}

	/**
	 * Resolves the declared snaps to pixels against the current viewport
	 * @returns {number[]} Ascending snap heights in pixels
	 */
	#snapsPx() {
		return this.#snapPoints.map((value) => (value / 100) * window.innerHeight);
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
			// Distance already travelled when the panel took the gesture over, so
			// a mid-gesture handoff starts from zero instead of jumping.
			claimOffset: 0,
			startHeight: _.dialog?.getBoundingClientRect().height ?? 0,
			belowLowest: 0,
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
		// Header, footer and backdrop are dedicated drag surfaces
		if (surface !== 'content') return true;
		if (moveY === 0) return false;

		// Downward: hand off exactly when the list runs out of scroll
		if (moveY > 0) return _.content?.scrollTop === 0;

		// Upward: below the tallest snap, growing the sheet beats scrolling a
		// sliver of content. At the tallest snap there is nowhere to grow, so
		// the gesture stays with the scroller — as does a sheet with no snaps.
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
		}

		const travel = deltaY - drag.claimOffset;

		if (_.#snapPoints.length) {
			_.#moveBySnap(travel);
		} else {
			_.#moveByTransform(travel);
		}
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
			// Past the tallest snap the sheet stops tracking the pointer
			dialog.style.height = `${maxPx + _.#applyResistance(height - maxPx)}px`;
			dialog.style.transform = '';
			_.#drag.belowLowest = 0;
			return;
		}

		if (height < minPx) {
			// Below the shortest snap this stops being a resize and becomes the
			// dismiss gesture, on the same transform path a binary sheet uses.
			const below = minPx - height;
			dialog.style.height = `${minPx}px`;
			dialog.style.transform = `translate3d(0, ${below}px, 0)`;
			_.#drag.belowLowest = below;
			return;
		}

		dialog.style.height = `${height}px`;
		dialog.style.transform = '';
		_.#drag.belowLowest = 0;
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
		} else {
			dialog.style.transform = `translate3d(0, ${travel}px, 0)`;
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

		if (_.#snapPoints.length) {
			_.#releaseToSnap(drag, velocityY, cancelled);
			return;
		}

		const travel = deltaY - drag.claimOffset;
		const flick = !cancelled && velocityY > _.#flickVelocity;
		const pastThreshold = !cancelled && travel > _.#dragThreshold && velocityY > -0.05;

		if (flick || pastThreshold) {
			_.hide();
		} else if (_.dialog) {
			_.dialog.style.transform = '';
		}
	}

	/**
	 * Settles a snapping sheet after release
	 * @param {Object} drag - The drag state as it stood at release
	 * @param {number} velocityY - Release velocity in px/ms, positive downward
	 * @param {boolean} cancelled - Whether the pointer was cancelled
	 */
	#releaseToSnap(drag, velocityY, cancelled) {
		const _ = this;

		// A cancelled gesture never dismisses and never changes snap
		if (cancelled) {
			_.#commitSnap(_.#activeSnap);
			return;
		}

		// Dragged below the shortest snap, so the binary dismissal rules apply
		if (drag.belowLowest > 0) {
			if (velocityY > _.#flickVelocity || drag.belowLowest > _.#dragThreshold) {
				_.hide();
			} else {
				_.#commitSnap(_.#snapPoints[0]);
			}
			return;
		}

		const snapsPx = _.#snapsPx();
		const targetPx = resolveSnapTarget({
			currentPx: _.dialog?.getBoundingClientRect().height ?? 0,
			velocityY,
			snapsPx,
			flickVelocity: _.#flickVelocity,
		});

		if (targetPx === null) {
			_.hide();
			return;
		}

		_.#commitSnap(_.#snapPoints[snapsPx.indexOf(targetPx)]);
	}

	/**
	 * Settles the sheet on a snap, reflects it, and announces the change
	 * @param {number} value - The snap in dvh percent
	 */
	#commitSnap(value) {
		const _ = this;
		const from = _.#activeSnap;
		const dialog = _.dialog;

		// Written explicitly rather than left to the attribute reflection —
		// re-committing the same snap still has to clear the drag's inline pixels
		if (dialog) {
			dialog.style.transform = '';
			dialog.style.height = `${value}dvh`;
		}

		_.#snap = value;
		_.setAttribute('snap', value);

		if (from !== value) {
			_.dispatchEvent(
				new CustomEvent('snapChange', {
					bubbles: true,
					detail: { from, to: value },
				})
			);
		}
	}

	/**
	 * Runs when a CSS transition finishes
	 * @param {TransitionEvent} e - The transition event
	 */
	#handleTransitionEnd(e) {
		if (
			e.target === this.dialog &&
			(e.propertyName === 'transform' || e.propertyName === 'height')
		) {
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

class BottomSheetFooter extends HTMLElement {
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
if (!customElements.get('bottom-sheet-footer')) {
	customElements.define('bottom-sheet-footer', BottomSheetFooter);
}

export { BottomSheet, BottomSheetContent, BottomSheetHeader, BottomSheetFooter };
