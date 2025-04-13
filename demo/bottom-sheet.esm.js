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
  // Private fields for event handlers
  #handleTouchStart;
  #handleTouchMove;
  #handleTouchEnd;
  #handleTransitionEnd;
  #handleOverlayClick;
  #handleWindowResize;
  
  // Physics constants
  #overscrollResistance = 0.1; // Lower = more resistance when pulling beyond limits
  #dragThreshold = 100; // Distance in pixels needed to dismiss by dragging
  
  // Private backing fields for properties
  #maxDisplayWidth = Infinity; // Default: no limit (always show)
  #scrollPosition = 0; // For saving scroll position when locking body scroll
  
  /**
   * Define which attributes should be observed for changes
   */
  static get observedAttributes() {
    return ['max-display-width'];
  }
  
  /**
   * Called when observed attributes change
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    
    if (name === 'max-display-width') {
      if (newValue === null || newValue === 'none') {
        // No limit
        this.maxDisplayWidth = Infinity;
      } else {
        // Parse as number or default to Infinity if not a valid number
        const parsed = parseInt(newValue);
        this.maxDisplayWidth = !isNaN(parsed) ? parsed : Infinity;
      }
    }
  }
  
  /**
   * Get the maximum display width
   * @return {number} The maximum width in pixels where the bottom sheet is shown
   */
  get maxDisplayWidth() {
    return this.#maxDisplayWidth;
  }
  
  /**
   * Set the maximum display width and reflect to attribute
   * @param {number} value - The maximum width in pixels where the bottom sheet is shown
   */
  set maxDisplayWidth(value) {
    this.#maxDisplayWidth = value;
    
    // Don't set the attribute to "Infinity" in HTML
    if (value === Infinity) {
      this.removeAttribute('max-display-width');
    } else {
      this.setAttribute('max-display-width', value);
    }
  }

  constructor() {
    super();
    const _ = this;

    _.setAttribute('aria-hidden', true);

    // Initialize maxDisplayWidth from attribute or use default (Infinity = no limit)
    const attrWidth = _.getAttribute('max-display-width');
    if (attrWidth !== null && attrWidth !== 'none') {
      const parsed = parseInt(attrWidth);
      _.maxDisplayWidth = !isNaN(parsed) ? parsed : Infinity;
    } else {
      // Default: Infinity (no limit)
      _.maxDisplayWidth = Infinity;
    }

    // Set default drag properties
    _.drag = {
      isDragging: false,
      startY: 0,
      currentY: 0,
      endY: 0,
      delta: 0,
      direction: null, // 'up', 'down', or null when not dragging
    };

    // Using private field for threshold, no need to reassign here

    // Get panel elements
    _.panel = _.querySelector(':scope > bottom-sheet-panel');
    _.panelContent = _.panel.querySelector(':scope > bottom-sheet-content');
    _.overlay = _.querySelector('bottom-sheet-overlay');
    _.header = _.querySelector('bottom-sheet-header');

    // Bind event handlers
    this.#handleTouchStart = this.panelDragStart.bind(this);
    this.#handleTouchMove = this.panelDragMove.bind(this);
    this.#handleTouchEnd = this.panelDragEnd.bind(this);
    this.#handleTransitionEnd = this.handleTransitionEnd.bind(this);
    this.#handleOverlayClick = this.hide.bind(this);

    // Add resize handler with throttle
    this.#handleWindowResize = throttle(
      () => {
        if (window.innerWidth > _.maxDisplayWidth) {
          _.hide();
        }
      },
      100 // throttle limit
    );

    // Set ARIA attributes and bind UI
    _.setupAriaAttributes();
    _.bindUI();
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
    // Close on escape key press
    if (e.key === 'Escape' && this.getAttribute('aria-hidden') === 'false') {
      e.preventDefault();
      this.hide();
    }
  };

  /**
   * Binds all necessary event listeners to the component
   */
  bindUI() {
    const _ = this;

    // Bind touch events for header
    if (_.header) {
      _.header.addEventListener('touchstart', this.#handleTouchStart, true);
      _.header.addEventListener('touchmove', this.#handleTouchMove, false);
      _.header.addEventListener('touchend', this.#handleTouchEnd);
      _.header.addEventListener('touchcancel', this.#handleTouchEnd);
    }

    // Bind touch events for content
    if (_.panelContent) {
      _.panelContent.addEventListener('touchstart', this.#handleTouchStart, true);
      _.panelContent.addEventListener('touchmove', this.#handleTouchMove, false);
      _.panelContent.addEventListener('touchend', this.#handleTouchEnd);
      _.panelContent.addEventListener('touchcancel', this.#handleTouchEnd);
    }

    // Bind touch events for overlay
    if (_.overlay) {
      _.overlay.addEventListener('touchstart', this.#handleTouchStart, true);
      _.overlay.addEventListener('touchmove', this.#handleTouchMove, false);
      _.overlay.addEventListener('touchend', this.#handleTouchEnd);
      _.overlay.addEventListener('touchcancel', this.#handleTouchEnd);
      _.overlay.addEventListener('click', this.#handleOverlayClick);
    }

    // Transition end handler
    if (_.panel) {
      _.panel.addEventListener('transitionend', this.#handleTransitionEnd);
    }

    // Add keyboard support
    document.addEventListener('keydown', this.#handleKeyDown);
  }

  connectedCallback() {
    window.addEventListener('resize', this.#handleWindowResize);

    // Initial check
    if (window.innerWidth > this.maxDisplayWidth) {
      this.hide();
    }
  }

  /**
   * Cleanup event listeners when element is removed
   */
  disconnectedCallback() {
    const _ = this;

    // Remove resize listener
    window.removeEventListener('resize', this.#handleWindowResize);

    if (_.header) {
      _.header.removeEventListener('touchstart', this.#handleTouchStart, true);
      _.header.removeEventListener('touchmove', this.#handleTouchMove, false);
      _.header.removeEventListener('touchend', this.#handleTouchEnd);
      _.header.removeEventListener('touchcancel', this.#handleTouchEnd);
    }

    if (_.panelContent) {
      _.panelContent.removeEventListener('touchstart', this.#handleTouchStart, true);
      _.panelContent.removeEventListener('touchmove', this.#handleTouchMove, false);
      _.panelContent.removeEventListener('touchend', this.#handleTouchEnd);
      _.panelContent.removeEventListener('touchcancel', this.#handleTouchEnd);
    }

    if (_.overlay) {
      _.overlay.removeEventListener('touchstart', this.#handleTouchStart, true);
      _.overlay.removeEventListener('touchmove', this.#handleTouchMove, false);
      _.overlay.removeEventListener('touchend', this.#handleTouchEnd);
      _.overlay.removeEventListener('touchcancel', this.#handleTouchEnd);
      _.overlay.removeEventListener('click', this.#handleOverlayClick);
    }

    if (_.panel) {
      _.panel.removeEventListener('transitionend', this.#handleTransitionEnd);
    }
    
    // Remove keyboard listener
    document.removeEventListener('keydown', this.#handleKeyDown);
  }

  /**
   * Toggles body scrolling on/off when the bottom sheet is shown/hidden
   * @param {boolean} disable - Whether to disable body scrolling
   */
  toggleBodyScroll(disable) {
    if (disable) {
      this.#scrollPosition = window.pageYOffset;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${this.#scrollPosition}px`;
      document.body.style.width = '100%';
    } else {
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('width');
      window.scrollTo(0, this.#scrollPosition);
      this.#scrollPosition = 0;
    }
  }

  panelDragStart(e) {
    const _ = this;
    const drag = _.drag;

    drag.startY = e.targetTouches[0].screenY;
    drag.direction = null; // Reset direction for new drag
    drag.delta = 0;

    _.panel.classList.remove('transitioning');

    if (
      _.panelContent.scrollTop === 0 ||
      e.target.closest('bottom-sheet-header') ||
      e.target.closest('bottom-sheet-overlay')
    ) {
      drag.isDragging = true;
    }
  }

  /**
   * Applies resistance to a drag value to create a rubber-band effect
   * @param {number} value - The raw drag distance
   * @returns {number} - The drag with resistance applied
   */
  #applyResistance(value) {
    // Square root provides a nice feel (more resistance as you drag further)
    return Math.sqrt(value) * 10 * this.#overscrollResistance;
  }

  panelDragMove(e) {
    const _ = this;
    const drag = _.drag;

    if (!drag.isDragging) return;

    drag.currentY = e.targetTouches[0].screenY;
    drag.delta = drag.currentY - drag.startY;

    // Initial direction detection
    if (!drag.direction) {
      // We need to determine if we're moving up or down
      if (drag.delta < 0) {
        // We're moving upward (negative delta)
        drag.direction = 'up';
      } else {
        // We're moving downward (positive delta)
        drag.direction = 'down';
      }
    }

    // Handle upward movement (negative delta) - pulling beyond top position
    if (drag.delta < 0) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      
      // Apply strong resistance to upward movement
      // This makes it hard to pull the sheet beyond its natural top position
      const absValue = Math.abs(drag.delta);
      const resistedDelta = this.#applyResistance(absValue); // Use internal resistance constant
      
      // Convert back to negative (upward movement)
      _.panel.style.transform = `translate3d(0,${-resistedDelta}px,0)`;
      return;
    }

    // Handle downward movement (positive delta) - dismissing
    if (drag.delta > 0) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      
      // For downward drag, use natural movement with no resistance
      // This feels like a normal draggable surface with no stretchy effect
      _.panel.style.transform = `translate3d(0,${drag.delta}px,0)`;
      
      // Visual feedback when passing threshold (subtle)
      if (drag.delta > this.#dragThreshold) ;
    }
  }

  panelDragEnd(e) {
    const _ = this;
    const drag = _.drag;

    if (!drag.isDragging) return;

    drag.isDragging = false;

    // Add the transitioning class to ensure smooth animation back to position
    _.panel.classList.add('transitioning');
    
    // Handle negative delta (upward drag attempts) - always snap back to normal
    if (drag.delta < 0) {
      drag.delta = 0;
      drag.direction = null; // Reset direction for next drag
      _.show(); // This resets transform to normal position
      return;
    }

    // For downward drags, check if we've passed the dismissal threshold
    if (drag.delta > this.#dragThreshold) {
      drag.delta = 0;
      drag.direction = null; // Reset direction for next drag
      _.hide();
      return;
    }

    // Otherwise snap back to normal position
    drag.delta = 0;
    drag.direction = null; // Reset direction for next drag
    _.show();
  }

  handleTransitionEnd(e) {
    if (e.propertyName === 'transform') {
      this.panel.classList.remove('transitioning');
    }
  }

  /**
   * Shows the bottom sheet and dispatches an open event
   */
  show() {
    const _ = this;

    // Don't show if width is above max display width or was closed by resize
    if (window.innerWidth > _.maxDisplayWidth) {
      return;
    }

    _.setAttribute('aria-hidden', 'false');
    _.removeAttribute('inert');
    _.panel.classList.add('transitioning');
    _.panel.style.transform = null;
    _.toggleBodyScroll(true);
    
    // Dispatch custom event
    this.dispatchEvent(new CustomEvent('bottomsheet:open', {
      bubbles: true,
      detail: { sheet: this }
    }));
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
    
    // Dispatch custom event
    this.dispatchEvent(new CustomEvent('bottomsheet:close', {
      bubbles: true,
      detail: { sheet: this }
    }));
  }
}

// Supporting component classes
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

// Define custom elements
customElements.define('bottom-sheet', BottomSheet);
customElements.define('bottom-sheet-panel', BottomSheetPanel);
customElements.define('bottom-sheet-content', BottomSheetContent);
customElements.define('bottom-sheet-overlay', BottomSheetOverlay);
customElements.define('bottom-sheet-header', BottomSheetHeader);

export { BottomSheet, BottomSheetContent, BottomSheetHeader, BottomSheetOverlay, BottomSheetPanel };
//# sourceMappingURL=bottom-sheet.esm.js.map
