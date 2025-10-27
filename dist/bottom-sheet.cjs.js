'use strict';

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
 * BottomSheet class that handles the functionality of a bottom sheet component
 */
class BottomSheet extends HTMLElement {
  // object for storing event handlers
  #handlers = {};

  // physics constants
  #overscrollResistance = 0.1; // lower = more resistance when pulling beyond limits
  #dragThreshold = 100; // distance in pixels needed to dismiss by dragging

  // private backing fields for properties
  #maxDisplayWidth = Infinity; // default: no limit (always show)
  #scrollPosition = 0; // for saving scroll position when locking body scroll

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
        // no limit
        _.maxDisplayWidth = Infinity;
      } else {
        // parse as number or default to infinity if not a valid number
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
    const _ = this;
    return _.#maxDisplayWidth;
  }

  /**
   * Set the maximum display width and reflect to attribute
   * @param {number} value - The maximum width in pixels where the bottom sheet is shown
   */
  set maxDisplayWidth(value) {
    const _ = this;
    _.#maxDisplayWidth = value;

    // don't set the attribute to "Infinity" in html
    if (value === Infinity) {
      _.removeAttribute('max-display-width');
    } else {
      _.setAttribute('max-display-width', value);
    }
  }

  constructor() {
    super();
    const _ = this;

    _.setAttribute('aria-hidden', true);

    // initialize maxDisplayWidth from attribute or use default (infinity = no limit)
    const attrWidth = _.getAttribute('max-display-width');
    if (attrWidth !== null && attrWidth !== 'none') {
      const parsed = parseInt(attrWidth);
      _.maxDisplayWidth = !isNaN(parsed) ? parsed : Infinity;
    } else {
      // default: infinity (no limit)
      _.maxDisplayWidth = Infinity;
    }

    // set default drag properties
    _.drag = {
      isDragging: false,
      startY: 0,
      currentY: 0,
      endY: 0,
      delta: 0,
      direction: null, // 'up', 'down', or null when not dragging
      isHeader: false, // whether drag started on header
      isOverlay: false, // whether drag started on overlay
      isAtTop: false, // whether content is scrolled to top
    };

    // get panel elements
    _.panel = _.querySelector(':scope > bottom-sheet-panel');
    _.panelContent = _.panel?.querySelector(':scope > bottom-sheet-content');
    _.overlay = _.querySelector('bottom-sheet-overlay');
    _.header = _.querySelector('bottom-sheet-header');

    // create a handlers object with bound event handlers
    _.#handlers = {
      touchStart: _.panelDragStart.bind(_),
      touchMove: _.panelDragMove.bind(_),
      touchEnd: _.panelDragEnd.bind(_),
      transitionEnd: _.handleTransitionEnd.bind(_),
      overlayClick: _.hide.bind(_),
      windowResize: throttle(() => {
        if (window.innerWidth > _.maxDisplayWidth) {
          _.hide();
        }
      }, 100),
      actionClick: (e) => {
        // check if the clicked element or any of its parents has the hide action
        const hideButton = e.target.closest('[data-action-hide-bottom-sheet]');
        if (hideButton) {
          e.preventDefault();
          _.hide();
        }
      },
    };

    // set aria attributes and bind ui
    _.setupAriaAttributes();
  }

  /**
   * Sets up ARIA attributes for accessibility
   */
  setupAriaAttributes() {
    const _ = this;
    _.setAttribute('role', 'dialog');
    _.setAttribute('aria-hidden', 'true');
    _.setAttribute('aria-modal', 'true');
    _.setAttribute('inert', '');

    if (!_.hasAttribute('aria-label')) {
      _.setAttribute('aria-label', 'Bottom sheet content');
    }
  }

  /**
   * Handles keydown events for accessibility
   * @param {KeyboardEvent} e - The keyboard event
   */
  #handleKeyDown = (e) => {
    const _ = this;
    // close on escape key press
    if (e.key === 'Escape' && _.getAttribute('aria-hidden') === 'false') {
      e.preventDefault();
      _.hide();
    }
  };

  /**
   * Binds all necessary event listeners to the component
   */
  bindUI() {
    const _ = this;

    window.addEventListener('resize', _.#handlers.windowResize);

    // bind touch events for header
    if (_.header) {
      _.header.addEventListener('touchstart', _.#handlers.touchStart, true);
      _.header.addEventListener('touchmove', _.#handlers.touchMove, false);
      _.header.addEventListener('touchend', _.#handlers.touchEnd);
      _.header.addEventListener('touchcancel', _.#handlers.touchEnd);
    }

    // bind touch events for content
    if (_.panelContent) {
      _.panelContent.addEventListener('touchstart', _.#handlers.touchStart, true);
      _.panelContent.addEventListener('touchmove', _.#handlers.touchMove, false);
      _.panelContent.addEventListener('touchend', _.#handlers.touchEnd);
      _.panelContent.addEventListener('touchcancel', _.#handlers.touchEnd);
    }

    // bind touch events for overlay
    if (_.overlay) {
      _.overlay.addEventListener('touchstart', _.#handlers.touchStart, true);
      _.overlay.addEventListener('touchmove', _.#handlers.touchMove, false);
      _.overlay.addEventListener('touchend', _.#handlers.touchEnd);
      _.overlay.addEventListener('touchcancel', _.#handlers.touchEnd);
      _.overlay.addEventListener('click', _.#handlers.overlayClick);
    }

    // transition end handler
    if (_.panel) {
      _.panel.addEventListener('transitionend', _.#handlers.transitionEnd);
      _.panel.addEventListener('click', _.#handlers.actionClick);
    }

    // add keyboard support
    document.addEventListener('keydown', _.#handleKeyDown);
  }

  connectedCallback() {
    const _ = this;
    _.bindUI();

    // initial check
    if (window.innerWidth > _.maxDisplayWidth) {
      _.hide();
    }
  }

  /**
   * Cleanup event listeners when element is removed
   */
  disconnectedCallback() {
    const _ = this;

    // remove resize listener
    window.removeEventListener('resize', _.#handlers.windowResize);

    if (_.header) {
      _.header.removeEventListener('touchstart', _.#handlers.touchStart, true);
      _.header.removeEventListener('touchmove', _.#handlers.touchMove, false);
      _.header.removeEventListener('touchend', _.#handlers.touchEnd);
      _.header.removeEventListener('touchcancel', _.#handlers.touchEnd);
    }

    if (_.panelContent) {
      _.panelContent.removeEventListener('touchstart', _.#handlers.touchStart, true);
      _.panelContent.removeEventListener('touchmove', _.#handlers.touchMove, false);
      _.panelContent.removeEventListener('touchend', _.#handlers.touchEnd);
      _.panelContent.removeEventListener('touchcancel', _.#handlers.touchEnd);
    }

    if (_.overlay) {
      _.overlay.removeEventListener('touchstart', _.#handlers.touchStart, true);
      _.overlay.removeEventListener('touchmove', _.#handlers.touchMove, false);
      _.overlay.removeEventListener('touchend', _.#handlers.touchEnd);
      _.overlay.removeEventListener('touchcancel', _.#handlers.touchEnd);
      _.overlay.removeEventListener('click', _.#handlers.overlayClick);
    }

    if (_.panel) {
      _.panel.removeEventListener('transitionend', _.#handlers.transitionEnd);
      _.panel.removeEventListener('click', _.#handlers.actionClick);
    }

    document.removeEventListener('keydown', _.#handleKeyDown);
  }

  /**
   * Toggles body scrolling on/off when the bottom sheet is shown/hidden
   * @param {boolean} disable - Whether to disable body scrolling
   */
  toggleBodyScroll(disable) {
    const _ = this;
    if (disable) {
      _.#scrollPosition = window.pageYOffset;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${_.#scrollPosition}px`;
      document.body.style.width = '100%';
    } else {
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('width');
      window.scrollTo(0, _.#scrollPosition);
      _.#scrollPosition = 0;
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
    drag.direction = null; // reset direction for new drag
    drag.delta = 0;

    _.panel.classList.remove('transitioning');

    // Only allow dragging if:
    // 1. We're at the top of content and dragging down
    // 2. We're interacting with the header
    // 3. We're interacting with the overlay
    const isHeader = !!e.target.closest('bottom-sheet-header');
    const isOverlay = !!e.target.closest('bottom-sheet-overlay');
    const isAtTop = _.panelContent?.scrollTop === 0;

    // Store these states for use in move handler
    drag.isHeader = isHeader;
    drag.isOverlay = isOverlay;
    drag.isAtTop = isAtTop;

    if (isHeader || isOverlay || isAtTop) {
      drag.isDragging = true;
    }
  }

  /**
   * Applies resistance to a drag value to create a rubber-band effect
   * @param {number} value - The raw drag distance
   * @returns {number} The drag with resistance applied
   */
  #applyResistance(value) {
    // square root provides a nice feel (more resistance as you drag further)
    const _ = this;
    return Math.sqrt(value) * 10 * _.#overscrollResistance;
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

    // initial direction detection
    if (!drag.direction) {
      // we need to determine if we're moving up or down
      if (drag.delta < 0) {
        // upward (negative delta)
        drag.direction = 'up';
      } else {
        // downward (positive delta)
        drag.direction = 'down';
      }
    }

    // If we're in the content area (not header/overlay) and not at the top,
    // or if we're at the top but scrolling up, we should allow normal scrolling
    if (!drag.isHeader && !drag.isOverlay) {
      // If we're not at the top, let the browser handle the scroll
      if (!drag.isAtTop) {
        return;
      }

      // If we're at the top but trying to scroll up (drag down),
      // allow the panel drag; otherwise, let the content scroll
      if (drag.direction === 'up') {
        return;
      }
    }

    // At this point, we're either:
    // 1. On the header
    // 2. On the overlay
    // 3. At the top of content and dragging down
    // So we should control the panel movement

    // For all these cases, we want to prevent default scrolling
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    // handle upward movement (negative delta) - pulling beyond top position
    if (drag.delta < 0) {
      // apply strong resistance to upward movement
      const absValue = Math.abs(drag.delta);
      const resistedDelta = _.#applyResistance(absValue);

      // convert back to negative (upward movement)
      _.panel.style.transform = `translate3d(0,${-resistedDelta}px,0)`;
      return;
    }

    // handle downward movement (positive delta) - dismissing
    if (drag.delta > 0) {
      // for downward drag, use natural movement with no resistance
      _.panel.style.transform = `translate3d(0,${drag.delta}px,0)`;

      // visual feedback if passing threshold
      if (drag.delta > _.#dragThreshold) ;
    }
  }

  /**
   * Fired when a touch event ends on the panel
   * @param {TouchEvent} e - The touch event
   */
  // eslint-disable-next-line no-unused-vars
  panelDragEnd(e) {
    const _ = this;
    const drag = _.drag;

    if (!drag.isDragging) return;
    drag.isDragging = false;

    // add transitioning class to ensure smooth snap animation
    _.panel.classList.add('transitioning');

    // handle negative delta (upward drag attempts) - always snap back
    if (drag.delta < 0) {
      drag.delta = 0;
      drag.direction = null;
      _.show(); // resets transform to normal position
      return;
    }

    // for downward drags, check if we've passed the dismissal threshold
    if (drag.delta > _.#dragThreshold) {
      drag.delta = 0;
      drag.direction = null;
      _.hide();
      return;
    }

    // otherwise, snap back to normal position
    drag.delta = 0;
    drag.direction = null;
    _.show();
  }

  /**
   * Runs when a CSS transition finishes
   * @param {TransitionEvent} e - The transition event
   */
  handleTransitionEnd(e) {
    const _ = this;
    if (e.propertyName === 'transform') {
      _.panel.classList.remove('transitioning');
    }
  }

  /**
   * Shows the bottom sheet and dispatches an open event
   */
  show() {
    const _ = this;

    // don't show if width is above max display width or was closed by resize
    if (window.innerWidth > _.maxDisplayWidth) {
      return;
    }

    _.setAttribute('aria-hidden', 'false');
    _.removeAttribute('inert');
    _.panel.classList.add('transitioning');
    _.panel.style.transform = null;
    _.toggleBodyScroll(true);

    _.dispatchEvent(
      new CustomEvent('bottomsheet:open', {
        bubbles: true,
        detail: { sheet: _ },
      })
    );
  }

  /**
   * Hides the bottom sheet and dispatches a close event
   */
  hide() {
    const _ = this;
    _.setAttribute('aria-hidden', 'true');
    _.setAttribute('inert', '');
    _.panel.classList.add('transitioning');
    _.panel.style.transform = null;
    _.toggleBodyScroll(false);

    _.dispatchEvent(
      new CustomEvent('bottomsheet:close', {
        bubbles: true,
        detail: { sheet: _ },
      })
    );
  }
}

/**
 * Supporting component classes for the bottom sheet
 */
class BottomSheetPanel extends HTMLElement {
  constructor() {
    super();
  }
}

class BottomSheetContent extends HTMLElement {
  constructor() {
    super();
  }
}

class BottomSheetOverlay extends HTMLElement {
  constructor() {
    super();
  }
}

class BottomSheetHeader extends HTMLElement {
  constructor() {
    super();
  }
}

// define custom elements
customElements.define('bottom-sheet', BottomSheet);
customElements.define('bottom-sheet-panel', BottomSheetPanel);
customElements.define('bottom-sheet-content', BottomSheetContent);
customElements.define('bottom-sheet-overlay', BottomSheetOverlay);
customElements.define('bottom-sheet-header', BottomSheetHeader);

exports.BottomSheet = BottomSheet;
exports.BottomSheetContent = BottomSheetContent;
exports.BottomSheetHeader = BottomSheetHeader;
exports.BottomSheetOverlay = BottomSheetOverlay;
exports.BottomSheetPanel = BottomSheetPanel;
//# sourceMappingURL=bottom-sheet.cjs.js.map
