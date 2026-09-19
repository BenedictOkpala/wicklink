import test from 'node:test';
import assert from 'node:assert/strict';
import { detectValueChangeDirection } from '../components/useValueFlash.ts';
import { formatPrice } from '../lib/market/presentation.ts';
import { displayPercent } from '../components/ui-format.ts';

test('detectValueChangeDirection: price increases returns up', () => {
  assert.equal(detectValueChangeDirection(100.00, 100.50, formatPrice), 'up');
  assert.equal(detectValueChangeDirection(335.03, 335.04, formatPrice), 'up');
});

test('detectValueChangeDirection: price decreases returns down', () => {
  assert.equal(detectValueChangeDirection(100.50, 100.00, formatPrice), 'down');
  assert.equal(detectValueChangeDirection(335.04, 335.03, formatPrice), 'down');
});

test('detectValueChangeDirection: identical prices return null', () => {
  assert.equal(detectValueChangeDirection(100.00, 100.00, formatPrice), null);
  assert.equal(detectValueChangeDirection(219.53, 219.53, formatPrice), null);
});

test('detectValueChangeDirection: sub-cent floating point difference where formatted price is identical returns null', () => {
  // If price changed by 0.0000001, formatPrice still produces '100.00'
  assert.equal(detectValueChangeDirection(100.0000001, 100.0000002, formatPrice), null);
  assert.equal(detectValueChangeDirection(0.3, 0.1 + 0.2, formatPrice), null);
});

test('detectValueChangeDirection: null values return null', () => {
  assert.equal(detectValueChangeDirection(null, 100.00, formatPrice), null);
  assert.equal(detectValueChangeDirection(100.00, null, formatPrice), null);
  assert.equal(detectValueChangeDirection(null, null, formatPrice), null);
});

test('detectValueChangeDirection: dislocation percent change returns correct direction', () => {
  assert.equal(detectValueChangeDirection(0.05, 0.12, displayPercent), 'up');
  assert.equal(detectValueChangeDirection(0.12, 0.05, displayPercent), 'down');
  assert.equal(detectValueChangeDirection(-0.15, -0.05, displayPercent), 'up');
  assert.equal(detectValueChangeDirection(-0.05, -0.15, displayPercent), 'down');
  assert.equal(detectValueChangeDirection(0.05, 0.05, displayPercent), null);
});

