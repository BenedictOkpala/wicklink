async function test() {
  console.log('--- 1. Testing GET / from localhost and 10.184.105.91 ---');
  const r1 = await fetch('http://localhost:3000/');
  console.log('GET http://localhost:3000/: HTTP', r1.status);
  const r2 = await fetch('http://10.184.105.91:3000/');
  console.log('GET http://10.184.105.91:3000/: HTTP', r2.status);

  console.log('\n--- 2. Testing GET /api/market from localhost and 10.184.105.91 ---');
  const m1 = await fetch('http://localhost:3000/api/market');
  const d1 = await m1.json();
  console.log('GET /api/market (localhost): HTTP', m1.status, 'assets:', d1.assets?.length, 'session:', d1.sessionDiagnostics?.session, 'dataStatus:', d1.dataStatus);

  const m2 = await fetch('http://10.184.105.91:3000/api/market');
  const d2 = await m2.json();
  console.log('GET /api/market (10.184.105.91): HTTP', m2.status, 'assets:', d2.assets?.length, 'session:', d2.sessionDiagnostics?.session, 'dataStatus:', d2.dataStatus);

  console.log('\n--- 3. Testing POST /api/investigate for NVDA ---');
  const inv = await fetch('http://10.184.105.91:3000/api/investigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'NVDA' })
  });
  const invData = await inv.json();
  console.log('POST /api/investigate: HTTP', inv.status, 'symbol:', invData.symbol, 'hypotheses:', invData.hypotheses?.length, 'catalyst status:', invData.evidence?.catalyst?.status);

  console.log('\n--- 4. Testing Multi-Cycle Auto-Refresh (5 cycles) ---');
  for (let i = 1; i <= 5; i++) {
    const t0 = Date.now();
    const cycleRes = await fetch('http://10.184.105.91:3000/api/market', { cache: 'no-store' });
    const cycleData = await cycleRes.json();
    console.log('Cycle ' + i + ': HTTP ' + cycleRes.status + ' in ' + (Date.now() - t0) + 'ms | Assets: ' + cycleData.assets?.length + ' | Session: ' + cycleData.sessionDiagnostics?.session + ' | Status: ' + cycleData.dataStatus);
    if (i < 5) await new Promise(r => setTimeout(r, 1000));
  }
}
test().catch(err => console.error(err));

