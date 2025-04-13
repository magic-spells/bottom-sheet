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

<bottom-sheet 
  id="bottom-sheet" 
  aria-hidden="true"
  max-display-width="768">
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
      <button data-action="close-bottom-sheet">Cancel</button>
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
- Clicking the "Show Bottom Sheet" button will call the show() method, making the bottom sheet visible.
- You can drag the sheet down to close it or click the background overlay.
- The hide() method is used to programmatically close the bottom sheet.
- The sheet automatically hides on screens wider than the specified max-display-width (if provided).
- Any element within the bottom sheet with a `data-action="close-bottom-sheet"` attribute will close the sheet when clicked.

## Configuration

The bottom sheet can be configured using the following attributes:

| Attribute | Description | Default |
|-----------|-------------|---------|
| `max-display-width` | Maximum viewport width in pixels at which the bottom sheet is displayed. If the viewport is wider, the sheet will automatically hide. Omit this attribute to show on all screen sizes. | None (no limit) |
| `aria-label` | Accessible label for the bottom sheet. | "Bottom sheet content" |

Example:
```html
<!-- Bottom sheet that only shows on mobile devices -->
<bottom-sheet max-display-width="600" aria-label="Mobile menu">
  <!-- content -->
</bottom-sheet>

<!-- Bottom sheet that shows on all screen sizes -->
<bottom-sheet aria-label="Universal menu">
  <!-- content -->
</bottom-sheet>
```

## Customization

### Styling

You can style the Bottom Sheet using CSS custom properties:

```css
:root {
  /* Colors */
  --bs-overlay-background: rgba(0, 0, 0, 0.7); /* Darker overlay */
  --bs-panel-background: #f8f8f8; /* Light gray panel */
  --bs-handle-color: #999; /* Darker handle */
  
  /* Sizing */
  --bs-panel-height: 70vh; /* Shorter panel */
  --bs-panel-top-position: 30vh; /* Start higher */
  --bs-panel-border-radius: 16px; /* Smaller border radius */
  
  /* Animation */
  --bs-transition-duration: 250ms; /* Faster animation */
  --bs-transition-blur: 3px; /* Less blur */
}
```

### SCSS Integration

For more advanced customization, you can import the SCSS directly:

```scss
// Option 1: Import the compiled CSS
@import '@magic-spells/bottom-sheet/css';

// Option 2: Import the SCSS and override variables
@use '@magic-spells/bottom-sheet/scss' with (
  $panel-height: 70vh,
  $panel-top-position: 30vh,
  $overlay-background: rgba(0, 0, 0, 0.7),
  $transition-duration: 250ms
);

// Option 3: Import specific parts
@use '@magic-spells/bottom-sheet/scss/variables' with (
  $panel-border-radius: 16px
);
@use '@magic-spells/bottom-sheet/scss/bottom-sheet';
```

### JavaScript API

#### Methods

- `show()`: Opens the bottom sheet.
- `hide()`: Closes the bottom sheet.

#### Keyboard Support

- `Escape` key: Closes the bottom sheet when open.

#### Custom Events

The component fires the following custom events:

- `bottomsheet:open`: Fired when the bottom sheet is opened.
- `bottomsheet:close`: Fired when the bottom sheet is closed.

```javascript
// Example usage
const sheet = document.getElementById('my-bottom-sheet');

sheet.addEventListener('bottomsheet:open', (e) => {
  console.log('Bottom sheet opened', e.detail.sheet);
});

sheet.addEventListener('bottomsheet:close', (e) => {
  console.log('Bottom sheet closed', e.detail.sheet);
});
```

#### Touch Events

You can listen for specific touch events on the header, content, or overlay to customize behavior.

## Browser Support

This component works in all modern browsers that support Web Components.

## License

MIT