(function () {
  'use strict';

  /**
   * BottomSheet class that handles the functionality of a bottom sheet component
   */
  class BottomSheet extends HTMLElement {
    constructor() {
      super();
      const _ = this;

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
      _.panelContent = _.panel.querySelector(
        ':scope > bottom-sheet-content'
      );
      _.overlay = _.querySelector('bottom-sheet-overlay');
      _.header = _.querySelector('bottom-sheet-header');

      // Set ARIA attributes for accessibility
      _.setupAriaAttributes();

      // Bind DOM events and show panel
      _.bindUI();
    }

    /**
     * Sets up ARIA attributes for accessibility
     */
    setupAriaAttributes() {
      const _ = this;

      // Ensure ARIA attributes are set
      _.setAttribute('role', 'dialog');
      _.setAttribute('aria-hidden', 'true');
      _.setAttribute('aria-modal', 'true');

      // Check if aria-label is already set, if not, set the default
      if (!_.hasAttribute('aria-label')) {
        _.setAttribute('aria-label', 'Bottom sheet content');
      }
    }

    /**
     * Binds the necessary UI events to the component
     */
    bindUI() {
      const _ = this;

      // Bind touch events for header dragging functionality
      if (_.header) {
        _.header.addEventListener(
          'touchstart',
          (e) => _.panelDragStart(e),
          true
        );
        _.header.addEventListener(
          'touchmove',
          (e) => _.panelDragMove(e),
          false
        );
        _.header.addEventListener('touchend', (e) => _.panelDragEnd(e));
        _.header.addEventListener('touchcancel', (e) =>
          _.panelDragEnd(e)
        );
      }

      // Bind touch events for content dragging functionality
      if (_.panelContent) {
        _.panelContent.addEventListener(
          'touchstart',
          (e) => _.panelDragStart(e),
          true
        );
        _.panelContent.addEventListener(
          'touchmove',
          (e) => _.panelDragMove(e),
          false
        );
        _.panelContent.addEventListener('touchend', (e) =>
          _.panelDragEnd(e)
        );
        _.panelContent.addEventListener('touchcancel', (e) =>
          _.panelDragEnd(e)
        );
      }

      // Bind click event for background overlay for closing the panel
      if (_.overlay) {
        _.overlay.addEventListener(
          'touchstart',
          (e) => _.panelDragStart(e),
          true
        );
        _.overlay.addEventListener(
          'touchmove',
          (e) => _.panelDragMove(e),
          false
        );
        _.overlay.addEventListener('touchend', (e) =>
          _.panelDragEnd(e)
        );
        _.overlay.addEventListener('touchcancel', (e) =>
          _.panelDragEnd(e)
        );
        _.overlay.addEventListener('click', () => _.hide());
      }

      // Used to remove style attributes after an animation has finished
      if (_.panel) {
        _.panel.addEventListener('transitionend', (e) =>
          _.handleTransitionEnd(e)
        );
      }
    }

    /**
     * Toggles body scroll
     * @param {boolean} disable - Whether to disable or enable body scroll
     */
    toggleBodyScroll(disable) {
      const _ = this;
      if (disable) {
        // Store the current body scroll position
        _.scrollPosition = window.pageYOffset;
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${_.scrollPosition}px`;
        document.body.style.width = '100%';
      } else {
        // Restore the body scroll
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('top');
        document.body.style.removeProperty('width');
        window.scrollTo(0, _.scrollPosition);
        _.scrollPosition = 0; // Reset scroll position
      }
    }

    /**
     * Handles the start of a panel drag event
     * @param {TouchEvent} e - The touch event
     */
    panelDragStart(e) {
      const _ = this;
      const drag = _.drag;

      // Save starting Y position
      drag.startY = e.targetTouches[0].screenY;

      // Reset these variables
      drag.direction = false;
      drag.delta = 0;

      // Clear transition class
      _.panel.classList.remove('transitioning');

      // Only approve drag if at top of scroll panel or if we grabbed the header
      if (
        _.panelContent.scrollTop === 0 ||
        e.target.closest('bottom-sheet-header') ||
        e.target.closest('bottom-sheet-overlay')
      ) {
        drag.isDragging = true;
      }
    }

    /**
     * Handles the movement of a panel drag event
     * @param {TouchEvent} e - The touch event
     */
    panelDragMove(e) {
      const _ = this;
      const drag = _.drag;

      // Exit if drag wasn't approved
      if (!drag.isDragging) return;

      // Get current touch Y position and calculate delta
      drag.currentY = e.targetTouches[0].screenY;
      drag.delta = drag.currentY - drag.startY;

      // Make sure we're dragging in the right direction (down)
      if (!drag.direction) {
        // Cancel if direction is up
        if (drag.delta < 0) {
          drag.isDragging = false;
          return;
        }
        drag.direction = true;
      }

      // Prevent upward push
      if (drag.delta < 0) {
        _.panel.style.transform = 'translate3d(0,0,0)';
        return;
      }

      // Prevent scrolling the content while dragging
      if (drag.delta > 0) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }

      // Apply drag transformation
      _.panel.style.transform = `translate3d(0,${drag.delta}px,0)`;
    }

    /**
     * Handles the end of a panel drag event
     * @param {TouchEvent} e - The touch event
     */
    panelDragEnd(e) {
      const _ = this;
      const drag = _.drag;

      // Exit if we didn't approve dragging
      if (!drag.isDragging) return;

      // Finish dragging
      drag.isDragging = false;

      // Met drag threshold - hide panel
      if (drag.delta > _.threshold) {
        drag.delta = 0;
        _.hide();
        return;
      }

      // Didn't meet drag threshold - reshow panel
      drag.delta = 0;
      _.show();
    }

    /**
     * Handles the end of the transition event
     * @param {TransitionEvent} e - The transition event
     */
    handleTransitionEnd(e) {
      if (e.propertyName === 'transform') {
        // Clear transition property after the hide transition is done
        this.panel.classList.remove('transitioning');
      }
    }

    /**
     * Shows the bottom sheet panel
     */
    show() {
      const _ = this;
      _.setAttribute('aria-hidden', 'false');
      _.panel.classList.add('transitioning');
      _.panel.style.transform = null;
      _.toggleBodyScroll(true); // Disable body scroll
    }

    /**
     * Hides the bottom sheet panel
     */
    hide() {
      const _ = this;
      _.setAttribute('aria-hidden', 'true');
      _.panel.classList.add('transitioning');
      _.panel.style.transform = null;
      _.toggleBodyScroll(false); // Enable body scroll
    }
  }

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

  customElements.define('bottom-sheet', BottomSheet);
  customElements.define('bottom-sheet-panel', BottomSheetPanel);
  customElements.define('bottom-sheet-content', BottomSheetContent);
  customElements.define('bottom-sheet-overlay', BottomSheetOverlay);
  customElements.define('bottom-sheet-header', BottomSheetHeader);

})();
//# sourceMappingURL=bottom-sheet.js.map
