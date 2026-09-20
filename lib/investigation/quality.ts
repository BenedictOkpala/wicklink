import type { DataQualityFactor, DataQualityScore, InvestigationEvidence } from './types.ts';

/**
 * Calculates a strictly deterministic Data Quality Score (0-100) based on observable
 * market evidence factors. This score is derived purely by deterministic mathematical rules
 * and MUST NOT be modified or hallucinated by any LLM.
 */
export function calculateDataQualityScore(evidence: InvestigationEvidence): DataQualityScore {
  // 1. Freshness Factor (25% weight)
  let freshnessScore = 0;
  const tokenizedAge = evidence.tokenizedAgeMs ?? Infinity;
  const referenceAge = evidence.referenceAgeMs ?? Infinity;
  const skew = evidence.timestampSkewMs ?? Infinity;

  let tokenScore = 0;
  if (tokenizedAge <= 15000) tokenScore = 100;
  else if (tokenizedAge <= 30000) tokenScore = 80;
  else if (tokenizedAge <= 60000) tokenScore = 50;
  else if (tokenizedAge <= 120000) tokenScore = 25;

  let refScore = 0;
  if (referenceAge <= 15000) refScore = 100;
  else if (referenceAge <= 30000) refScore = 80;
  else if (referenceAge <= 60000) refScore = 50;
  else if (referenceAge <= 120000) refScore = 25;

  let skewScore = 0;
  if (skew <= 3000) skewScore = 100;
  else if (skew <= 10000) skewScore = 80;
  else if (skew <= 30000) skewScore = 50;
  else if (skew <= 60000) skewScore = 25;

  freshnessScore = Math.round(tokenScore * 0.4 + refScore * 0.4 + skewScore * 0.2);
  const freshnessStatus = freshnessScore >= 80 ? 'EXCELLENT' : freshnessScore >= 60 ? 'GOOD' : freshnessScore >= 35 ? 'DEGRADED' : 'INSUFFICIENT';

  // 2. Provider Availability Factor (25% weight)
  let availabilityScore = 0;
  const bitgetPoints = evidence.bitgetStatus === 'LIVE' ? 50 : evidence.bitgetStatus === 'DELAYED' ? 25 : 0;
  const refPoints = evidence.referenceStatus === 'LIVE' ? 50 : evidence.referenceStatus === 'DELAYED' ? 25 : 0;
  availabilityScore = bitgetPoints + refPoints;
  const availabilityStatus = availabilityScore >= 90 ? 'EXCELLENT' : availabilityScore >= 50 ? 'GOOD' : availabilityScore > 0 ? 'DEGRADED' : 'INSUFFICIENT';

  // 3. Reference Quality Factor (25% weight)
  let refQualityScore = 0;
  if (evidence.comparisonStatus === 'UNAVAILABLE' || evidence.referencePrice === null) {
    refQualityScore = 0;
  } else if (evidence.referenceType === 'TRADE') {
    refQualityScore = 100;
  } else if (evidence.referenceType === 'INDICATIVE_MIDPOINT') {
    refQualityScore = 75; // Overnight indicative midpoint is valid but indicative
  } else {
    refQualityScore = 50;
  }

  // Adjust for stale comparison or delayed reference provider
  if (evidence.comparisonStatus === 'STALE' || evidence.referenceStatus === 'DELAYED') {
    refQualityScore = Math.min(refQualityScore, 40);
  }

  // Adjust for wide reference spread if available
  if (evidence.referenceSpreadPercent !== null && evidence.referenceSpreadPercent > 0.5) {
    refQualityScore = Math.max(20, refQualityScore - 20);
  }
  const refQualityStatus = refQualityScore >= 85 ? 'EXCELLENT' : refQualityScore >= 60 ? 'GOOD' : refQualityScore >= 30 ? 'DEGRADED' : 'INSUFFICIENT';

  // 4. Evidence Completeness Factor (25% weight)
  let completenessScore = 0;
  let completenessPoints = 0;
  if (evidence.tokenizedPrice !== null) completenessPoints += 25;
  if (evidence.referencePrice !== null) completenessPoints += 25;
  if (evidence.orderbook && evidence.orderbook.bids.length > 0 && evidence.orderbook.asks.length > 0) completenessPoints += 25;
  if (evidence.bitgetBid1Price !== null && evidence.bitgetAsk1Price !== null) completenessPoints += 15;
  if (evidence.bitgetVolume24h !== null) completenessPoints += 10;
  completenessScore = Math.min(100, completenessPoints);
  const completenessStatus = completenessScore >= 85 ? 'EXCELLENT' : completenessScore >= 60 ? 'GOOD' : completenessScore >= 35 ? 'DEGRADED' : 'INSUFFICIENT';

  // Overall Weighted Score
  const overallScore = Math.round(
    freshnessScore * 0.25 +
    availabilityScore * 0.25 +
    refQualityScore * 0.25 +
    completenessScore * 0.25
  );

  let grade: DataQualityScore['grade'] = 'HIGH';
  if (overallScore < 40) grade = 'CRITICAL';
  else if (overallScore < 65) grade = 'LOW';
  else if (overallScore < 85) grade = 'MODERATE';

  const factors: DataQualityFactor[] = [
    {
      name: 'Data Freshness',
      score: freshnessScore,
      weight: 0.25,
      status: freshnessStatus,
      description: `Tokenized age: ${evidence.tokenizedAgeMs !== null ? `${Math.floor(evidence.tokenizedAgeMs / 1000)}s` : 'unknown'}, Reference age: ${evidence.referenceAgeMs !== null ? `${Math.floor(evidence.referenceAgeMs / 1000)}s` : 'unknown'}, Skew: ${evidence.timestampSkewMs !== null ? `${(evidence.timestampSkewMs / 1000).toFixed(2)}s` : 'none'}`,
    },
    {
      name: 'Provider Health',
      score: availabilityScore,
      weight: 0.25,
      status: availabilityStatus,
      description: `Bitget: ${evidence.bitgetStatus}, Reference: ${evidence.referenceStatus} (${evidence.comparisonStatus})`,
    },
    {
      name: 'Reference Quality',
      score: refQualityScore,
      weight: 0.25,
      status: refQualityStatus,
      description: `Type: ${evidence.referenceType ?? 'UNAVAILABLE'}, Source: ${evidence.referenceSource ?? 'None'}${evidence.referenceSpreadPercent !== null ? `, Spread: ${evidence.referenceSpreadPercent.toFixed(3)}%` : ''}`,
    },
    {
      name: 'Evidence Completeness',
      score: completenessScore,
      weight: 0.25,
      status: completenessStatus,
      description: `Order book: ${evidence.orderbook ? 'Verified L2' : 'Top-of-book'}, 24h metrics: ${evidence.bitgetVolume24h !== null ? 'Present' : 'None'}, News: ${evidence.catalyst?.status ?? 'None'}`,
    },
  ];

  let summary = '';
  if (grade === 'HIGH') {
    summary = 'High verification fidelity: Fresh synchronized quotes with verified order book depth.';
  } else if (grade === 'MODERATE') {
    if (evidence.marketSession === 'OVERNIGHT' || evidence.marketSession === 'CLOSED') {
      summary = 'Moderate fidelity: Off-hours reference session with valid indicative quotes and synchronized feeds.';
    } else {
      summary = 'Moderate fidelity: Acceptable synchronization with minor latency or spread variance.';
    }
  } else if (grade === 'LOW') {
    summary = 'Low fidelity: Asynchronous observations, elevated latency, or partial quote withholding.';
  } else {
    summary = 'Critical data limitation: Incomplete quotes or disconnected reference provider.';
  }

  return {
    overallScore,
    grade,
    factors,
    summary,
  };
}
