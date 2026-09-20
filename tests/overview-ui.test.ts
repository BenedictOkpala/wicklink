import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildOverviewViewModel } from '../lib/overview/view-model.ts';
import { normalizeTicker } from '../lib/bitget/normalize.ts';
import type { MarketAsset } from '../lib/bitget/types.ts';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? path.resolve(specifier.slice(2)) : fileURLToPath(new URL(specifier, context.parentURL));
      for (const suffix of ['', '.ts', '.tsx']) if (fs.existsSync(base + suffix) && fs.statSync(base + suffix).isFile()) return next(pathToFileURL(base + suffix).href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.module.css')) return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, {get: (_, key) => key});' };
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule('import React from "react";'+fs.readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext } }).outputText };
    return next(url, context);
  },
});
const { default: Overview } = await import('../components/OverviewView.tsx');
const now = Date.parse('2026-09-18T15:00:00Z');
function asset(symbol: string, percent: number): MarketAsset {
  const instrument = { symbol: `R${symbol}USDT`, baseCoin: `R${symbol}`, quoteCoin: 'USDT', isReality: 'yes', status: 'online' };
  return { ...normalizeTicker({symbol, displayName: `${symbol} Company`, instrument}, {symbol: instrument.symbol,lastPrice:'101',ts:String(now)},now,60000), marketSession:'REGULAR', referencePrice:100, referenceTimestamp:new Date(now).toISOString(), referenceAgeMs:0, referenceStatus:'LIVE', referenceSource:'Alpaca IEX', referenceType:'TRADE', referenceCurrency:'USD', comparisonStatus:'AVAILABLE', rawDislocationPercent:percent, dislocationDirection:percent<0?'discount':'premium' };
}
const source = ['AAPL','NVDA','TSLA','MSFT','AMZN','META','AMD'].map((s,i)=>asset(s,i+1));
const regular = buildOverviewViewModel({assets:source,marketSession:'REGULAR',surveillance:{connection:'CONNECTED',snapshotAgeMs:1000}});
const render = (model = regular) => renderToStaticMarkup(React.createElement(Overview,{viewModel:model,onInvestigate(){},onViewAllMarkets(){}}));
type Tree = {type?: unknown; props?: { children?: unknown; onClick?: () => void; disabled?: boolean; [key:string]: unknown }};
function nodes(node: unknown): Tree[] { if(Array.isArray(node)) return node.flatMap(nodes); if(!node || typeof node!=='object') return []; const el=node as Tree; return [el,...nodes(el.props?.children)]; }

test('Overview renders exactly the ordered model shortlist, capped at five',()=>{
 const html=render(); const symbols=[...html.matchAll(/data-overview-symbol="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(symbols,regular.displayedAssets.map(a=>a.symbol)); assert.equal(symbols.length,5); assert.ok(!symbols.includes('AAPL'));
});
test('Overview uses supplied shortlist without independently reranking',()=>{
 const model={...regular,displayedAssets:[...regular.displayedAssets].reverse()};
 assert.deepEqual([...render(model).matchAll(/data-overview-symbol="([^"]+)"/g)].map(m=>m[1]),model.displayedAssets.map(a=>a.symbol));
});
test('REGULAR presentation uses Worth Watching and premium/discount labels',()=>{
 const html=render(buildOverviewViewModel({assets:[asset('AAPL',1),asset('NVDA',-2)],marketSession:'REGULAR'}));
 assert.ok(html.includes('Worth Watching')); assert.ok(html.includes('Premium')); assert.ok(html.includes('Discount')); assert.ok(!html.includes('Indicative gap'));
});
test('off-hours states retain exact context and label indicative gaps honestly',()=>{
 for(const session of ['CLOSED','PRE_MARKET','AFTER_HOURS','OVERNIGHT'] as const){
 const a={...source[0],marketSession:session,comparisonStatus:'STALE' as const,dataStatus:'DELAYED' as const,referenceStatus:'DELAYED' as const,rawDislocationPercent:null,dislocationDirection:null,indicativeGapPercent:1,indicativeGapDirection:'premium' as const,isIndicativeOnly:true};
 const model=buildOverviewViewModel({assets:[a],marketSession:session}); const html=render(model);
 assert.ok(html.includes('Overnight Watch')); assert.ok(html.includes('Indicative gap'));assert.ok(html.includes('Not live dislocations'));assert.ok(html.includes(model.context));
 }
});
test('UNKNOWN is neither CLOSED nor an Overnight Watch',()=>{
 const html=render(buildOverviewViewModel({assets:source,marketSession:'UNKNOWN'}));assert.ok(html.includes('Session context unavailable'));assert.ok(html.includes('Market Watch'));assert.ok(!html.includes('Overnight Watch'));assert.ok(!html.includes('data-overview-symbol='));
});
test('empty/unavailable/error states never manufacture candidate rows',()=>{
 for(const connection of ['CONNECTED','ERROR'] as const){const html=render(buildOverviewViewModel({assets:[],marketSession:'REGULAR',surveillance:{connection}})); assert.ok(html.includes('No comparisons to surface')); assert.ok(!html.includes('data-overview-symbol='));}
});
test('Overview Investigate buttons forward each exact symbol to the existing callback',()=>{
 const calls:string[]=[]; const tree=Overview({viewModel:regular,onInvestigate:s=>calls.push(s),onViewAllMarkets(){}});
 nodes(tree).filter(n=>n.type==='button' && String(n.props?.['aria-label']).startsWith('Investigate ')).forEach(n=>n.props?.onClick?.());
 assert.deepEqual(calls,regular.displayedAssets.map(a=>a.symbol));
});
test('View all action forwards navigation and shows the entire universe count',()=>{
 let calls=0;const tree=Overview({viewModel:regular,onInvestigate(){},onViewAllMarkets(){calls++;}});
 const button=nodes(tree).find(n=>String(n.props?.['aria-label']).startsWith('View all '));assert.equal(button?.props?.['aria-label'],'View all 7 assets in Markets');button?.props?.onClick?.();assert.equal(calls,1);
});
test('ranked items and actions are semantic, named and disable investigation while busy',()=>{
 const tree=Overview({viewModel:regular,onInvestigate(){},onViewAllMarkets(){},investigating:true});
 const items=nodes(tree);assert.equal(items.filter(n=>n.type==='li').length,5);assert.ok(items.some(n=>n.type==='ol'));
 for(const n of items.filter(n=>n.type==='button' && String(n.props?.['aria-label']).startsWith('Investigate ')))assert.equal(n.props?.disabled,true);
});
test('new Overview contains none of the old dashboard modules',()=>{
 const html=render();for(const removed of ['market-table','sparkline','overview-asset-detail','Why dislocations happen','Recent Dislocations','overview-kpi-strip'])assert.ok(!html.includes(removed),removed);
});
test('withheld display and provenance remain honest even when explicitly supplied for rendering',()=>{
 const a={...regular.displayedAssets[0],comparison:{kind:'WITHHELD' as const,percent:null,direction:null},context:'Comparison withheld'};
 const html=render({...regular,displayedAssets:[a]});assert.ok(html.includes('Withheld'));assert.ok(html.includes('Comparison withheld'));assert.ok(html.includes('single-exchange reference'));
});
