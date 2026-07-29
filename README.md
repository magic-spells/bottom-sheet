# Bottom Sheet Web Component

Accessible bottom-sheet custom elements built on `@magic-spells/dialog-panel`. The sheet keeps modal behavior in the native `<dialog>` layer and adds Pointer Events dragging, velocity dismissal, scroll-aware gesture policy, safe-area spacing, and optional morph transitions.

[**Live Demo**](./demo/)

## Features

- Pointer Events gestures work with mouse, touch, and pen
- Fast downward flicks dismiss without a long drag
- Scrollable content keeps native vertical scrolling until a downward drag starts at the top
- Upward drags use a restrained rubber-band transform
- Native dialog focus trapping, focus return, Escape handling, and modal semantics
- Optional card-to-sheet morph transitions
- Responsive display limit through `max-display-width`
- Safe-area padding and contained vertical overscroll
- CSS-transition animations with no physics dependency

## Installation

```bash
npm install @magic-spells/bottom-sheet @magic-spells/dialog-panel
```

```js
import '@magic-spells/dialog-panel';
import '@magic-spells/bottom-sheet';

import '@magic-spells/dialog-panel/css';
import '@magic-spells/bottom-sheet/css';
```

## Usage

Keep the canonical structure intact: `dialog-panel` owns the native dialog, and `bottom-sheet` contains a header plus content.

```html
<button id="open-sheet">Open sheet</button>

<dialog-panel id="sheet-panel">
	<dialog aria-labelledby="sheet-title">
		<bottom-sheet>
			<bottom-sheet-header>
				<h2 id="sheet-title">A useful title</h2>
				<button data-action-hide-dialog aria-label="Close">&times;</button>
			</bottom-sheet-header>

			<bottom-sheet-content>
				<p>Scrollable sheet content goes here.</p>
			</bottom-sheet-content>
		</bottom-sheet>
	</dialog>
</dialog-panel>

<script type="module">
	const trigger = document.querySelector('#open-sheet');
	const sheet = document.querySelector('bottom-sheet');

	trigger.addEventListener('click', () => sheet.show(trigger));
</script>
```

Any element with `data-action-hide-dialog` delegates closing to the parent panel.

## Gestures

The header is always a drag surface. The content becomes a drag surface only when it starts at `scrollTop === 0` and the first movement is downward; otherwise the browser keeps native vertical scrolling. The generated backdrop also accepts a downward drag or a short tap.

A release dismisses the sheet through either rule:

- Downward velocity is greater than `0.5 px/ms`.
- Downward distance is greater than `100px` and release velocity is greater than `-0.05 px/ms`, preventing dismissal after a meaningful upward reversal.

Cancelled gestures always snap back. Upward drags never dismiss and use resistance instead of tracking the pointer one-to-one.

## Morph Integration

Install and load `@magic-spells/morph-engine`, assign one engine instance to the parent panel, and pass the source element to `show()`. `morph-display="flex"` preserves the bottom sheet layout during flight.

```html
<button id="sheet-card">Open from this card</button>

<dialog-panel id="morph-panel" morph morph-display="flex">
	<dialog>
		<bottom-sheet>
			<bottom-sheet-header>
				<h2>Expanded card</h2>
				<button data-action-hide-dialog aria-label="Close">&times;</button>
			</bottom-sheet-header>
			<bottom-sheet-content>
				<p>The card has become a modal bottom sheet.</p>
			</bottom-sheet-content>
		</bottom-sheet>
	</dialog>
</dialog-panel>

<script src="./morph-engine.min.js"></script>
<script type="module">
	const panel = document.querySelector('#morph-panel');
	const card = document.querySelector('#sheet-card');

	panel.morphEngine = new MorphEngine.MorphEngine({
		lockScroll: false,
		zIndex: 10000000,
	});

	card.addEventListener('click', () => panel.show(card));
</script>
```

The `morph` marker prevents drag policy from fighting a sheet while the panel state is `showing` or `hiding`.

## Responsive Display Limit

`max-display-width` is the largest viewport width, in pixels, where a sheet may open. It also closes an open sheet when a resize crosses the limit.

```html
<bottom-sheet max-display-width="768">
	<!-- header and content -->
</bottom-sheet>
```

Omit the attribute, remove it, or set the `maxDisplayWidth` property to `Infinity` for no limit.

## CSS Custom Properties

Set these on `:root`, a panel, or another ancestor.

| Property | Default | Description |
| --- | --- | --- |
| `--bs-panel-background` | `white` | Sheet background |
| `--bs-panel-max-height` | `85vh` | Maximum sheet height |
| `--bs-panel-border-radius` | `25px` | Top corner radius |
| `--bs-panel-box-shadow` | layered shadow | Sheet elevation |
| `--bs-handle-color` | `#bbb` | Drag-handle color |
| `--bs-handle-width` | `50px` | Drag-handle width |
| `--bs-handle-height` | `5px` | Drag-handle height |
| `--bs-content-padding` | `20px` | Horizontal header/content inset |
| `--bs-transition-duration` | `300ms` | Open, close, and snap-back duration |
| `--bs-transition-timing` | `ease` | Transition timing function |
| `--bs-overlay-background` | `rgba(0, 0, 0, 0.5)` | Backdrop fill |
| `--bs-overlay-blur` | `5px` | Backdrop blur |

```css
:root {
	--bs-panel-background: #171012;
	--bs-panel-border-radius: 18px;
	--bs-transition-duration: 240ms;
	--bs-overlay-blur: 8px;
}
```

## JavaScript API

### Methods

| Method | Description |
| --- | --- |
| `show(triggerEl)` | Open through the parent panel. The optional trigger is used for focus return. |
| `hide()` | Clear any gesture transform and close through the parent panel. |

### Properties

| Property | Description |
| --- | --- |
| `maxDisplayWidth` | Numeric responsive limit or `Infinity` |
| `panel` | Parent `<dialog-panel>` |
| `dialog` | Parent `<dialog>` |
| `header` | Descendant `<bottom-sheet-header>` |
| `content` | Descendant `<bottom-sheet-content>` |
| `backdrop` | Generated `<dialog-backdrop>`, when available |

## Events

Events come from the parent `<dialog-panel>`, bubble, and are composed.

| Event | Cancelable | When it fires |
| --- | --- | --- |
| `beforeShow` | Yes | Before opening begins |
| `shown` | No | After opening completes |
| `beforeHide` | Yes | Before closing begins |
| `hidden` | No | After closing completes |

Each event includes the panel detail object, including `detail.state`, `detail.triggerElement`, and `detail.result`.

```js
const panel = document.querySelector('#sheet-panel');

panel.addEventListener('shown', (event) => {
	console.log(event.detail.state);
});
```

## Accessibility

The parent panel and native `<dialog>` provide modal semantics, focus trapping, focus return, and Escape handling. Give the dialog an accessible name with `aria-labelledby` or `aria-label`, label icon-only close buttons, and keep a visible close action in the header.

## Browser Support

Modern browsers with custom elements, native `<dialog>`, Pointer Events, and `:has()` support.

## License

MIT
