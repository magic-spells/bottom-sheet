import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSnapPoints, resolveSnapTarget, dismissProgress } from '../src/snap-points.js';

const FLICK = 0.5;

// 40 / 70 / 90 dvh against a 1000px viewport
const SNAPS = [400, 700, 900];

const resolve = (currentPx, velocityY, snapsPx = SNAPS) =>
	resolveSnapTarget({ currentPx, velocityY, snapsPx, flickVelocity: FLICK });

test('parseSnapPoints reads a comma separated list', () => {
	assert.deepEqual(parseSnapPoints('40,70,90'), [40, 70, 90]);
});

test('parseSnapPoints accepts whitespace and mixed separators', () => {
	assert.deepEqual(parseSnapPoints('40 70,  90'), [40, 70, 90]);
	assert.deepEqual(parseSnapPoints('  25.5 , 60 '), [25.5, 60]);
});

test('parseSnapPoints sorts and dedupes', () => {
	assert.deepEqual(parseSnapPoints('90,40,70,40'), [40, 70, 90]);
});

test('parseSnapPoints drops values outside 0-100 and anything unparseable', () => {
	assert.deepEqual(parseSnapPoints('0,40,101,-10,abc,,70'), [40, 70]);
	assert.deepEqual(parseSnapPoints('100'), [100], '100 is a legitimate full-height snap');
});

test('parseSnapPoints returns an empty list for missing or fully invalid input', () => {
	// An empty list is what keeps the sheet in its original binary mode
	assert.deepEqual(parseSnapPoints(null), []);
	assert.deepEqual(parseSnapPoints(''), []);
	assert.deepEqual(parseSnapPoints('none'), []);
	assert.deepEqual(parseSnapPoints('   '), []);
});

test('resolveSnapTarget lands on the nearest snap when released slowly', () => {
	// The midpoint between 400 and 700 is 550; sub-flick velocity never shifts it
	assert.equal(resolve(420, 0), 400);
	assert.equal(resolve(530, 0.1), 400, 'below the midpoint');
	assert.equal(resolve(580, -0.1), 700, 'above the midpoint');
	assert.equal(resolve(880, 0), 900);
});

test('resolveSnapTarget steps exactly one snap down on a downward flick', () => {
	assert.equal(resolve(900, 1.2), 700, 'a hard flick still only steps one');
	assert.equal(resolve(700, 0.8), 400);
});

test('resolveSnapTarget steps exactly one snap up on an upward flick', () => {
	assert.equal(resolve(400, -1.2), 700);
	assert.equal(resolve(700, -0.8), 900);
});

test('resolveSnapTarget steps from the current position, not the nearest snap', () => {
	// Dragged from 400 up past the tallest snap, then flicked up. Stepping from
	// the gesture's starting snap would target 700 and visibly fall backwards.
	assert.equal(resolve(950, -1), 900);
	// Dragged well past 700 and flicked down — 700 is below it, so that is the step
	assert.equal(resolve(860, 1), 700);
});

test('resolveSnapTarget dismisses when a downward flick runs out of snaps', () => {
	assert.equal(resolve(400, 1), null);
	assert.equal(resolve(395, 1), null);
});

test('resolveSnapTarget holds at the tallest snap when an upward flick runs out', () => {
	assert.equal(resolve(900, -1), 900);
	assert.equal(resolve(940, -1), 900);
});

test('resolveSnapTarget tolerates sub-pixel noise at a resting snap', () => {
	// A measured height of 700.4 must still read as "sitting at 700", or a
	// downward flick would resolve to 700 and do nothing at all
	assert.equal(resolve(700.4, 1), 400);
	assert.equal(resolve(699.6, -1), 900);
});

test('resolveSnapTarget handles a single declared snap', () => {
	assert.equal(resolve(500, 0, [500]), 500);
	assert.equal(resolve(500, -1, [500]), 500, 'nowhere to grow');
	assert.equal(resolve(500, 1, [500]), null, 'nowhere to shrink, so dismiss');
});

test('resolveSnapTarget dismisses when there are no snaps at all', () => {
	assert.equal(resolve(500, 0, []), null);
});

test('dismissProgress saturates at and above the resting extent', () => {
	// Rest is the SHORTEST snap, so every position at or above it reports fully
	// on screen. This is the whole reason snap-to-snap travel and upward
	// rubber-band overscroll leave the overlay alone without a branch.
	assert.equal(dismissProgress(400, 400), 1);
	assert.equal(dismissProgress(700, 400), 1);
	assert.equal(dismissProgress(1200, 400), 1);
});

test('dismissProgress maps the travel below rest linearly onto [1, 0]', () => {
	assert.equal(dismissProgress(300, 400), 0.75);
	assert.equal(dismissProgress(200, 400), 0.5);
	assert.equal(dismissProgress(0, 400), 0);
});

test('dismissProgress floors at zero past the bottom edge', () => {
	assert.equal(dismissProgress(-120, 400), 0);
});

test('dismissProgress reports fully on screen when the extent is unmeasurable', () => {
	// An unmeasurable sheet is one that has not laid out yet. Reporting 0 would
	// blank the scrim over a sheet that is plainly visible, so the guard leans
	// the other way.
	for (const rest of [0, -400, NaN, Infinity, undefined]) {
		assert.equal(dismissProgress(300, rest), 1, String(rest));
	}
	assert.equal(dismissProgress(NaN, 400), 1);
});
