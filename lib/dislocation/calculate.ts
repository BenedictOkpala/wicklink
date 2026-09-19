export function calculateDislocation(referencePrice: number, tokenizedPrice: number) {
  if (![referencePrice, tokenizedPrice].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) {
    throw new RangeError('Prices must be finite, positive numbers.');
  }
  const delta = tokenizedPrice - referencePrice;
  const flat = Math.abs(delta) <= Number.EPSILON * Math.max(referencePrice, tokenizedPrice) * 4;
  const percentage = (delta / referencePrice) * 100;
  if (!Number.isFinite(percentage)) throw new RangeError('Price ratio exceeds numeric range.');
  return {
    absoluteDifference: flat ? 0 : Number(Math.abs(delta).toPrecision(12)),
    percentageDifference: flat ? 0 : Number(percentage.toPrecision(12)),
    direction: flat ? 'flat' as const : delta > 0 ? 'premium' as const : 'discount' as const,
  };
}
