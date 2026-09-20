import assert from 'node:assert/strict';

async function runChecks() {
  console.log('=== 1. VERIFY ALL 14 ASSETS LOAD FROM /api/market ===');
  const marketRes = await fetch('http://localhost:3000/api/market');
  assert.equal(marketRes.status, 200, 'Market API should return HTTP 200');
  const marketData = await marketRes.json();
  console.log(`Loaded ${marketData.assets?.length} assets. Session: ${marketData.sessionDiagnostics?.session}, Status: ${marketData.dataStatus}`);
  assert.equal(marketData.assets?.length, 14, 'Should return exactly 14 assets');
  for (const a of marketData.assets) {
    console.log(`  - ${a.symbol} (r${a.symbol}): tokenized $${a.tokenizedPrice ?? 'null'} / ref $${a.referencePrice ?? 'null'} [${a.comparisonStatus}]`);
  }

  console.log('\n=== 2. VERIFY /api/investigate PAYLOAD STRUCTURE (V2 CONTRACT) ===');
  const invRes = await fetch('http://localhost:3000/api/investigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'NVDA' })
  });
  assert.equal(invRes.status, 200, 'Investigate API should return HTTP 200');
  const invData = await invRes.json();
  console.log(`Investigation Report ID: ${invData.id}`);
  console.log(`Symbol: ${invData.symbol} (${invData.tokenizedSymbol})`);
  console.log(`Duration: ${invData.durationMs}ms | AI Status: ${invData.aiStatus}`);
  console.log(`Data Quality Score: ${invData.dataQuality?.overallScore}/100 (${invData.dataQuality?.grade})`);
  console.log(`Data Quality Summary: ${invData.dataQuality?.summary}`);
  console.log(`Data Quality Factors: ${invData.dataQuality?.factors?.map(f => `${f.name}: ${f.score}%`).join(', ')}`);
  
  assert.ok(invData.dataQuality, 'Must contain deterministic dataQuality score');
  assert.ok(typeof invData.dataQuality.overallScore === 'number', 'Overall score must be numeric');
  assert.ok(invData.assessment, 'Must contain assessment');
  assert.ok(invData.assessment.whyThisMatters, 'Must contain whyThisMatters');
  console.log(`Why This Matters: "${invData.assessment.whyThisMatters}"`);
  console.log(`Closed Market Callout: "${invData.assessment.closedMarketCallout ?? 'N/A'}"`);
  console.log(`Verdict: ${invData.assessment.dislocationVerdict}`);
  console.log(`Primary Explanation: ${invData.assessment.primaryExplanation}`);
  assert.equal(invData.hypotheses?.length, 6, 'Must contain 6 hypotheses');

  console.log('\n=== 3. VERIFY CLOSED-MARKET INVESTIGATION ===');
  // When session is CLOSED, closedMarketCallout must be populated
  if (marketData.sessionDiagnostics?.session === 'CLOSED' || marketData.sessionDiagnostics?.session === 'OVERNIGHT') {
    assert.ok(invData.assessment.closedMarketCallout, 'Closed market callout must be set during CLOSED/OVERNIGHT session');
    assert.ok(invData.assessment.closedMarketCallout.includes('Wall Street closed. Price discovery didn\'t.'), 'Must contain closed-market signature phrase');
    console.log('✓ Closed-market framing verified: "Wall Street closed. Price discovery didn\'t." is active.');
  }

  console.log('\n=== 4. VERIFY /api/investigate FOR OTHER SYMBOLS (AAPL, TSLA) ===');
  for (const sym of ['AAPL', 'TSLA']) {
    const res = await fetch('http://localhost:3000/api/investigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: sym })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    console.log(`  - ${sym}: Score ${data.dataQuality?.overallScore}/100 (${data.dataQuality?.grade}) | Verdict: ${data.assessment?.dislocationVerdict} | Why: "${data.assessment?.whyThisMatters?.slice(0, 60)}..."`);
  }

  console.log('\n=== ALL V2 LIVE CHECKS PASSED SUCCESSFULLY ===');
}

runChecks().catch(err => {
  console.error('FATAL CHECK FAILURE:', err);
  process.exit(1);
});

