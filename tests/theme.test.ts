import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, toggleTheme } from '../components/theme.ts';

function initialize(saved: string | null, light: boolean, blocked = false) {
  let value: string | null = null;
  vm.runInNewContext(THEME_INIT_SCRIPT, {
    window: { matchMedia: () => ({ matches: light }), localStorage: { getItem(key: string) { assert.equal(key, THEME_STORAGE_KEY); if (blocked) throw new Error('Blocked'); return saved; } } },
    document: { documentElement: { setAttribute(key: string, theme: string) { assert.equal(key, 'data-theme'); value = theme; } } },
  });
  return value;
}
test('saved dark and light override system preference before paint', () => {
  assert.equal(initialize('dark', true), 'dark');
  assert.equal(initialize('light', false), 'light');
});
test('first visit and invalid storage follow system preference', () => {
  assert.equal(initialize(null, true), 'light');
  assert.equal(initialize(null, false), 'dark');
  assert.equal(initialize('invalid', true), 'light');
});
test('blocked storage still allows system preference initialization', () => {
  assert.equal(initialize(null, true, true), 'light');
});
test('switching persists both themes and survives reload without touching application state', () => {
  const state = { selectedSymbol: 'NVDA', view: 'markets', market: { tokenizedPrice: 219.53, comparisonStatus: 'AVAILABLE' } };
  const snapshot = structuredClone(state);
  const attributes = new Map([['data-theme', 'dark'], ['data-market-state', JSON.stringify(state)]]);
  let saved: string | null = null;
  const root = { getAttribute: (key: string) => attributes.get(key) ?? null, setAttribute: (key: string, value: string) => { assert.equal(key, 'data-theme'); attributes.set(key, value); } };
  for (const expected of ['light', 'dark'] as const) {
    assert.equal(toggleTheme(root, theme => { saved = theme; }), expected);
    assert.equal(initialize(saved, expected === 'dark'), expected);
    assert.deepEqual(state, snapshot);
    assert.equal(attributes.get('data-market-state'), JSON.stringify(snapshot));
  }
});
test('storage write failure does not prevent the current theme from changing', () => {
  let theme: string | null = 'dark';
  const root = { getAttribute: () => theme, setAttribute: (_key: string, value: string) => { theme = value; } };
  assert.equal(toggleTheme(root, () => { throw new Error('Blocked'); }), 'light');
  assert.equal(theme, 'light');
});
