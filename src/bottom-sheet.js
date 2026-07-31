import './bottom-sheet.css';
import PhysicsEngine from '@magic-spells/physics-engine';
import { DragGesture } from './drag-gesture.js';
import { parseSnapPoints, resolveSnapTarget, SNAP_EPSILON } from './snap-points.js';

// PhysicsEngine integrates once per 60fps frame — its `velocity` is units per
// frame, not per millisecond. DragGesture reports px/ms, so every release
// velocity handed to the spring has to cross this scale first. Getting it wrong
// is silent: the spring still runs, it just settles at ~17x the wrong speed.
const FRAME_MS = 16.66;

// The tracker measures the last stretch of a finger that is already slowing
// into its release, so the number it reports reads slightly slower than the
// throw felt. A small boost hands the spring the intent rather than the
// measurement. Kept separate from FRAME_MS: that one is a unit conversion and
// is not a matter of taste, this one is.
const VELOCITY_BOOST = 1.1;

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

	// Spring settling, on by default. Built on the first settle rather than at
	// construction, so a sheet that never snaps never makes one.
	#engine = null;
	#springTarget = null;
	// Raised only while #commitSnap reflects its own destination, so that write
	// is not mistaken for an author retargeting the sheet mid-settle.
	#reflectingSnap = false;

	// cached references for reliable cleanup in disconnectedCallback
	#panelRef = null;
	#dialogRef = null;

	/**
	 * Define which attributes should be observed for changes
	 * @returns {string[]} List of attribute names to observe
	 */
	static get observedAttributes() {
		return ['max-display-width', 'snap-points', 'snap', 'spring'];
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
				const trimmed = newValue.trim();
				const parsed = Number(trimmed);
				_.maxDisplayWidth =
					trimmed === '' || !Number.isFinite(parsed) ? Infinity : parsed;
			}
			return;
		}

		if (name === 'snap-points') {
			_.#snapPoints = parseSnapPoints(newValue);
			if (newValue !== null && _.#snapPoints.length === 0) {
				_.removeAttribute('snap-points');
				return;
			}
			// Never written internally, so any change here is the author's and
			// supersedes a settle — whose destination may not even be declared
			// any more.
			_.#supersedeSettle();
			return;
		}

		if (name === 'snap') {
			const parsed = Number(newValue);
			_.#snap = newValue !== null && Number.isFinite(parsed) ? parsed : null;
			// #commitSnap reflects the destination of the settle it has just
			// started, and must not cancel it. Every other write is an author
			// retargeting the sheet, which wins over whatever is in flight.
			if (_.#reflectingSnap) _.#applyRestingHeight();
			else _.#supersedeSettle();
			return;
		}

		if (name === 'spring') {
			// Drop the engine rather than rebuilding here. The next settle
			// reconstructs it with the new tuning, which keeps this callback out
			// of the business of knowing whether one is currently running.
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
		return this.getAttribute('spring') !== 'none';
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

		const [attraction, friction] = String(_.getAttribute('spring') ?? '')
			.split(/[\s,]+/)
			.map(Number);

		// Attraction pulls toward the snap; friction bleeds off the speed that
		// pull builds. Raising both together is not a wash — friction is applied
		// every frame and wins, so 0.065/0.30 damps harder than 0.034/0.22
		// despite the stronger pull. A snap-to-snap move reaches the snap in
		// ~270ms and overshoots ~2.4% of the gap it travelled, so the sheet
		// arrives with a small bounce rather than easing to a dead stop.
		const options = { attraction: 0.065, friction: 0.3 };
		if (Number.isFinite(attraction) && attraction > 0 && attraction < 1) {
			options.attraction = attraction;
		}
		if (Number.isFinite(friction) && friction > 0 && friction < 1) {
			options.friction = friction;
		}

		_.#engine = new PhysicsEngine(options);

		_.#engine.on('change', ({ position }) => {
			const dialog = _.dialog;
			// A gesture that starts mid-settle owns the height from then on
			if (dialog && !_.#drag.active) dialog.style.height = `${position}px`;
		});

		_.#engine.on('complete', () => {
			// Cleared first: #applyRestingHeight refuses to write while a settle
			// is still marked as running, which is what keeps the attribute
			// reflection from clobbering the spring mid-flight.
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
		if (wasSettling) _.dialog?.classList.add('transitioning', 'snapping');
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
			windowResize: () => {
				if (window.innerWidth > _.maxDisplayWidth && _.panel?.isOpen) {
					_.hide();
				}
			},
			beforeShow: () => {
				// Restore the resting height before the transition is armed, so a
				// sheet reopened after a drag-dismiss opens at its snap rather
				// than animating out to it.
				_.#applyRestingHeight();
				// An open travels the full sheet height, so it keeps the shared
				// duration even if the last settle was interrupted by the hide.
				_.dialog?.classList.remove('snapping');
				_.dialog?.classList.add('transitioning');
			},
			// Escape, a backdrop tap and every [data-action-hide-dialog] button
			// close through dialog-panel and never reach hide(), so this is the
			// only place those closes can be cleaned up after.
			//
			// The work cannot happen here. `beforeHide` is cancelable, and a
			// refused close must leave a running settle alone — tearing one down
			// on the announcement rather than the verdict is the same bug hide()
			// already carries a note about. dialog-panel sets `state` synchronously
			// as soon as the dispatch returns, so a microtask is the earliest
			// point the verdict can be read.
			beforeHide: () => {
				queueMicrotask(() => {
					if (_.#panelRef?.getAttribute('state') !== 'hiding') return;
					_.#teardownForClose();
				});
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
		const accepted = _.panel?.hide();

		if (accepted === false) {
			// Refused. Undo the gesture rather than the settle: a spring that is
			// still running owns the height and will land on its own.
			if (_.dialog && _.#springTarget === null) {
				_.dialog.classList.add('transitioning');
				_.dialog.style.transform = '';
			}
			if (_.#springTarget === null) _.#applyRestingHeight();
			return false;
		}

		// A close is a state transition, not a settle — let go of the height
		_.#stopSpring();
		// Clear any inline transform from drag gestures so CSS state transitions work.
		// The inline height stays put — the hiding transform is a percentage of it.
		if (_.dialog) {
			_.dialog.style.transform = '';
			// A dismiss is a close, not a settle. Left on, this would outrank
			// the hiding rule and close the sheet at the snap duration.
			_.dialog.classList.remove('snapping');
		}
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

		// A settle must not keep writing heights into a closing sheet
		_.#stopSpring();

		// An interrupted gesture never gets its pointerup, so nothing else would
		// ever clear it — and its inline transform sits on top of the exit.
		for (const gesture of _.#gestures) {
			gesture.cancel();
		}
		_.#drag = { active: false };

		if (_.dialog) {
			_.dialog.style.transform = '';
			// Left on, the snap pacing outranks the hiding rule and the close
			// silently runs at the settle's duration.
			_.dialog.classList.remove('snapping');
		}
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

		_.#panelRef?.addEventListener('beforeShow', _.#handlers.beforeShow);
		_.#panelRef?.addEventListener('beforeHide', _.#handlers.beforeHide);

		if (_.#dialogRef) {
			_.#dialogRef.addEventListener('transitionend', _.#handlers.transitionEnd);
		}

		// disconnectedCallback drops the engine, and a reconnect fires no
		// attribute change to rebuild it
		// The engine is built on first settle, so a reconnect needs nothing here

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
		_.#drag = { active: false };
		// Leaves no rAF loop running against a detached dialog
		_.#stopSpring();
		_.#engine?.removeAllListeners();
		_.#engine = null;

		_.#panelRef?.removeEventListener('beforeShow', _.#handlers.beforeShow);
		_.#panelRef?.removeEventListener('beforeHide', _.#handlers.beforeHide);

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
		// A running settle owns the height frame by frame. Without this the
		// `snap` reflection fired by #commitSnap would immediately overwrite the
		// spring's first frame with the destination and skip the animation.
		if (_.#springTarget !== null) return;

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
			onStart: () => _.#dragStart(),
			onMove: (info) => _.#dragMove(surface, info),
			onEnd: (info) => _.#dragEnd(surface, info),
		};
	}

	#dragStart() {
		const _ = this;
		const state = _.panel?.getAttribute('state');
		if (_.panel?.hasAttribute('morph') && (state === 'showing' || state === 'hiding')) {
			return;
		}

		// A settle in flight loses the sheet to the finger, and must not keep
		// writing heights underneath the drag.
		_.#stopSpring();

		const dialog = _.dialog;
		// Measured while the transition is still armed. A settling sheet already
		// carries its destination in the inline height and is only painted part
		// way there, so this has to be read before that transition is dropped.
		const startHeight = dialog?.getBoundingClientRect().height ?? 0;

		if (dialog && _.#snapPoints.length) {
			// Pin the height the sheet is actually painted at. Dropping
			// `transitioning` below cancels a running settle, which renders the
			// inline destination immediately — so grabbing a moving sheet would
			// otherwise jump it to the target snap and then back to the finger
			// on the first move.
			dialog.style.height = `${startHeight}px`;
		}

		const computedTransform =
			dialog && typeof window.getComputedStyle === 'function'
				? window.getComputedStyle(dialog).transform
				: '';
		const normalizedTransform = computedTransform?.replace(/\s+/g, '');
		if (
			dialog &&
			computedTransform &&
			![
				'none',
				'matrix(1,0,0,1,0,0)',
				'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)',
			].includes(normalizedTransform)
		) {
			dialog.style.transform = computedTransform;
		}

		_.#drag = {
			active: true,
			claimed: false,
			// Distance already travelled when the panel took the gesture over, so
			// a mid-gesture handoff starts from zero instead of jumping.
			claimOffset: 0,
			startHeight,
			belowLowest: 0,
		};
		dialog?.classList.remove('transitioning', 'snapping');
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
		// Header and footer are dedicated drag surfaces
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

	#dragEnd(surface, { deltaY, velocityY, cancelled }) {
		const _ = this;
		const drag = _.#drag;

		if (!drag.active) return;
		_.#drag = { active: false };

		_.dialog?.classList.add('transitioning');

		if (!drag.claimed) {
			// A press that never became a drag still pinned the painted height
			// and transform, so hand both back to their CSS destinations.
			if (_.dialog) _.dialog.style.transform = '';
			_.#applyRestingHeight();
			return;
		}

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
			const flick = velocityY > _.#flickVelocity;
			// Mirrors the binary path exactly: a distance dismissal must not fire
			// when the finger was already travelling back up at release. Without
			// this, pulling well below the shortest snap and then reversing still
			// closes the sheet, because belowLowest is a position rather than an
			// intent and can stay past the threshold through the whole reversal.
			const pastThreshold = drag.belowLowest > _.#dragThreshold && velocityY > -0.05;

			if (flick || pastThreshold) {
				_.hide();
			} else {
				_.#commitSnap(_.#snapPoints[0], velocityY);
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
		const targetPx = (value / 100) * window.innerHeight;
		const startPx = dialog?.getBoundingClientRect().height ?? targetPx;

		// Below the shortest snap the sheet stops resizing: the height is pinned
		// at that snap and the travel is carried by the transform instead. The
		// spring drives height, so it has nothing to animate here — and its
		// branch drops `transitioning` and clears the transform with no
		// transition armed, which returns the sheet home in a single frame. A
		// settle with no height left to travel therefore takes the CSS clock,
		// the only one that can carry the transform back.
		const heightAtTarget = Math.abs(startPx - targetPx) <= SNAP_EPSILON;

		// Written explicitly rather than left to the attribute reflection —
		// re-committing the same snap still has to clear the drag's inline pixels
		if (dialog && _.#springEnabled && !heightAtTarget) {
			const engine = _.#ensureEngine();

			// The spring writes the height every frame, so the CSS transition
			// has to be off or the two fight over the same property.
			dialog.classList.remove('transitioning', 'snapping');
			dialog.style.transform = '';
			_.#springTarget = targetPx;

			// velocityY is positive downward while height grows upward, so the
			// sign flips. This is the whole point of the spring path: the settle
			// leaves at the speed the finger was actually moving.
			const seed = -velocityY * FRAME_MS * VELOCITY_BOOST;

			engine.animateTo(startPx, targetPx, seed);
		} else if (dialog) {
			// Only a settle onto a snap is paced by the snap duration. Adding
			// this in #dragEnd instead would also catch the drag-dismiss, where
			// the extra class would outrank and speed up the closing transition.
			dialog.classList.add('snapping');
			dialog.style.transform = '';
			dialog.style.height = `${value}dvh`;
		}

		_.#snap = value;
		// Flagged so the reflection is not read back as an author retargeting
		// the sheet — that would supersede the settle started three lines up.
		_.#reflectingSnap = true;
		_.setAttribute('snap', value);
		_.#reflectingSnap = false;

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
		const _ = this;
		if (
			e.target === _.dialog &&
			(e.propertyName === 'transform' || e.propertyName === 'height')
		) {
			// A settle's height event can arrive after hiding starts; its
			// cleanup must not cancel the close's transform transition.
			if (e.propertyName === 'height' && _.panel?.getAttribute('state') === 'hiding') {
				return;
			}
			_.dialog.classList.remove('transitioning', 'snapping');
		}
	}
}

class BottomSheetContent extends HTMLElement {}

class BottomSheetHeader extends HTMLElement {}

class BottomSheetFooter extends HTMLElement {}

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
