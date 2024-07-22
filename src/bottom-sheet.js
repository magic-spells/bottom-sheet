import './bottom-sheet.scss';



class BottomSheet extends HTMLElement {
  static stylesAppended = false;

  constructor() {
    super();
    const _ = this;

    // Append styles only if they haven't been appended yet
    if (!BottomSheet.stylesAppended) {
      this.appendStyles();
      BottomSheet.stylesAppended = true;
    }

    _.setAttribute('aria-hidden', true)

    _.panel = _.querySelector(':scope > bottom-sheet-panel')
    _.panelContent = _.panel.querySelector(':scope > bottom-sheet-content')
    _.overlay = _.querySelector('bottom-sheet-overlay');
    _.drag = {
      isDragging: false,
      startY: 0,
      currentY: 0,
      endY: 0,
      velocity: 0,
      delta: 0
    }

    _.bindUI();
    _.showPanel()
  }

   appendStyles() {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = `
      bottom-sheet-overlay {
        position: fixed;
        top: 0px;
        left: 0px;
        width: 100vw;
        height: 100%;
        background: rgba(0,0,0,0.5);
        box-sizing: border-box;
      }


      bottom-sheet-panel{
        background: white; 
        box-sizing: border-box;
        border-top-left-radius: 25px;
        border-top-right-radius: 25px;
        position: fixed;

        display: flex;
        flex-direction: column;

        width: 100%;
        top: 20vh;
        left: 0px;
        overflow: hidden;
        box-shadow: 0px 1px 20px -4px rgba(0,0,0,0.3),  0px 0px 7px 0px rgba(0,0,0,0.1);
        will-change: transform;
        height: 85vh;
        box-sizing: border-box;
      }

      bottom-sheet-panel.transition-fast {
        transition: transform 300ms ease;
      }

      bottom-sheet-content {
        box-sizing: border-box;
        width: 100%;
        overflow-y: scroll;
        -webkit-overflow-scrolling: touch; 
        padding: 0px 20px;
      }   
      `;
    document.head.appendChild(style);
  }

  bindUI () {
    const _ = this;
    _.panelContent.addEventListener('touchstart',     (e) => _.panelDragStart(e), false);
    _.panelContent.addEventListener('touchmove',      (e) => _.panelDragMove(e), false);
    _.panelContent.addEventListener('touchend',       (e) => _.panelDragEnd(e));
    _.panelContent.addEventListener('touchcancel',    (e) => _.panelDragEnd(e));
    _.overlay.addEventListener('click', () => _.hidePanel());
    _.panel.addEventListener('transitionend',         (e) => _.handleTransitionEnd(e));
  }

  panelDragStart = (e) => {
    const _ = this;
    const drag = _.drag

    // save starting Y position
    drag.startY = e.targetTouches[0].screenY;

    // reset these variables
    drag.velocity = 0;
    drag.direction = false;
    drag.delta = 0;

    // clear transition property 
    _.panel.style.transition = ""
    
    // only approve drag if at top of scroll panel
    if (_.panelContent.scrollTop == 0) {
      drag.isDragging = true
    }
  }


  panelDragMove = (e) => {
    const _ = this;
    const drag = _.drag;

    // exit if drag wasn't approved
    if (!drag.isDragging) return;

    // get current touch Y position
    drag.currentY = e.targetTouches[0].screenY;
    // calculate delta 
    drag.delta = drag.currentY - drag.startY;

    // make sure we're dragging in the right direction (down)
    if (!drag.direction){
      // cancel if direction is up
      if (drag.delta < 0){
        drag.isDragging = false
        return
      }
      drag.direction = true
    }

    // calcualte drag delta
    drag.currentY = e.targetTouches[0].screenY;
    drag.delta = drag.currentY - drag.startY;

    // make sure we don't push it up
    if (drag.delta < 0) {
      _.panel.style.transform = `translate3d(0,0,0)`
      return
    }

    // make sure we aren't scrolling the content
    if (drag.delta > 0){
      _.panelContent.scrollTop = 0
      // prevents scroll from happening on content
      if (e.cancelable) e.preventDefault();
      e.stopPropagation()
    }

    // apply drag transformation
    _.panel.style.transform = `translate3d(0,${ drag.delta }px,0)` 
    // return false
  }


  panelDragEnd = (e) => {
    const _ = this;
    const drag = _.drag

    if (!drag.isDragging) return;

    drag.isDragging = false
    
    // met drag threshold - hide panel
    if (drag.delta > 100){
      drag.delta = 0
      _.hidePanel()
      return
    }

    // didn't meet drag threshold - reshow panel
    drag.delta = 0
    _.showPanel()
  }

  handleTransitionEnd = (e) => {
    if (e.propertyName === 'transform') {
      this.panel.style.transition = ""
    }
  }

  showPanel = () => {
    const _ = this;
    _.setAttribute('aria-hidden', false)
    _.panel.style.transition = "transform 300ms ease"
    _.panel.style.transform = 'translate3d(0,0,0)'
  }

  hidePanel = () => {
    const _ = this;

    _.setAttribute('aria-hidden', true)
    
    _.panel.style.transition = "transform 300ms ease"
    _.panel.style.transform = 'translate3d(0,100%,0)'
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

  