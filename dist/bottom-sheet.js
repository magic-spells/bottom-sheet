(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.BottomSheet = {}));
})(this, (function (exports) { 'use strict';

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
   * BottomSheet class that manages touch gestures and delegates
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

    // physics constants
    #overscrollResistance = 0.1;
    #dragThreshold = 100;

    // private backing fields
    #maxDisplayWidth = Infinity;

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

      _.drag = {
        isDragging: false,
        startY: 0,
        currentY: 0,
        delta: 0,
        direction: null,
        isHeader: false,
        isBackdrop: false,
        isAtTop: false,
      };

      _.#handlers = {
        touchStart: _.panelDragStart.bind(_),
        touchMove: _.panelDragMove.bind(_),
        touchEnd: _.panelDragEnd.bind(_),
        transitionEnd: _.handleTransitionEnd.bind(_),
        windowResize: throttle(() => {
          if (window.innerWidth > _.maxDisplayWidth && _.panel?.isOpen) {
            _.hide();
          }
        }, 100),
        // Lazily bind backdrop touch events on first show (backdrop may not exist at connectedCallback)
        // Also add transitioning class so the open slide-up animates
        beforeShow: () => {
          const backdrop = _.backdrop;
          if (backdrop && !_._backdropBound) {
            _.#bindTouchEvents(backdrop);
            _._backdropBound = true;
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

    /**
     * Binds touch event listeners
     */
    #bindTouchEvents(el) {
      const _ = this;
      if (!el) return;
      el.addEventListener('touchstart', _.#handlers.touchStart, true);
      el.addEventListener('touchmove', _.#handlers.touchMove, false);
      el.addEventListener('touchend', _.#handlers.touchEnd);
      el.addEventListener('touchcancel', _.#handlers.touchEnd);
    }

    /**
     * Unbinds touch event listeners
     */
    #unbindTouchEvents(el) {
      const _ = this;
      if (!el) return;
      el.removeEventListener('touchstart', _.#handlers.touchStart, true);
      el.removeEventListener('touchmove', _.#handlers.touchMove, false);
      el.removeEventListener('touchend', _.#handlers.touchEnd);
      el.removeEventListener('touchcancel', _.#handlers.touchEnd);
    }

    connectedCallback() {
      const _ = this;

      window.addEventListener('resize', _.#handlers.windowResize);

      _.#bindTouchEvents(_.header);
      _.#bindTouchEvents(_.content);

      // Backdrop may not exist yet (dialog-panel auto-creates it),
      // so bind touch events lazily on first show
      _._backdropBound = false;
      _.panel?.addEventListener('beforeShow', _.#handlers.beforeShow);

      if (_.dialog) {
        _.dialog.addEventListener('transitionend', _.#handlers.transitionEnd);
      }
    }

    disconnectedCallback() {
      const _ = this;

      window.removeEventListener('resize', _.#handlers.windowResize);

      _.#unbindTouchEvents(_.header);
      _.#unbindTouchEvents(_.content);

      if (_._backdropBound) {
        _.#unbindTouchEvents(_.backdrop);
        _._backdropBound = false;
      }

      _.panel?.removeEventListener('beforeShow', _.#handlers.beforeShow);

      if (_.dialog) {
        _.dialog.removeEventListener('transitionend', _.#handlers.transitionEnd);
      }
    }

    /**
     * Fired when a touch event starts on the panel
     * @param {TouchEvent} e - The touch event
     */
    panelDragStart(e) {
      const _ = this;
      const drag = _.drag;

      drag.startY = e.targetTouches[0].screenY;
      drag.direction = null;
      drag.delta = 0;

      _.dialog?.classList.remove('transitioning');

      const isHeader = !!e.target.closest('bottom-sheet-header');
      const isBackdrop = !!e.target.closest('dialog-backdrop');
      const isAtTop = _.content?.scrollTop === 0;

      drag.isHeader = isHeader;
      drag.isBackdrop = isBackdrop;
      drag.isAtTop = isAtTop;

      if (isHeader || isBackdrop || isAtTop) {
        drag.isDragging = true;
      }
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
     * Fired when a touch event moves on the panel
     * @param {TouchEvent} e - The touch event
     */
    panelDragMove(e) {
      const _ = this;
      const drag = _.drag;

      if (!drag.isDragging) return;

      drag.currentY = e.targetTouches[0].screenY;
      drag.delta = drag.currentY - drag.startY;

      if (!drag.direction) {
        drag.direction = drag.delta < 0 ? 'up' : 'down';
      }

      // Content area: allow normal scrolling unless at top and dragging down
      if (!drag.isHeader && !drag.isBackdrop) {
        if (!drag.isAtTop) return;
        if (drag.direction === 'up') return;
      }

      if (e.cancelable) e.preventDefault();
      e.stopPropagation();

      const dialog = _.dialog;
      if (!dialog) return;

      // Upward movement: apply strong resistance (rubber-band effect)
      if (drag.delta < 0) {
        const resistedDelta = _.#applyResistance(Math.abs(drag.delta));
        dialog.style.transform = `translate3d(0,${-resistedDelta}px,0)`;
        return;
      }

      // Downward movement: natural movement for dismissal
      if (drag.delta > 0) {
        dialog.style.transform = `translate3d(0,${drag.delta}px,0)`;
      }
    }

    /**
     * Fired when a touch event ends on the panel
     */
    panelDragEnd() {
      const _ = this;
      const drag = _.drag;

      if (!drag.isDragging) return;
      drag.isDragging = false;

      const dialog = _.dialog;
      if (!dialog) return;

      dialog.classList.add('transitioning');

      // Upward drag: always snap back
      if (drag.delta < 0) {
        drag.delta = 0;
        drag.direction = null;
        dialog.style.transform = '';
        return;
      }

      // Downward drag past threshold: dismiss
      if (drag.delta > _.#dragThreshold) {
        drag.delta = 0;
        drag.direction = null;
        _.hide();
        return;
      }

      // Snap back to open position
      drag.delta = 0;
      drag.direction = null;
      dialog.style.transform = '';
    }

    /**
     * Runs when a CSS transition finishes
     * @param {TransitionEvent} e - The transition event
     */
    handleTransitionEnd(e) {
      if (e.propertyName === 'transform') {
        this.dialog?.classList.remove('transitioning');
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

  customElements.define('bottom-sheet', BottomSheet);
  customElements.define('bottom-sheet-content', BottomSheetContent);
  customElements.define('bottom-sheet-header', BottomSheetHeader);

  exports.BottomSheet = BottomSheet;
  exports.BottomSheetContent = BottomSheetContent;
  exports.BottomSheetHeader = BottomSheetHeader;

}));
//# sourceMappingURL=bottom-sheet.js.map
