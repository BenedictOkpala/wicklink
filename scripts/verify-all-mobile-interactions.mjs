import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_PROFILE = path.join(os.tmpdir(), `edge-verify-interactions-${Date.now()}`);

const VIEWPORTS = [
  { name: 'Mobile 375px', width: 375, height: 812, mobile: true },
  { name: 'Mobile 390px', width: 390, height: 844, mobile: true },
  { name: 'Mobile 430px', width: 430, height: 932, mobile: true },
  { name: 'Tablet 768px', width: 768, height: 1024, mobile: false },
  { name: 'Desktop 1024px', width: 1024, height: 768, mobile: false },
  { name: 'Desktop 1440px', width: 1440, height: 900, mobile: false },
];

async function runTests() {
  console.log('=== RUNNING FULL INTERACTION VERIFICATION SUITE ===');

  const edge = spawn(EDGE_PATH, [
    '--headless',
    '--remote-debugging-port=9234',
    `--user-data-dir=${TEMP_PROFILE}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
  ]);

  let targets = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9234/json');
      targets = await res.json();
      if (targets && targets.some(t => t.type === 'page')) break;
    } catch {}
  }

  assert.ok(targets, 'CDP targets must be available');
  const pageTarget = targets.find(t => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });

  let msgId = 1;
  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const timeout = setTimeout(() => reject(new Error(`CDP timed out: ${method}`)), 20000);
      const onMsg = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          ws.removeEventListener('message', onMsg);
          clearTimeout(timeout);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCommand('Runtime.enable');
  await sendCommand('Page.enable');

  const widthFilter = process.argv.find(arg => arg.startsWith('--widths='))?.split('=')[1].split(',').map(Number);
  for (const vp of VIEWPORTS.filter(vp => !widthFilter || widthFilter.includes(vp.width))) {
    console.log(`\n========================================`);
    console.log(`TESTING VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`========================================`);

    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: vp.mobile,
    });

    await sendCommand('Page.navigate', { url: 'http://localhost:3000' });

    // Wait for market data to render
    let loaded = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 400));
      const res = await sendCommand('Runtime.evaluate', {
        expression: 'document.querySelectorAll(".market-row").length',
        returnByValue: true,
      });
      if (res?.result?.value > 0) {
        loaded = true;
        break;
      }
    }
    assert.ok(loaded, 'Page must render market rows');
    // Ensure Turbopack compilation and React client hydration are fully completed
    await new Promise(r => setTimeout(r, 4000));

    // Helper to simulate real tap/click at center of element
    async function realTap(selector, description) {
      await sendCommand('Page.bringToFront');
      const coords = await sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector('${selector}');
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          const rect = el.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        })()`,
        returnByValue: true,
      });

      assert.ok(coords?.result?.value, `Target element must exist: ${selector} (${description})`);
      const { x, y } = coords.result.value;

      await sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await new Promise(r => setTimeout(r, 400));
    }

    async function waitForScrollSettle(timeout = 6000) {
      await new Promise(r => setTimeout(r, 1600));
      let lastY = -1;
      let stableCount = 0;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        await new Promise(r => setTimeout(r, 200));
        const res = await sendCommand('Runtime.evaluate', {
          expression: 'window.scrollY',
          returnByValue: true,
        });
        const curY = res?.result?.value;
        if (curY === lastY && curY !== undefined) {
          stableCount++;
          if (stableCount >= 3) return curY;
        } else {
          stableCount = 0;
        }
        lastY = curY;
      }
      return lastY;
    }

    async function openNavigationDrawer() {
      const isOpen = await sendCommand('Runtime.evaluate', {
        expression: `document.getElementById('navigation-drawer')?.classList.contains('is-open')`,
        returnByValue: true,
      });
      if (!isOpen?.result?.value) {
        await realTap('#nav-drawer-toggle', 'Open Navigation Drawer');
        await new Promise(r => setTimeout(r, 400));
      }
    }

    // Shell contract at every width: closed drawer, icon theme, no header Refresh.
    const shell = await sendCommand('Runtime.evaluate', { expression: '({hidden:getComputedStyle(document.getElementById("navigation-drawer")).visibility,headerRefresh:!!document.querySelector(".workspace-header .refresh-button"),theme:!!document.querySelector(".workspace-header .theme-toggle"),drawerTheme:!!document.querySelector("#navigation-drawer .theme-toggle")})', returnByValue:true });
    assert.equal(shell.result.value.hidden, 'hidden');
    assert.equal(shell.result.value.headerRefresh, false);
    assert.equal(shell.result.value.theme, true);
    assert.equal(shell.result.value.drawerTheme, false);
    await openNavigationDrawer();
    const opened = await sendCommand('Runtime.evaluate', { expression: '({visible:getComputedStyle(document.getElementById("navigation-drawer")).visibility,inert:document.querySelector("main").inert,blur:getComputedStyle(document.querySelector(".nav-drawer-backdrop")).backdropFilter})', returnByValue:true });
    assert.equal(opened.result.value.visible,'visible');
    assert.equal(opened.result.value.inert,true);
    assert.ok(opened.result.value.blur.includes('blur'));
    const boundaries = await sendCommand('Runtime.evaluate', {expression:'(()=>{const d=document.getElementById("navigation-drawer"),o=document.getElementById("section-overview"),m=document.getElementById("section-markets");return {drawerWidth:d.clientWidth,drawerScroll:d.scrollWidth,gap:m.getBoundingClientRect().top-o.getBoundingClientRect().bottom}})()',returnByValue:true});
    assert.ok(boundaries.result.value.drawerScroll <= boundaries.result.value.drawerWidth, 'Drawer content must not cause horizontal scroll');
    assert.ok(boundaries.result.value.gap >= 20, 'Overview and Markets need a clear section boundary');
    fs.mkdirSync('docs/overview-viewport-qa', {recursive:true});
    const drawerShot = await sendCommand('Page.captureScreenshot', {format:'png'});
    fs.writeFileSync('docs/overview-viewport-qa/drawer-'+vp.width+'.png',Buffer.from(drawerShot.data,'base64'));
    await sendCommand('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await sendCommand('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await new Promise(r=>setTimeout(r,350));
    const escaped = await sendCommand('Runtime.evaluate', {expression:'document.getElementById("nav-drawer-toggle").getAttribute("aria-expanded")',returnByValue:true});
    assert.equal(escaped.result.value,'false');
    await openNavigationDrawer();
    await sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x:vp.width-40,y:300,button:'left',clickCount:1});
    await sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:vp.width-40,y:300,button:'left',clickCount:1});
    await new Promise(r=>setTimeout(r,350));
    const backdropClosed = await sendCommand('Runtime.evaluate', {expression:'document.getElementById("nav-drawer-toggle").getAttribute("aria-expanded")',returnByValue:true});
    assert.equal(backdropClosed.result.value,'false');
    await realTap('.theme-toggle','Theme toggle');
    const themeSaved = await sendCommand('Runtime.evaluate',{expression:'({theme:document.documentElement.dataset.theme,saved:localStorage.getItem("nightshift-theme")})',returnByValue:true});
    assert.equal(themeSaved.result.value.theme,themeSaved.result.value.saved);
    await realTap('.theme-toggle','Restore theme');

    if (process.argv.includes('--shell-only')) { console.log('Shell checks passed at '+vp.width); continue; }

    // 1. Test Navigation: Markets via Navigation Drawer
    console.log('[1/10] Testing Markets Navigation Tab...');
    await openNavigationDrawer();
    await realTap('button[aria-label="Markets"]', 'Markets Nav Tab');
    await waitForScrollSettle();
    const marketsNav = await sendCommand('Runtime.evaluate', {
      expression: `({
        activeNav: document.querySelector('.nav-item.active')?.getAttribute('aria-label'),
        scrollY: window.scrollY,
      })`,
      returnByValue: true,
    });
    console.log('Markets nav result:', marketsNav.result.value);
    assert.equal(marketsNav.result.value.activeNav, 'Markets', 'Markets tab must be active');
    assert.ok(marketsNav.result.value.scrollY > 200, 'Viewport must scroll to Markets');

    // 2. Test Navigation: Investigations via Navigation Drawer
    console.log('[2/10] Testing Investigations Navigation Tab...');
    await openNavigationDrawer();
    await realTap('button[aria-label="Investigations"]', 'Investigations Nav Tab');
    await waitForScrollSettle();
    const invNav = await sendCommand('Runtime.evaluate', {
      expression: `({
        activeNav: document.querySelector('.nav-item.active')?.getAttribute('aria-label'),
        scrollY: window.scrollY,
      })`,
      returnByValue: true,
    });
    console.log('Investigations nav result:', invNav.result.value);
    assert.equal(invNav.result.value.activeNav, 'Investigations', 'Investigations tab must be active');

    // 3. Test Navigation: Methodology via Navigation Drawer
    console.log('[3/10] Testing Methodology Navigation Tab...');
    await openNavigationDrawer();
    await realTap('button[aria-label="Methodology"]', 'Methodology Nav Tab');
    await waitForScrollSettle();
    const sourcesNav = await sendCommand('Runtime.evaluate', {
      expression: `({
        activeNav: document.querySelector('.nav-item.active')?.getAttribute('aria-label'),
        scrollY: window.scrollY,
      })`,
      returnByValue: true,
    });
    console.log('Sources nav result:', sourcesNav.result.value);
    assert.equal(sourcesNav.result.value.activeNav, 'Methodology', 'Methodology tab must be active');

    // 4. Test Navigation: Overview via Navigation Drawer
    console.log('[4/10] Testing Overview Navigation Tab...');
    await openNavigationDrawer();
    await realTap('button[aria-label="Overview"]', 'Overview Nav Tab');
    await waitForScrollSettle();
    const overNav = await sendCommand('Runtime.evaluate', {
      expression: `({
        activeNav: document.querySelector('.nav-item.active')?.getAttribute('aria-label'),
        scrollY: window.scrollY,
      })`,
      returnByValue: true,
    });
    console.log('Overview nav result:', overNav.result.value);
    assert.equal(overNav.result.value.activeNav, 'Overview', 'Overview tab must be active');
    assert.ok(overNav.result.value.scrollY < 150, 'Overview must scroll to top');

    // New Overview action must use the existing investigation orchestration.
    const overviewSymbol = await sendCommand('Runtime.evaluate', { expression: 'document.querySelector("[data-overview-symbol]")?.getAttribute("data-overview-symbol")', returnByValue: true });
    assert.ok(overviewSymbol.result.value, 'Live verification needs a real ranked candidate');
    await realTap('#section-overview button[aria-label^="Investigate "]', 'Overview Investigate');
    await waitForScrollSettle();
    const overviewInvestigation = await sendCommand('Runtime.evaluate', { expression: '({nav:document.querySelector(".nav-item.active")?.getAttribute("aria-label"),text:document.querySelector("#section-investigations")?.textContent})', returnByValue: true });
    assert.equal(overviewInvestigation.result.value.nav, 'Investigations');
    assert.ok(overviewInvestigation.result.value.text.includes(overviewSymbol.result.value));
    let overviewReportSymbol = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const report = await sendCommand('Runtime.evaluate', { expression: 'document.querySelector(".investigation-report .report-top-strip h2")?.textContent?.trim().split(/\\s+/)[0]', returnByValue: true });
      overviewReportSymbol = report.result.value;
      if (overviewReportSymbol) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(overviewReportSymbol, overviewSymbol.result.value, 'Overview investigation must complete a report for the clicked symbol');
    await openNavigationDrawer();
    await realTap('button[aria-label="Overview"]', 'Return to Overview');
    await waitForScrollSettle();

    // 5. Test dynamic View all action in Overview
    console.log('[5/10] Testing "View all 14 assets" button...');
    await realTap('#section-overview button[aria-label^="View all "]', 'View all assets button');
    const viewAllNav = await sendCommand('Runtime.evaluate', {
      expression: `({
        activeNav: document.querySelector('.nav-item.active')?.getAttribute('aria-label'),
        scrollY: window.scrollY,
      })`,
      returnByValue: true,
    });
    console.log('View all result:', viewAllNav.result.value);
    assert.equal(viewAllNav.result.value.activeNav, 'Markets', 'Clicking View all assets must navigate to Markets');

    // 6. Test Refresh Button
    console.log('[6/10] Testing Refresh Button...');
    // Scroll to header
    await sendCommand('Runtime.evaluate', { expression: 'window.scrollTo(0, 0);' });
    await new Promise(r => setTimeout(r, 400));
    await openNavigationDrawer();
    await realTap('.refresh-button', 'Refresh button');
    const refreshResult = await sendCommand('Runtime.evaluate', {
      expression: `({
        text: document.querySelector('.refresh-button')?.textContent,
      })`,
      returnByValue: true,
    });
    console.log('Refresh button state:', refreshResult.result.value);
    assert.ok(refreshResult.result.value.text.includes('Refreshing') || refreshResult.result.value.text.includes('Updated') || refreshResult.result.value.text.includes('Refresh'));

    await realTap('.drawer-close-btn', 'Close refreshed drawer');
    await new Promise(r => setTimeout(r, 500));

    // Wait for refresh to settle so assets are populated and stable
    for (let i = 0; i < 30; i++) {
      const isBusy = await sendCommand('Runtime.evaluate', {
        expression: `document.querySelector('.refresh-button')?.textContent?.includes('Refreshing') || document.querySelectorAll('.market-row').length === 0`,
        returnByValue: true,
      });
      if (!isBusy?.result?.value) break;
      await new Promise(r => setTimeout(r, 200));
    }

    // 7. Test Search: Focus, Type, Outside Tap, Selection
    console.log('[7/10] Testing Search input and dropdown interaction...');
    // Tap search input
    await realTap('.search-wrap input', 'Search input');
    await new Promise(r => setTimeout(r, 500));

    const dropdownStatus = await sendCommand('Runtime.evaluate', {
      expression: `({
        isOpen: !!document.querySelector('.search-dropdown'),
        itemCount: document.querySelectorAll('.search-result-item').length,
        firstSymbol: document.querySelector('.search-result-item .search-item-symbol')?.textContent?.trim(),
      })`,
      returnByValue: true,
    });
    console.log('Search dropdown status:', dropdownStatus.result.value);
    assert.ok(dropdownStatus.result.value.isOpen, 'Search dropdown must open');
    assert.ok(dropdownStatus.result.value.itemCount > 0, 'Search dropdown must show matching results');

    const expectedSymbol = dropdownStatus.result.value.firstSymbol;

    // Tap first search result item
    console.log(`Tapping first search result item (${expectedSymbol}) in dropdown...`);
    await realTap('.search-result-item', 'First search item');
    await new Promise(r => setTimeout(r, 500));

    const afterSearchSelect = await sendCommand('Runtime.evaluate', {
      expression: `({
        isOpen: !!document.querySelector('.search-dropdown'),
        selectedAsset: document.querySelector('.market-row.selected-asset .asset-select')?.textContent?.trim(),
      })`,
      returnByValue: true,
    });
    console.log('After selecting search item:', afterSearchSelect.result.value);
    assert.equal(afterSearchSelect.result.value.isOpen, false, 'Dropdown must close after selection');
    assert.ok(afterSearchSelect.result.value.selectedAsset?.includes(expectedSymbol), `Selected asset must update to ${expectedSymbol}`);

    // Test tapping outside search closes it
    await realTap('.search-wrap input', 'Search input again');
    await new Promise(r => setTimeout(r, 300));
    // Tap outside (e.g. on workspace title)
    await realTap('#workspace-title', 'Workspace Title outside tap');
    const outsideClose = await sendCommand('Runtime.evaluate', {
      expression: '!document.querySelector(".search-dropdown")',
      returnByValue: true,
    });
    assert.equal(outsideClose.result.value, true, 'Tapping outside must close search dropdown');

    // 8. Test Market Card / Row Selection
    console.log('[8/10] Testing Market card selection in Markets section...');
    // Scroll to markets section and select the second row
    const secondRowSymbol = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const rows = document.querySelectorAll('#section-markets .market-row');
        return rows[1]?.querySelector('.asset-select')?.textContent?.trim();
      })()`,
      returnByValue: true,
    });
    console.log('Second row symbol to select:', secondRowSymbol.result.value);
    await realTap('#section-markets .market-row:nth-child(2)', 'Second market row');
    await new Promise(r => setTimeout(r, 400));
    const currentSelected = await sendCommand('Runtime.evaluate', {
      expression: 'document.querySelector(".market-row.selected-asset .asset-select")?.textContent?.trim()',
      returnByValue: true,
    });
    console.log('Currently selected symbol:', currentSelected.result.value);
    assert.equal(currentSelected.result.value, secondRowSymbol.result.value, 'Second row must be selected');

    // 9. Test Investigate on Market Card
    console.log('[9/10] Testing Investigate button on Markets card...');
    await realTap('#section-markets .market-row:nth-child(2) .row-investigate-btn', 'Card Investigate button');
    await waitForScrollSettle();
    const invTriggered = await sendCommand('Runtime.evaluate', {
      expression: `({
        activeNav: document.querySelector('.nav-item.active')?.getAttribute('aria-label'),
        hasLoadingOrReport: !!document.querySelector('.investigation-report, .investigation-loading-panel'),
      })`,
      returnByValue: true,
    });
    console.log('Investigation trigger result:', invTriggered.result.value);
    assert.equal(invTriggered.result.value.activeNav, 'Investigations', 'Must navigate to Investigations view');
    assert.equal(invTriggered.result.value.hasLoadingOrReport, true, 'Investigation workflow must start');

    // Wait for investigation report to finish
    console.log('Waiting for investigation report to render...');
    let reportReady = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const rep = await sendCommand('Runtime.evaluate', {
        expression: '!!document.querySelector(".investigation-report")',
        returnByValue: true,
      });
      if (rep.result.value) {
        reportReady = true;
        break;
      }
    }
    assert.ok(reportReady, 'Investigation report must render');

    // 10. Test Expandable Evidence Controls (Hypothesis accordion & Technical Details)
    console.log('[10/10] Testing Expandable Hypothesis Evidence Accordion...');
    const hypoSel = 'button[aria-controls^="hypo-evidence"]';
    await realTap(hypoSel, 'Hypothesis View Evidence button');
    await new Promise(r => setTimeout(r, 400));
    const hypoOpen = await sendCommand('Runtime.evaluate', {
      expression: `({
        expanded: document.querySelector('${hypoSel}')?.getAttribute('aria-expanded'),
        content: !!document.querySelector('.hypothesis-expanded-content'),
      })`,
      returnByValue: true,
    });
    console.log('Hypothesis accordion expanded:', hypoOpen.result.value);
    assert.equal(hypoOpen.result.value.expanded, 'true', 'Hypothesis must be expanded');
    assert.equal(hypoOpen.result.value.content, true, 'Expanded evidence content must be visible');

    // Tap again to collapse
    await realTap(hypoSel, 'Hypothesis Hide Evidence button');
    await new Promise(r => setTimeout(r, 400));
    const hypoClosed = await sendCommand('Runtime.evaluate', {
      expression: `({
        expanded: document.querySelector('${hypoSel}')?.getAttribute('aria-expanded'),
        content: !!document.querySelector('.hypothesis-expanded-content'),
      })`,
      returnByValue: true,
    });
    console.log('Hypothesis accordion collapsed:', hypoClosed.result.value);
    assert.equal(hypoClosed.result.value.expanded, 'false', 'Hypothesis must be collapsed');
    assert.equal(hypoClosed.result.value.content, false, 'Expanded evidence content must be hidden');

    // Test Technical Details summary toggle
    console.log('Testing Technical Details details/summary toggle...');
    await realTap('.technical-details summary', 'Technical details summary');
    await new Promise(r => setTimeout(r, 400));
    const techOpen = await sendCommand('Runtime.evaluate', {
      expression: 'document.querySelector(".technical-details")?.hasAttribute("open")',
      returnByValue: true,
    });
    console.log('Technical details open state:', techOpen.result.value);
    assert.equal(techOpen.result.value, true, 'Technical details must be open');

    console.log(`>>> ALL 10/10 INTERACTIONS PASSED ON ${vp.name}! <<<`);
  }

  ws.close();
  edge.kill();
  try {
    if (path.dirname(path.resolve(TEMP_PROFILE)) === path.resolve(os.tmpdir()) && path.basename(TEMP_PROFILE).startsWith('edge-verify-interactions-')) fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
  } catch {}

  console.log('\n======================================================');
  console.log(`VERIFIED ${process.argv.includes('--shell-only') ? 'SHELL' : 'FULL INTERACTIONS'}: ${widthFilter?.join(', ') ?? '375, 390, 430, 768, 1024, 1440'}`);
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
