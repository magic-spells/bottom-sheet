import './bottom-sheet.scss';

/**
 * BottomSheet class that handles the functionality of a bottom sheet component
 */
class BottomSheet extends HTMLElement {
  constructor() {
    super();
    const _ = this;

    // make sure aria state is set to hidden
    _.setAttribute('aria-hidden', true);

    // get panel elements
    _.panel = _.querySelector(':scope > bottom-sheet-panel');
    _.panelContent = _.panel.querySelector(':scope > bottom-sheet-content');
    _.overlay = _.querySelector('bottom-sheet-overlay');

    // set default drag properties
    _.drag = {
      isDragging: false,
      startY: 0,
      currentY: 0,
      endY: 0,
      velocity: 0,
      delta: 0
    };

    // bind DOM events and show panel
    _.bindUI();
    _.showPanel();
  }

  /**
   * Binds the necessary UI events to the component
   */
  bindUI() {
    const _ = this;
    _.panelContent.addEventListener('touchstart', (e) => _.panelDragStart(e), false);
    _.panelContent.addEventListener('touchmove', (e) => _.panelDragMove(e), false);
    _.panelContent.addEventListener('touchend', (e) => _.panelDragEnd(e));
    _.panelContent.addEventListener('touchcancel', (e) => _.panelDragEnd(e));
    _.overlay.addEventListener('click', () => _.hidePanel());
    _.panel.addEventListener('transitionend', (e) => _.handleTransitionEnd(e));
  }

  /**
   * Handles the start of a panel drag event
   * @param {TouchEvent} e - The touch event
   */
  panelDragStart(e) {
    const _ = this;
    const drag = _.drag;

    // save starting Y position
    drag.startY = e.targetTouches[0].screenY;

    // reset these variables
    drag.velocity = 0;
    drag.direction = false;
    drag.delta = 0;

    // clear transition property
    _.panel.style.transition = "";

    // only approve drag if at top of scroll panel
    if (_.panelContent.scrollTop === 0) {
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

    // exit if drag wasn't approved
    if (!drag.isDragging) return;

    // get current touch Y position
    drag.currentY = e.targetTouches[0].screenY;
    // calculate delta
    drag.delta = drag.currentY - drag.startY;

    // make sure we're dragging in the right direction (down)
    if (!drag.direction) {
      // cancel if direction is up
      if (drag.delta < 0) {
        drag.isDragging = false;
        return;
      }
      drag.direction = true;
    }

    // calculate drag delta
    drag.currentY = e.targetTouches[0].screenY;
    drag.delta = drag.currentY - drag.startY;

    // make sure we don't push it up
    if (drag.delta < 0) {
      _.panel.style.transform = `translate3d(0,0,0)`;
      return;
    }

    // make sure we aren't scrolling the content
    if (drag.delta > 0) {
      _.panelContent.scrollTop = 0;
      // prevents scroll from happening on content
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }

    // apply drag transformation
    _.panel.style.transform = `translate3d(0,${drag.delta}px,0)`;
  }

  /**
   * Handles the end of a panel drag event
   * @param {TouchEvent} e - The touch event
   */
  panelDragEnd(e) {
    const _ = this;
    const drag = _.drag;

    if (!drag.isDragging) return;

    drag.isDragging = false;

    // met drag threshold - hide panel
    if (drag.delta > 100) {
      drag.delta = 0;
      _.hidePanel();
      return;
    }

    // didn't meet drag threshold - reshow panel
    drag.delta = 0;
    _.showPanel();
  }

  /**
   * Handles the end of the transition event
   * @param {TransitionEvent} e - The transition event
   */
  handleTransitionEnd(e) {
    if (e.propertyName === 'transform') {
      // clear transition property after the hide transition is done
      this.panel.style.transition = "";
    }
  }

  /**
   * Shows the bottom sheet panel
   */
  showPanel() {
    const _ = this;
    _.setAttribute('aria-hidden', false);
    _.panel.style.transition = "transform 300ms ease";
    _.panel.style.transform = 'translate3d(0,0,0)';
  }

  /**
   * Hides the bottom sheet panel
   */
  hidePanel() {
    const _ = this;

    _.setAttribute('aria-hidden', true);

    _.panel.style.transition = "transform 300ms ease";
    _.panel.style.transform = 'translate3d(0,100%,0)';
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

customElements.define('bottom-sheet', BottomSheet);
customElements.define('bottom-sheet-panel', BottomSheetPanel);
customElements.define('bottom-sheet-content', BottomSheetContent);
customElements.define('bottom-sheet-overlay', BottomSheetOverlay);