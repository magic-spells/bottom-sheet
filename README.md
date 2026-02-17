# Bottom Sheet Web Component

A lightweight, customizable Web Component for creating accessible bottom sheets. Perfect for mobile-friendly modals, menus, or interactive panels that slide in from the bottom of the screen.

[**Live Demo**](https://magic-spells.github.io/bottom-sheet/demo/)

## Features

- Built on `@magic-spells/dialog-panel` for native `<dialog>` accessibility
- Smooth open/close animations with state-driven CSS
- Touch gestures for drag-to-close with rubber-band physics
- Escape key handling via native `<dialog>`
- Focus trapping via `showModal()`
- Customizable with CSS custom properties

## Installation

```bash
npm install @magic-spells/bottom-sheet @magic-spells/dialog-panel
```

```javascript
// Add to your JavaScript file
import '@magic-spells/dialog-panel';
import '@magic-spells/bottom-sheet';
```

Or include directly in your HTML:

```html
<script src="https://unpkg.com/@magic-spells/dialog-panel"></script>
<script src="https://unpkg.com/@magic-spells/bottom-sheet"></script>
```

## Usage

```html
<button id="show-bottom-sheet-button">Show Bottom Sheet</button>

<dialog-panel id="sheet-dialog">
	<dialog>
		<bottom-sheet max-display-width="768">
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
				<button data-action-hide-dialog>Cancel</button>
				<button>Apply</button>
			</div>
		</bottom-sheet>
	</dialog>
</dialog-panel>

<script>
	const button = document.getElementById('show-bottom-sheet-button');
	const sheet = document.querySelector('bottom-sheet');

	button.addEventListener('click', (e) => sheet.show(e.target));
</script>
```

## How It Works

- The bottom sheet is wrapped in a `<dialog-panel>` and native `<dialog>` element.
- Clicking the trigger button calls `show(triggerEl)`, which opens the sheet via `dialog-panel`.
- You can drag the sheet down to close it or click the backdrop overlay.
- The `hide()` method programmatically closes the bottom sheet.
- The sheet automatically hides on screens wider than `max-display-width` (if set).
- Any element with a `data-action-hide-dialog` attribute will close the sheet when clicked.
- Accessibility (focus trapping, `aria-modal`, escape key) is handled by the native `<dialog>` element.

## Configuration

The bottom sheet can be configured using the following attributes:

| Attribute           | Description                                                                                                                                                                            | Default         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `max-display-width` | Maximum viewport width in pixels at which the bottom sheet is displayed. If the viewport is wider, the sheet will automatically hide. Omit this attribute to show on all screen sizes. | None (no limit) |

Example:

```html
<!-- Bottom sheet that only shows on mobile devices -->
<dialog-panel>
	<dialog>
		<bottom-sheet max-display-width="600">
			<!-- content -->
		</bottom-sheet>
	</dialog>
</dialog-panel>

<!-- Bottom sheet that shows on all screen sizes -->
<dialog-panel>
	<dialog>
		<bottom-sheet>
			<!-- content -->
		</bottom-sheet>
	</dialog>
</dialog-panel>
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
	--bs-panel-max-height: 70vh; /* Shorter panel */
	--bs-panel-border-radius: 16px; /* Smaller border radius */

	/* Animation */
	--bs-transition-duration: 250ms; /* Faster animation */

	/* Effects */
	--bs-overlay-blur: 3px; /* Less blur */
}
```

### JavaScript API

#### Methods

- `show(triggerEl)`: Opens the bottom sheet. Pass the trigger element for focus return on close.
- `hide()`: Closes the bottom sheet.

#### Properties

- `maxDisplayWidth`: Get/set the maximum viewport width for display (number or `Infinity`).
- `panel`: Reference to the parent `<dialog-panel>` element.
- `dialog`: Reference to the parent `<dialog>` element.

#### Keyboard Support

- `Escape` key: Closes the bottom sheet when open (handled by native `<dialog>`).

#### Events

Events are dispatched on the `<dialog-panel>` element. All events bubble and are composed.

- `beforeShow`: Fired before opening (cancelable).
- `shown`: Fired after the open animation completes.
- `beforeHide`: Fired before closing (cancelable).
- `hidden`: Fired after the close animation completes.

All events include `detail.triggerElement`, `detail.result`, and `detail.state`.

```javascript
const panel = document.getElementById('sheet-dialog');

panel.addEventListener('shown', (e) => {
	console.log('Bottom sheet opened', e.detail);
});

panel.addEventListener('hidden', (e) => {
	console.log('Bottom sheet closed', e.detail);
});
```

#### Touch Gestures

- **Header drag**: Always allows dragging the panel down to dismiss.
- **Backdrop drag**: Always allows dragging the panel down to dismiss.
- **Content drag**: Allows panel drag when content is scrolled to top and dragging down.
- **Upward drag**: Applies rubber-band resistance.
- **Downward drag past threshold**: Dismisses the sheet.

## Browser Support

This component works in all modern browsers that support Web Components and the `<dialog>` element.

## License

MIT
