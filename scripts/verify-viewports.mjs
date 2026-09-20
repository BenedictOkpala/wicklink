import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VIEWPORTS = [
  { name: 'Mobile 375px (iPhone SE)', width: 375, height: 667, mobile: true },
  { name: 'Mobile 390px (iPhone 14/15)', width: 390, height: 844, mobile: true },
  { name: 'Mobile 430px (iPhone 15 Pro Max)', width: 430, height: 932, mobile: true },
  { name: 'Tablet 768px (iPad Portrait)', width: 768, height: 1024, mobile: false },
  { name: 'Tablet / Small Desktop 1024px (iPad Landscape)', width: 1024, height: 768, mobile: false },
  { name: 'Desktop 1440px', width: 1440, height: 900, mobile: false },
];

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_PROFILE = path.join(os.tmpdir(), `edge-viewport-test-${Date.now()}`);

async function runViewportAudits() {
  console.log('--- STARTING WICKLINK RESPONSIVE VIEWPORT AUDIT ---');

  const edge = spawn(EDGE_PATH, [
    '--headless',
    '--remote-debugging-port=9226',
    `--user-data-dir=${TEMP_PROFILE}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000',
  ]);

  // Wait for Edge CDP to respond
  let targets = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9226/json');
      targets = await res.json();
      if (targets && targets.some(t => t.type === 'page')) break;
    } catch {}
  }

  assert.ok(targets, 'Edge headless CDP must respond');
  const pageTarget = targets.find(t => t.type === 'page');
  assert.ok(pageTarget, 'Must find page target');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });

  let msgId = 1;
  function sendCommand(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      const onMsg = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          ws.removeEventListener('message', onMsg);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Enable Page and navigate explicitly to http://localhost:3000
  await sendCommand('Page.enable');
  await sendCommand('Page.navigate', { url: 'http://localhost:3000' });

  // Poll until page has rendered the market rows
  let loaded = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    const check = await sendCommand('Runtime.evaluate', {
      expression: 'document.querySelectorAll(".market-row").length',
      returnByValue: true,
    });
    if (check?.result?.value > 0) {
      console.log(`[INIT] Market rows rendered after ${(attempt + 1) * 0.5}s: ${check.result.value} rows found.`);
      loaded = true;
      break;
    }
  }
  assert.ok(loaded, 'Page must load and render .market-row elements within timeout');

  fs.mkdirSync('docs/overview-viewport-qa', { recursive: true });
  for (const vp of VIEWPORTS) {
    // 1. Emulate viewport
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: vp.mobile,
    });

    // Give DOM time to adjust layout
    await new Promise(r => setTimeout(r, 500));

    await sendCommand('Runtime.evaluate', { expression: 'window.scrollTo(0,0);' });
    await new Promise(r => setTimeout(r, 300));
    const shot = await sendCommand('Page.captureScreenshot', {format: 'png'});
    fs.writeFileSync('docs/overview-viewport-qa/'+vp.width+'.png', Buffer.from(shot.data,'base64'));
    const overview = await sendCommand('Runtime.evaluate', { expression: '({count:document.querySelectorAll("[data-overview-symbol]").length,firstTop:document.querySelector("[data-overview-symbol]")?.getBoundingClientRect().top,buttons:[...document.querySelectorAll("#section-overview button")].map(b=>b.getBoundingClientRect().height),old:!!document.querySelector("#section-overview .market-table")})', returnByValue:true });
    assert.ok(overview.result.value.count>0 && overview.result.value.count<=5, 'Overview must render a real bounded shortlist');
    assert.equal(overview.result.value.old,false,'Overview must not contain Markets table');
    assert.ok(overview.result.value.buttons.every(height=>height>=44),'Overview actions must have 44px touch targets');
    if (vp.mobile) assert.ok(overview.result.value.firstTop < 420,'First ranked asset should be reached quickly');
    // 2. Evaluate layout properties
    const res = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const docEl = document.documentElement;
        const innerWidth = window.innerWidth;
        const scrollWidth = docEl.scrollWidth;
        const hasPageOverflow = scrollWidth > innerWidth;

        // Check cards / panels
        const marketRows = Array.from(document.querySelectorAll('.market-row'));
        const firstRow = marketRows[0];
        const rowStyle = firstRow ? window.getComputedStyle(firstRow) : null;
        const rowDisplay = rowStyle ? rowStyle.display : null;
        const rowWidth = firstRow ? firstRow.getBoundingClientRect().width : 0;

        // Check if investigate buttons exist and have touch target height
        const investigateButtons = Array.from(document.querySelectorAll('.row-investigate-btn'));
        const btnHeights = investigateButtons.map(b => b.getBoundingClientRect().height);
        const minBtnHeight = btnHeights.length ? Math.min(...btnHeights) : 0;

        // Check panels
        const panels = Array.from(document.querySelectorAll('.panel'));
        const overflowingPanels = panels.filter(p => {
          const rect = p.getBoundingClientRect();
          return rect.right > innerWidth + 2;
        }).map(p => p.className);

        // Navigation elements
        const navItems = Array.from(document.querySelectorAll('.nav-item'));

        return {
          innerWidth,
          scrollWidth,
          hasPageOverflow,
          overflowDelta: scrollWidth - innerWidth,
          rowCount: marketRows.length,
          rowDisplay,
          rowWidth,
          minBtnHeight,
          overflowingPanels,
          navItemCount: navItems.length,
        };
      })()`,
      returnByValue: true,
    });

    const val = res.result.value;
    console.log(`[AUDIT] ${vp.name}: innerWidth=${val.innerWidth}px, scrollWidth=${val.scrollWidth}px, overflow=${val.hasPageOverflow ? `FAIL (+${val.overflowDelta}px)` : 'NONE'}, rowDisplay=${val.rowDisplay}, rowWidth=${val.rowWidth.toFixed(1)}px, touchTarget=${val.minBtnHeight}px, overflowingPanels=${val.overflowingPanels.length}`);

    assert.equal(
      val.hasPageOverflow,
      false,
      `${vp.name} must have NO horizontal scroll (scrollWidth: ${val.scrollWidth}px vs innerWidth: ${val.innerWidth}px)`
    );

    assert.equal(
      val.overflowingPanels.length,
      0,
      `${vp.name} panels must not overflow: ${val.overflowingPanels.join(', ')}`
    );

    assert.ok(val.rowCount >= 14, `${vp.name} must render market rows`);
    assert.ok(val.navItemCount >= 4, `${vp.name} must have navigation items`);

    if (vp.width <= 768) {
      assert.equal(val.rowDisplay, 'grid', `${vp.name} market rows must display as grid cards`);
      assert.ok(val.minBtnHeight >= 36, `${vp.name} buttons must have accessible touch target`);
    }
  }

  // 3. Specifically test Investigation interactive view on 375px mobile
  console.log('[AUDIT] Testing Investigation view interaction on 375px mobile...');
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await new Promise(r => setTimeout(r, 400));

  // Click the first row-investigate-btn
  const clickRes = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('.row-investigate-btn');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
  });
  assert.equal(clickRes.result.value, true, 'First investigate button must be clicked');

  // Wait for investigation section / content to appear
  await new Promise(r => setTimeout(r, 2000));

  const invAudit = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const docEl = document.documentElement;
      const innerWidth = window.innerWidth;
      const scrollWidth = docEl.scrollWidth;
      const hasPageOverflow = scrollWidth > innerWidth;

      // Check all visible panels and elements
      const elements = Array.from(document.querySelectorAll('*'));
      const overflowing = elements.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.right > innerWidth + 2 && rect.width > 0 && rect.height > 0;
      }).map(el => (el.className || el.tagName).toString().slice(0, 40));

      return {
        innerWidth,
        scrollWidth,
        hasPageOverflow,
        overflowDelta: scrollWidth - innerWidth,
        overflowingElements: [...new Set(overflowing)],
      };
    })()`,
    returnByValue: true,
  });

  console.log(`[AUDIT] Investigation on 375px: innerWidth=${invAudit.result.value.innerWidth}px, scrollWidth=${invAudit.result.value.scrollWidth}px, overflow=${invAudit.result.value.hasPageOverflow ? `FAIL (+${invAudit.result.value.overflowDelta}px)` : 'NONE'}, overflowingElements=${invAudit.result.value.overflowingElements.length}`);
  if (invAudit.result.value.overflowingElements.length > 0) {
    console.log('[AUDIT] Overflowing elements:', invAudit.result.value.overflowingElements);
  }

  assert.equal(
    invAudit.result.value.hasPageOverflow,
    false,
    `Mobile 375px Investigation must have NO horizontal scroll (scrollWidth: ${invAudit.result.value.scrollWidth}px vs innerWidth: ${invAudit.result.value.innerWidth}px)`
  );

  ws.close();
  edge.kill();

  try {
    if (path.dirname(path.resolve(TEMP_PROFILE)) === path.resolve(os.tmpdir()) && path.basename(TEMP_PROFILE).startsWith('edge-viewport-test-')) fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
  } catch {}

  console.log('--- ALL 6 VIEWPORTS & INVESTIGATION INTERACTION PASSED VERIFICATION WITH ZERO OVERFLOW! ---');
}

runViewportAudits().catch(err => {
  console.error('VIEWPORT AUDIT FAILED:', err);
  process.exit(1);
});

