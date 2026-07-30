# Bottom Sheet Web Component

Accessible bottom-sheet custom elements built on `@magic-spells/dialog-panel`. The sheet keeps modal behavior in the native `<dialog>` layer and adds Pointer Events dragging, velocity dismissal, scroll-aware gesture policy, and safe-area spacing.

[**Live Demo**](https://magic-spells.github.io/bottom-sheet/demo/)

## Features

- Pointer Events gestures work with mouse, touch, and pen
- Fast downward flicks dismiss without a long drag
- Optional snap points through `snap-points`, driven by height so the footer stays pinned at every snap
- Scrollable content hands the gesture to the panel mid-drag, the moment the list runs out
- Optional detached, fully rounded presentation through `inset`
- Upward drags use a restrained rubber-band transform
- Native dialog focus trapping, focus return, Escape handling, and modal semantics
- Responsive display limit through `max-display-width`
- Safe-area padding and contained vertical overscroll
- Snap points settle on a velocity-aware spring, so a hard throw and a slow drag arrive differently
- Opening, closing, and non-snapping sheets stay on plain CSS transitions

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

Keep the canonical structure intact: `dialog-panel` owns the native dialog, and `bottom-sheet` contains a header, content, and an optional footer.

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

			<bottom-sheet-footer>
				<button>Primary action</button>
			</bottom-sheet-footer>
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

The header and optional footer are always drag surfaces. The generated backdrop closes on tap through `dialog-panel`.

The content is the interesting case. Rather than deciding once at `pointerdown`, the sheet re-asks on every move until the panel claims the gesture. The panel claims when:

- the pointer is moving **down** and the content sits at `scrollTop === 0`, or
- the pointer is moving **up** and the sheet is below its tallest snap point.

That second rule only exists when snap points are declared — without them, an upward drag on content is always an ordinary scroll. Whatever distance the gesture had already travelled is recorded at the moment of the claim and subtracted afterwards, so the panel picks up from where your finger is instead of jumping. Once claimed, the panel keeps the gesture until release.

Re-asking on every move means a mouse or pen can reverse direction mid-gesture and hand the drag to the panel without lifting. **Touch cannot.** The content scrolls natively via `touch-action: pan-y`, and the Pointer Events specification does not let a gesture change owner once the browser has started scrolling with it — the pointer is cancelled and no further moves are delivered. So on a phone, scrolling a list to the top and continuing into a drag takes two gestures: lift, then drag. Supporting it in one would mean taking scrolling away from the browser, which is a worse trade than the extra lift.

A release dismisses a sheet **with no snap points** through either rule:

- Downward velocity is greater than `0.5 px/ms`.
- Downward distance is greater than `100px` and release velocity is greater than `-0.05 px/ms`, preventing dismissal after a meaningful upward reversal.

Cancelled gestures always snap back. Upward drags never dismiss and use resistance instead of tracking the pointer one-to-one.

## Snap Points

`snap-points` takes percentages of the viewport height. Each one becomes the dialog's **height**, not a distance to push it down by, which is what keeps the footer pinned to the bottom edge and the scrollable region exactly as tall as the visible area at every snap.

```html
<bottom-sheet snap-points="40,70,90">
	<!-- header, content, footer -->
</bottom-sheet>
```

Values are sorted and deduped; anything outside 0–100 or unparseable is dropped. Omit the attribute for the original two-state behavior — every rule below is inert without it.

On release:

| Release | Destination |
| --- | --- |
| Downward velocity above `0.5 px/ms` | The first snap below the current position |
| Upward velocity above `0.5 px/ms` | The first snap above, or the tallest |
| Anything slower | The nearest snap by distance |
| A downward flick with no snap below | Dismiss |

Stepping is measured from where the sheet currently is rather than the snap the gesture started at, so a flick never lands behind where you dragged to. Dragging below the shortest snap stops being a resize and becomes the ordinary dismiss gesture — that is the only place a snapping sheet closes from by gesture.

The sheet opens at the shortest snap unless you set `snap` yourself. After that the component reflects `snap`, on commit only, so it holds its last settled value for the duration of a drag.

```html
<bottom-sheet snap-points="25,55,92" snap="25"></bottom-sheet>
```

```js
sheet.snapPoints; // [25, 55, 92] — a copy; mutating it does nothing
sheet.snap; // 25
sheet.snapTo(92); // undeclared values are ignored, not clamped

sheet.addEventListener('snapChange', (event) => {
	console.log(event.detail); // { from: 25, to: 92 }
});
```

Resting heights are written as `dvh` strings rather than pixels, so rotation and viewport changes re-resolve them with no resize listener involved. `--bs-panel-max-height` is inert once snap points are set — the tallest snap is the cap.

The settle onto a snap runs on a spring rather than a timing function — see [Spring Settling](#spring-settling).

## Spring Settling

Settling onto a snap point runs on a damped spring, seeded with the velocity your finger actually had at the moment of release. A timing function cannot do that: a curve has no idea how hard the sheet was thrown, so a flick and a slow drag would arrive identically. This is on by default and needs no attribute.

It applies **only** to a settle onto a snap. Opening, closing, drag dismissal, and every sheet without `snap-points` stay on plain CSS transitions.

```html
<!-- default tuning -->
<bottom-sheet snap-points="40,70,90"></bottom-sheet>

<!-- attraction, friction -->
<bottom-sheet snap-points="40,70,90" spring="0.08,0.32"></bottom-sheet>

<!-- opt out, settle on --bs-snap-duration and --bs-snap-timing instead -->
<bottom-sheet snap-points="40,70,90" spring="none"></bottom-sheet>
```

| Value | Default | Effect |
| --- | --- | --- |
| Attraction | `0.065` | Pull toward the snap. Governs arrival time and overshoot, trading almost linearly between them: `0.053` reaches the snap in about 383ms and drifts 0.7% past it, the default in about 267ms and 2.4%, `0.08` in about 200ms and 5% |
| Friction | `0.3` | Bleeds off the speed attraction builds. Governs how quickly the bounce decays |

Both must be greater than 0 and less than 1. Anything else falls back to its default independently, so `spring="0.08"` retunes attraction and leaves friction alone. The two are not separable in practice — friction is applied every frame and dominates, so raising both together damps *harder*, not less.

Overshoot is a share of the distance travelled, so a longer settle drifts further past the snap. Check that your tallest snap still clears the viewport before reaching for a higher attraction.

Turning the spring off does not flatten the arrival. `--bs-snap-timing` defaults to a curve that overshoots by roughly what the spring produces at its default tuning, so `spring="none"` changes which clock runs the settle more than it changes how the settle reads.

The engine is constructed on the first settle, so a sheet that never snaps never builds one, whatever the attribute says. It ships inside the bundle — there is nothing extra to install.

## Inset

`inset` detaches the sheet from the screen edges: all four corners take `--bs-panel-border-radius`, and a gap opens on three sides. It is pure CSS — no script reads the attribute.

```html
<bottom-sheet inset>
	<!-- header, content, footer -->
</bottom-sheet>
```

The off-screen position is corrected to match. A hidden sheet translates down by `100%`, which is only the panel's own height, so without the correction a detached sheet would stop short and peek above the bottom edge by exactly the inset. The footer's safe-area padding is also dropped in this mode, because the bottom margin already clears it.

With a bottom gap, `height: 70dvh` puts the top edge at `100 − 70 − inset` from the bottom of the screen, so a detached sheet at a given snap sits slightly higher than an edge-anchored one. The snap describes the sheet, not the gap beneath it.

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
| `--bs-panel-max-height` | `85vh` | Maximum sheet height. Inert when `snap-points` is set |
| `--bs-panel-border-radius` | `25px` | Top corner radius, or all four with `inset` |
| `--bs-panel-bleed` | `60px` | Off-screen fill of panel colour below an edge-anchored sheet, so an upward rubber-band drag never reveals the page beneath. Not applied with `inset` |
| `--bs-panel-hidden-offset` | `20px` | Extra travel past the bottom edge when hidden. `100%` alone stops the sheet the instant its top edge clears the fold, which reads as the motion being cut short. Applied to the hidden, showing and hiding transforms alike, so opening and closing stay symmetrical |
| `--bs-panel-inset-x` | `12px` | Left and right gap. `inset` only |
| `--bs-panel-inset-bottom` | `12px` | Gap below the sheet, added on top of the safe area. `inset` only |
| `--bs-panel-box-shadow` | layered shadow | Sheet elevation |
| `--bs-handle-color` | `#bbb` | Drag-handle color |
| `--bs-handle-width` | `50px` | Drag-handle width |
| `--bs-handle-height` | `5px` | Drag-handle height |
| `--bs-content-padding` | `20px` | Horizontal header/content inset |
| `--bs-content-padding-block` | `0` | Top and bottom inset on the scrollable content |
| `--bs-footer-padding` | `--bs-content-padding` | Footer inset (safe-area padding is added below) |
| `--bs-footer-background` | `transparent` | Footer background |
| `--bs-transition-duration` | `400ms` | Open, close, and backdrop-fade duration |
| `--bs-snap-duration` | `400ms` | Settle onto a snap point. Matches the open and close duration, but stays separate from it so the settle can be retuned on its own and carry its own curve — what distinguishes the settle is the arrival, not the length |
| `--bs-snap-timing` | `cubic-bezier(0.2, 1.25, 0.3, 1)` | Timing function for the snap settle, and the only curve here that does not decelerate to a dead stop: it reaches the snap at 38% of the duration, drifts about 2% of the travelled distance past it, then eases back — roughly what the spring produces at its default tuning, so turning `spring` off changes the timing source without changing the character of the arrival. Only reaches the sheet with `spring="none"`. Any `cubic-bezier` whose second control point exceeds `1` overshoots — `cubic-bezier(0.25, 1.4, 0.45, 1)` lands about 5% past. Overshoot is a share of the travelled distance, so check your tallest snap still clears the viewport |
| `--bs-transition-timing` | `cubic-bezier(0.32, 0.72, 0, 1)` | Transition timing function. Decelerate-only by default: every transition follows a release or a deliberate trigger, so it starts at speed and settles rather than easing in from rest |
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
| `snapTo(value)` | Animate to a declared snap. Undeclared values are ignored rather than clamped. |

### Properties

| Property | Description |
| --- | --- |
| `maxDisplayWidth` | Numeric responsive limit or `Infinity` |
| `snapPoints` | Parsed snaps, ascending. Returns a copy. Assign an array or string; empty restores two-state mode |
| `snap` | Current resting snap, falling back to the shortest. `null` when no snap points are declared |
| `panel` | Parent `<dialog-panel>` |
| `dialog` | Parent `<dialog>` |
| `header` | Descendant `<bottom-sheet-header>` |
| `content` | Descendant `<bottom-sheet-content>` |
| `footer` | Descendant `<bottom-sheet-footer>`, when present |
| `backdrop` | Generated `<dialog-backdrop>`, when available. Tap handling belongs to `dialog-panel`; it is not a drag surface |

## Events

The lifecycle events come from the parent `<dialog-panel>`, bubble, and are composed.

| Event | Cancelable | When it fires |
| --- | --- | --- |
| `beforeShow` | Yes | Before opening begins |
| `shown` | No | After opening completes |
| `beforeHide` | Yes | Before closing begins |
| `hidden` | No | After closing completes |
| `snapChange` | No | When the sheet settles on a different snap |

Each lifecycle event includes the panel detail object, with `detail.state`, `detail.triggerElement`, and `detail.result`.

`snapChange` is dispatched by the `<bottom-sheet>` itself and carries `{ from, to }` in dvh percent. It fires on commit only — never mid-drag, and never when the sheet settles back where it started.

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
