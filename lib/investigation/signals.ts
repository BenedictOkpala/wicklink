import { INVESTIGATION_POLICY } from './policy.ts';
import type { InvestigationEvidence, InvestigationSignal } from './types.ts';

export function deriveDeterministicSignals(evidence: InvestigationEvidence): InvestigationSignal[] {
  const signals: InvestigationSignal[] = [];

  // 1. DISLOCATION_MAGNITUDE
  const dislocation = evidence.rawDislocationPercent;
  if (dislocation === null) {
    signals.push({
      id: 'DISLOCATION_MAGNITUDE',
      name: 'Dislocation Magnitude',
      category: 'PRICING',
      value: 'Withheld / Null',
      numericValue: null,
      interpretation: 'No valid numeric dislocation is available under current freshness or session gates.',
      severity: 'WARNING',
    });
  } else {
    const absPercent = Math.abs(dislocation);
    const signStr = dislocation > 0 ? `+${dislocation.toFixed(4)}%` : `${dislocation.toFixed(4)}%`;
    let band: string;
    let severity: InvestigationSignal['severity'] = 'INFO';

    if (absPercent < INVESTIGATION_POLICY.DISLOCATION.MINIMAL_THRESHOLD_PERCENT) {
      band = `Minimal (<${INVESTIGATION_POLICY.DISLOCATION.MINIMAL_THRESHOLD_PERCENT}%)`;
      severity = 'INFO';
    } else if (absPercent <= INVESTIGATION_POLICY.DISLOCATION.MODERATE_THRESHOLD_PERCENT) {
      band = `Moderate (${INVESTIGATION_POLICY.DISLOCATION.MINIMAL_THRESHOLD_PERCENT}%–${INVESTIGATION_POLICY.DISLOCATION.MODERATE_THRESHOLD_PERCENT}%)`;
      severity = 'INFO';
    } else {
      band = `Significant (>${INVESTIGATION_POLICY.DISLOCATION.MODERATE_THRESHOLD_PERCENT}%)`;
      severity = 'ALERT';
    }

    signals.push({
      id: 'DISLOCATION_MAGNITUDE',
      name: 'Dislocation Magnitude',
      category: 'PRICING',
      value: `${signStr} (${band})`,
      numericValue: dislocation,
      interpretation: `Observed raw price difference between tokenized quote and reference is ${signStr}. Policy categorization: ${band}.`,
      severity,
    });
  }

  // 2. REFERENCE_FRESHNESS
  const refAge = evidence.referenceAgeMs;
  if (refAge === null) {
    signals.push({
      id: 'REFERENCE_FRESHNESS',
      name: 'Reference Freshness',
      category: 'SYNCHRONIZATION',
      value: 'Unknown',
      numericValue: null,
      interpretation: 'Reference observation age could not be determined.',
      severity: 'WARNING',
    });
  } else {
    const ageSeconds = (refAge / 1000).toFixed(1);
    let severity: InvestigationSignal['severity'] = 'INFO';
    let statusLabel = 'Fresh';

    if (refAge <= INVESTIGATION_POLICY.FRESHNESS.FRESH_MAX_MS) {
      statusLabel = 'Recent (<15s)';
      severity = 'INFO';
    } else if (refAge <= INVESTIGATION_POLICY.FRESHNESS.ACCEPTABLE_MAX_MS) {
      statusLabel = 'Acceptable (15s–60s)';
      severity = 'INFO';
    } else {
      statusLabel = 'Stale (>60s)';
      severity = 'WARNING';
    }

    signals.push({
      id: 'REFERENCE_FRESHNESS',
      name: 'Reference Freshness',
      category: 'SYNCHRONIZATION',
      value: `${ageSeconds}s (${statusLabel})`,
      numericValue: refAge,
      interpretation: `Last reference trade/quote observed ${ageSeconds}s ago from ${evidence.referenceSource ?? 'provider'}.`,
      severity,
    });
  }

  // 3. TOKENIZED_FRESHNESS
  const tokAge = evidence.tokenizedAgeMs;
  if (tokAge === null) {
    signals.push({
      id: 'TOKENIZED_FRESHNESS',
      name: 'Tokenized Freshness',
      category: 'SYNCHRONIZATION',
      value: 'Unknown',
      numericValue: null,
      interpretation: 'Bitget tokenized observation age could not be determined.',
      severity: 'WARNING',
    });
  } else {
    const ageSeconds = (tokAge / 1000).toFixed(1);
    let severity: InvestigationSignal['severity'] = 'INFO';
    let statusLabel = 'Fresh';

    if (tokAge <= INVESTIGATION_POLICY.FRESHNESS.FRESH_MAX_MS) {
      statusLabel = 'Recent (<15s)';
      severity = 'INFO';
    } else if (tokAge <= INVESTIGATION_POLICY.FRESHNESS.ACCEPTABLE_MAX_MS) {
      statusLabel = 'Acceptable (15s–60s)';
      severity = 'INFO';
    } else {
      statusLabel = 'Stale (>60s)';
      severity = 'WARNING';
    }

    signals.push({
      id: 'TOKENIZED_FRESHNESS',
      name: 'Tokenized Freshness',
      category: 'SYNCHRONIZATION',
      value: `${ageSeconds}s (${statusLabel})`,
      numericValue: tokAge,
      interpretation: `Last Bitget token snapshot observed ${ageSeconds}s ago.`,
      severity,
    });
  }

  // 4. TIMESTAMP_ALIGNMENT
  const skew = evidence.timestampSkewMs;
  if (skew === null) {
    signals.push({
      id: 'TIMESTAMP_ALIGNMENT',
      name: 'Timestamp Alignment',
      category: 'SYNCHRONIZATION',
      value: 'Unsynchronized / Unknown',
      numericValue: null,
      interpretation: 'Timestamp separation between Bitget and reference market is unknown.',
      severity: 'WARNING',
    });
  } else {
    const skewSeconds = (skew / 1000).toFixed(2);
    let severity: InvestigationSignal['severity'] = 'INFO';
    let statusLabel = 'Tight';

    if (skew <= INVESTIGATION_POLICY.SKEW.TIGHT_MAX_MS) {
      statusLabel = 'Tight (<5s)';
      severity = 'INFO';
    } else if (skew <= INVESTIGATION_POLICY.SKEW.MODERATE_MAX_MS) {
      statusLabel = 'Moderate (5s–15s)';
      severity = 'INFO';
    } else if (skew <= INVESTIGATION_POLICY.SKEW.WIDE_MAX_MS) {
      statusLabel = 'Wide (15s–30s)';
      severity = 'WARNING';
    } else {
      statusLabel = 'Exceeds limit (>30s)';
      severity = 'ALERT';
    }

    signals.push({
      id: 'TIMESTAMP_ALIGNMENT',
      name: 'Timestamp Alignment',
      category: 'SYNCHRONIZATION',
      value: `${skewSeconds}s delta (${statusLabel})`,
      numericValue: skew,
      interpretation: `Provider observation timestamps differ by ${skewSeconds} seconds. Policy category: ${statusLabel}.`,
      severity,
    });
  }

  // 5. MARKET_SESSION_CONTEXT
  const session = evidence.marketSession;
  let sessionInterpretation: string;
  let sessionSeverity: InvestigationSignal['severity'] = 'INFO';

  switch (session) {
    case 'REGULAR':
      sessionInterpretation = 'Primary US equity exchanges are open. High reference liquidity expected.';
      sessionSeverity = 'INFO';
      break;
    case 'OVERNIGHT':
      sessionInterpretation = 'US equity overnight trading session. Primary exchanges closed; using indicative quote midpoint.';
      sessionSeverity = 'WARNING';
      break;
    case 'PRE_MARKET':
    case 'AFTER_HOURS':
      sessionInterpretation = 'Extended market session. Comparisons withheld pending verified reference feed.';
      sessionSeverity = 'WARNING';
      break;
    case 'CLOSED':
      sessionInterpretation = 'US equity markets closed (weekend/holiday). Token trades 24/7 against closed underlying market.';
      sessionSeverity = 'ALERT';
      break;
    default:
      sessionInterpretation = 'Market session could not be authoritatively resolved.';
      sessionSeverity = 'WARNING';
  }

  signals.push({
    id: 'MARKET_SESSION_CONTEXT',
    name: 'Market Session Context',
    category: 'SESSION',
    value: session,
    numericValue: null,
    interpretation: sessionInterpretation,
    severity: sessionSeverity,
  });

  // 6. LIQUIDITY_CONTEXT
  const spreadPercent = evidence.bitgetSpreadPercent;
  let liquidityValue = 'Spread not observed';
  let liquidityInterpretation = 'Top of book spread data unavailable.';
  let liquiditySeverity: InvestigationSignal['severity'] = 'INFO';

  if (spreadPercent !== null) {
    const spreadStr = `${spreadPercent.toFixed(3)}%`;
    if (spreadPercent <= INVESTIGATION_POLICY.LIQUIDITY.TIGHT_SPREAD_PERCENT) {
      liquidityValue = `Tight (${spreadStr})`;
      liquidityInterpretation = `Bitget top-of-book bid/ask spread is tight (${spreadStr}). Good quoting density.`;
      liquiditySeverity = 'INFO';
    } else if (spreadPercent <= INVESTIGATION_POLICY.LIQUIDITY.MODERATE_SPREAD_PERCENT) {
      liquidityValue = `Moderate (${spreadStr})`;
      liquidityInterpretation = `Bitget top-of-book spread is moderate (${spreadStr}). Normal liquidity conditions.`;
      liquiditySeverity = 'INFO';
    } else {
      liquidityValue = `Wide (${spreadStr})`;
      liquidityInterpretation = `Bitget top-of-book spread is wide (${spreadStr}). May indicate reduced quoting liquidity.`;
      liquiditySeverity = 'WARNING';
    }
  } else if (evidence.bitgetVolume24h !== null) {
    liquidityValue = `24h Vol: ${evidence.bitgetVolume24h.toLocaleString()}`;
    liquidityInterpretation = `24h trading volume reported as ${evidence.bitgetVolume24h.toLocaleString()} units.`;
  }

  signals.push({
    id: 'LIQUIDITY_CONTEXT',
    name: 'Liquidity Context',
    category: 'LIQUIDITY',
    value: liquidityValue,
    numericValue: spreadPercent,
    interpretation: liquidityInterpretation,
    severity: liquiditySeverity,
  });

  return signals;
}
