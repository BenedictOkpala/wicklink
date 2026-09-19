import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Component contract/SSR checks, not a substitute for browser visual QA.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? path.resolve(specifier.slice(2)) : fileURLToPath(new URL(specifier, context.parentURL));
      for (const suffix of ['', '.ts', '.tsx']) {
        if (fs.existsSync(base + suffix) && fs.statSync(base + suffix).isFile()) return next(pathToFileURL(base + suffix).href, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (/\.tsx?$/.test(url) && !url.includes('node_modules')) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule('import React from '+JSON.stringify('react')+';'+fs.readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    }
    return next(url, context);
  },
});
const { default: Row } = await import('../components/AssetRow.tsx');
const { default: Detail } = await import('../components/AssetDetail.tsx');
const { default: Navigation } = await import('../components/Navigation.tsx');
const { default: Monitor } = await import('../components/MarketMonitor.tsx');
const { formatPrice } = await import('../lib/market/presentation.ts');
const { displayPercent } = await import('../components/ui-format.ts');
const { InvestigationsView, DataSourcesView, SystemStatusView } = await import('../components/ResearchViews.tsx');
const data = JSON.parse(fs.readFileSync('docs/ui-market-response.json', 'utf8'));
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
const dummyDispatcher = {
  useRef: (init) => ({ current: init }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useMemo: (fn) => (typeof fn === 'function' ? fn() : fn),
  useReducer: (r, init) => [init, () => {}],
};
const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE || React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
if (internals) {
  internals.ReactCurrentDispatcher = internals.ReactCurrentDispatcher || {};
  internals.ReactCurrentDispatcher.current = dummyDispatcher;
  internals.H = dummyDispatcher;
}

let selected = 0;
const row = Row({ asset: data.assets[1], selected: true, onSelect: () => selected++ });
row.props.onClick();
const button = elements(row).find(node => node.type === 'button');
let stopped = false;
button.props.onClick({ stopPropagation: () => { stopped = true; } });
assert.equal(selected, 2);
assert.ok(stopped);
assert.equal(button.props['aria-pressed'], true);
const navigated = [];
const nav = Navigation({ view: 'markets', onNavigate: view => navigated.push(view) });
const navButtons = elements(nav).filter(node => node.type === 'button' && node.props.className?.includes('nav-item'));
navButtons.forEach(node => node.props.onClick());
assert.deepEqual(navigated, ['overview', 'markets', 'investigations', 'sources', 'system']);

// Verify tooltips, accessible names, and removed SOON label
assert.deepEqual(navButtons.map(b => b.props['aria-label']), ['Overview', 'Markets', 'Investigations', 'Data Sources', 'System Status']);
assert.deepEqual(navButtons.map(b => b.props['data-tooltip']), ['Overview', 'Markets', 'Investigations', 'Data Sources', 'System Status']);
const navHtml = render(Navigation, { view: 'investigations', onNavigate() {} });
assert.ok(!navHtml.includes('SOON'), 'Investigations must not display SOON indicator');
assert.ok(navHtml.includes('active'), 'Active destination must have active class');
assert.ok(navHtml.includes('aria-current="page"'), 'Active destination must set aria-current="page"');

let investigated;
const detail = Detail({ asset: data.assets[1], diagnostics: data.sessionDiagnostics, onInvestigate: symbol => { investigated = symbol; } });
elements(detail).find(node => node.type === 'button').props.onClick();
assert.equal(investigated, data.assets[1].symbol);

// Verify duplicate click prevention in Detail
const detailLoading = Detail({ asset: data.assets[1], diagnostics: data.sessionDiagnostics, onInvestigate: () => {}, investigating: true });
const investigateBtn = elements(detailLoading).find(node => node.type === 'button');
assert.equal(investigateBtn.props.disabled, true);
assert.equal(investigateBtn.props['aria-busy'], true);
const detailLoadingHtml = render(Detail, { asset: data.assets[1], diagnostics: data.sessionDiagnostics, onInvestigate() {}, investigating: true });
assert.ok(detailLoadingHtml.includes('Investigating…'));

for (const asset of data.assets) {
  const html = render(Detail, { asset, diagnostics: data.sessionDiagnostics, onInvestigate() {} });
  assert.ok(html.includes(asset.symbol));
  assert.ok(html.includes(asset.tokenizedTimestamp));
  assert.ok(html.includes(formatPrice(asset.tokenizedPrice)));
  assert.ok(html.includes(formatPrice(asset.referencePrice)));
  assert.ok(html.includes(displayPercent(asset.rawDislocationPercent)));
  assert.ok(html.includes('MARKET EVIDENCE'));
}
for (const status of ['LIVE', 'DELAYED', 'UNAVAILABLE', 'ERROR']) {
  const asset = { ...data.assets[0], dataStatus: status, comparisonStatus: status === 'LIVE' ? 'AVAILABLE' : 'UNAVAILABLE', referencePrice: null, rawDislocationPercent: null, dislocationDirection: null, issue: `${status} verification state` };
  const html = render(Detail, { asset, diagnostics: data.sessionDiagnostics, onInvestigate() {} });
  assert.ok(html.includes(status));
  assert.ok(html.includes('WITHHELD'));
  assert.ok(html.includes(asset.issue));
}
assert.ok(render(Monitor, { initialData: data }).includes('Overview'));
assert.ok(render(Monitor, { initialData: { ...data, assets: [], dataStatus: 'UNAVAILABLE' } }).includes('Waiting for verified market data'));
assert.ok(render(InvestigationsView, { symbol: null, assets: data.assets, onMarkets() {} }).includes('No investigations yet'));
assert.ok(render(InvestigationsView, { symbol: 'AAPL', assets: data.assets, onMarkets() {} }).includes('No investigation has started'));
const stagesHtml = render(InvestigationsView, { symbol: 'NVDA', assets: data.assets, onMarkets() {}, loading: true, stageIndex: 1 });
assert.ok(stagesHtml.includes('INVESTIGATION IN PROGRESS'));
assert.ok(stagesHtml.includes('Analyzing NVDA Dislocation'));
assert.ok(stagesHtml.includes('Checking timestamp alignment'));

const sourcesHtml = render(DataSourcesView, { assets: data.assets, data, error: null });
assert.ok(sourcesHtml.includes('consolidated SIP'));
assert.ok(sourcesHtml.includes('Bitget Reality'));
assert.ok(sourcesHtml.includes('Alpaca'));
assert.ok(sourcesHtml.includes('AI Research Engine'));
assert.ok(sourcesHtml.includes('data-tooltip="Bitget Reality"'));
assert.ok(sourcesHtml.includes('data-tooltip="Alpaca Market Data"'));
assert.ok(sourcesHtml.includes('data-tooltip="AI Research Engine"'));

const systemHtml = render(SystemStatusView, { assets: data.assets, data, error: null });
assert.ok(systemHtml.includes('AI engine'));
assert.ok(render(SystemStatusView, { assets: [], data, error: 'Connection failed' }).includes('Current session not verified'));
const baseline = JSON.parse(fs.readFileSync('docs/ui-data-baseline.json', 'utf8'));
for (const [filename, hash] of Object.entries(baseline)) assert.equal(createHash('sha256').update(fs.readFileSync(filename)).digest('hex'), hash, `${filename} must remain unchanged`);
console.log('PASS: navigation callbacks, tooltips, active state, duplicate prevention, investigation stages, 3 data sources, and frozen hashes.');
