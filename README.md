# Bottom Sheet Web Component

A lightweight, customizable Web Component for creating accessible bottom sheets. Perfect for mobile-friendly modals, menus, or interactive panels that slide in from the bottom of the screen.

## Features

- No dependencies
- Lightweight
- Follows accessibility best practices
- Smooth open/close animations
- Supports touch gestures for drag-to-close
- Handles Escape key for closing
- Uses aria attributes for accessibility

## Installation

```bash
npm install @magic-spells/bottom-sheet
```

```javascript
// Add to your JavaScript file
import '@magic-spells/bottom-sheet';
```

Or include directly in your HTML:

```html
<script src="https://unpkg.com/@magic-spells/bottom-sheet"></script>
```

## Usage

```html
<button
  id="show-bottom-sheet-button"
  aria-controls="bottom-sheet"
  aria-expanded="false">
  Show Bottom Sheet
</button>

<bottom-sheet id="bottom-sheet" aria-hidden="true">
  <bottom-sheet-overlay></bottom-sheet-overlay>

  <bottom-sheet-panel>
    <bottom-sheet-header>
      <div style="padding-top: 12px">
        <h4 style="margin: 0; padding: 8px 0">Header</h4>
      </div>
    </bottom-sheet-header>

    <bottom-sheet-content>
      <ul>
        <li>Item 1</li>
        <li>Item 2</li>
        <li>Item 3</li>
      </ul>
    </bottom-sheet-content>

    <div class="bottom-sheet-button-panel">
      <button>Cancel</button>
      <button>Apply</button>
    </div>
  </bottom-sheet-panel>
</bottom-sheet>

<script>
  const button = document.getElementById('show-bottom-sheet-button');
  const bottomSheet = document.getElementById('bottom-sheet');

  button.addEventListener('click', () => bottomSheet.show());
</script>
```

## How It Works

- The bottom sheet is initially hidden (aria-hidden="true").
- Clicking the “Show Bottom Sheet” button will call the show() method, making the bottom sheet visible.
- You can drag the sheet down to close it or click the background overlay.
- The hide() method is used to programmatically close the bottom sheet.

## Customization

### Styling

You can style the Bottom Sheet by overriding or extending the provided CSS:

```css
bottom-sheet {
  /* Customize your bottom sheet */
}

bottom-sheet-header {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 18px;
}

.bottom-sheet-button-panel button {
  flex: 1;
  appearance: none;
  background: white;
  border-radius: 5px;
  padding: 8px;
  font-family: Helvetica, Arial, sans-serif;
}
```

### JavaScript API

#### Methods

- `show()`: Opens the bottom sheet.
- `hide()`: Closes the bottom sheet.

#### Event Listeners

You can listen for specific touch events on the header, content, or overlay to customize behavior.

## Browser Support

This component works in all modern browsers that support Web Components.

## License

MIT
