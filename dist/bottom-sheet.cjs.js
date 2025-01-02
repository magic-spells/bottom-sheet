'use strict';

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

  constructor() {
    super();
    const _ = this;

    _.setAttribute('aria-hidden', true);

    // Add maxWidth property with default using dataset API
    _.maxWidth = parseInt(_.dataset.maxWidth) || 768;

    // Set default drag properties
    _.drag = {
      isDragging: false,
      startY: 0,
      currentY: 0,
      endY: 0,
      delta: 0,
    };

    // Drag threshold
    _.threshold = 100;

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

    // Add resize handler with throttle and debounce
    this.#handleWindowResize = throttle(
      () => {
        console.log('window resize throttle');
        if (window.innerWidth > _.maxWidth) {
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
   * Binds the necessary UI events to the component
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
  }

  connectedCallback() {
    window.addEventListener('resize', this.#handleWindowResize);

    // Initial check
    if (window.innerWidth > this.maxWidth) {
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
  }

  toggleBodyScroll(disable) {
    const _ = this;
    if (disable) {
      _.scrollPosition = window.pageYOffset;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${_.scrollPosition}px`;
      document.body.style.width = '100%';
    } else {
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('width');
      window.scrollTo(0, _.scrollPosition);
      _.scrollPosition = 0;
    }
  }

  panelDragStart(e) {
    const _ = this;
    const drag = _.drag;

    drag.startY = e.targetTouches[0].screenY;
    drag.direction = false;
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

  panelDragMove(e) {
    const _ = this;
    const drag = _.drag;

    if (!drag.isDragging) return;

    drag.currentY = e.targetTouches[0].screenY;
    drag.delta = drag.currentY - drag.startY;

    if (!drag.direction) {
      if (drag.delta < 0) {
        drag.isDragging = false;
        return;
      }
      drag.direction = true;
    }

    if (drag.delta < 0) {
      _.panel.style.transform = 'translate3d(0,0,0)';
      return;
    }

    if (drag.delta > 0) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }

    _.panel.style.transform = `translate3d(0,${drag.delta}px,0)`;
  }

  panelDragEnd(e) {
    const _ = this;
    const drag = _.drag;

    if (!drag.isDragging) return;

    drag.isDragging = false;

    if (drag.delta > _.threshold) {
      drag.delta = 0;
      _.hide();
      return;
    }

    drag.delta = 0;
    _.show();
  }

  handleTransitionEnd(e) {
    if (e.propertyName === 'transform') {
      this.panel.classList.remove('transitioning');
    }
  }

  show() {
    const _ = this;

    // Don't show if width is above max or was closed by resize
    if (window.innerWidth > _.maxWidth) {
      return;
    }

    _.setAttribute('aria-hidden', 'false');
    _.removeAttribute('inert');
    _.panel.classList.add('transitioning');
    _.panel.style.transform = null;
    _.toggleBodyScroll(true);
  }

  hide() {
    const _ = this;
    _.setAttribute('aria-hidden', 'true');
    _.setAttribute('inert', '');
    _.panel.classList.add('transitioning');
    _.panel.style.transform = null;
    _.toggleBodyScroll(false);
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

// export { BottomSheet, BottomSheetPanel, BottomSheetContent, BottomSheetOverlay, BottomSheetHeader };
//# sourceMappingURL=bottom-sheet.cjs.js.map
