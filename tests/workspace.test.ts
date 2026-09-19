import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceReducer, type WorkspaceState } from '../components/workspace-state.ts';
import { aggregateStatus, displayPercent } from '../components/ui-format.ts';

const initial: WorkspaceState = { view: 'markets', selectedSymbol: 'AAPL', investigationSymbol: null };
test('row selection changes research context without leaving markets', () => {
  assert.deepEqual(workspaceReducer(initial, { type: 'select', symbol: 'NVDA' }), { ...initial, selectedSymbol: 'NVDA' });
});
test('all navigation destinations retain selected asset', () => {
  for (const view of ['overview', 'markets', 'investigations', 'sources', 'system'] as const) {
    assert.deepEqual(workspaceReducer(initial, { type: 'navigate', view }), { ...initial, view });
  }
});
test('investigation shell retains context and returns to market without findings', () => {
  const selected = workspaceReducer(initial, { type: 'select', symbol: 'TSLA' });
  const shell = workspaceReducer(selected, { type: 'investigate', symbol: 'TSLA' });
  assert.deepEqual(shell, { view: 'investigations', selectedSymbol: 'TSLA', investigationSymbol: 'TSLA' });
  assert.equal(workspaceReducer(shell, { type: 'return-to-market' }).selectedSymbol, 'TSLA');
  assert.equal(workspaceReducer(shell, { type: 'return-to-market' }).view, 'markets');
});
test('navigation view switching preserves investigation target and selection state', () => {
  const investigated = workspaceReducer(initial, { type: 'investigate', symbol: 'NVDA' });
  assert.equal(investigated.investigationSymbol, 'NVDA');
  assert.equal(investigated.view, 'investigations');

  const toMarkets = workspaceReducer(investigated, { type: 'navigate', view: 'markets' });
  assert.equal(toMarkets.view, 'markets');
  assert.equal(toMarkets.investigationSymbol, 'NVDA');

  const toSources = workspaceReducer(toMarkets, { type: 'navigate', view: 'sources' });
  assert.equal(toSources.view, 'sources');
  assert.equal(toSources.investigationSymbol, 'NVDA');

  const toSystem = workspaceReducer(toSources, { type: 'navigate', view: 'system' });
  assert.equal(toSystem.view, 'system');
  assert.equal(toSystem.investigationSymbol, 'NVDA');

  const backToInvestigations = workspaceReducer(toSystem, { type: 'navigate', view: 'investigations' });
  assert.equal(backToInvestigations.view, 'investigations');
  assert.equal(backToInvestigations.investigationSymbol, 'NVDA');
});
test('selecting different market asset retains current investigation target until explicitly investigated', () => {
  const state = workspaceReducer(initial, { type: 'investigate', symbol: 'NVDA' });
  const selectedOther = workspaceReducer(state, { type: 'select', symbol: 'TSLA' });
  assert.equal(selectedOther.selectedSymbol, 'TSLA');
  assert.equal(selectedOther.investigationSymbol, 'NVDA');
  assert.equal(selectedOther.view, 'markets');

  const newInvestigation = workspaceReducer(selectedOther, { type: 'investigate', symbol: 'TSLA' });
  assert.equal(newInvestigation.selectedSymbol, 'TSLA');
  assert.equal(newInvestigation.investigationSymbol, 'TSLA');
  assert.equal(newInvestigation.view, 'investigations');
});
test('small dislocations remain distinguishable from zero and unavailable', () => {
  assert.equal(displayPercent(null), '—');
  assert.equal(displayPercent(0), '0.00%');
  assert.equal(displayPercent(0.008), '+0.0080%');
  assert.equal(displayPercent(-0.008), '−0.0080%');
  assert.equal(displayPercent(0.000001), '+<0.0001%');
});
test('aggregate status does not hide failed or stale providers', () => {
  assert.equal(aggregateStatus([]), 'UNAVAILABLE');
  assert.equal(aggregateStatus(['LIVE', 'ERROR']), 'ERROR');
  assert.equal(aggregateStatus(['LIVE', 'DELAYED']), 'DELAYED');
  assert.equal(aggregateStatus(['LIVE', 'UNAVAILABLE']), 'UNAVAILABLE');
  assert.equal(aggregateStatus(['LIVE', 'LIVE']), 'LIVE');
});
