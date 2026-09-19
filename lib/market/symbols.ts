export const REFERENCE_SYMBOLS = ['AAPL', 'NVDA', 'TSLA'] as const;

export const MONITORED_SYMBOLS = [
  'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL',
  'AMD', 'NFLX', 'COIN', 'PLTR', 'MSTR', 'DIS', 'INTC',
] as const;

const mapping: Record<string, string> = {
  RAAPLUSDT: 'AAPL',
  RNVDAUSDT: 'NVDA',
  RTSLAUSDT: 'TSLA',
  RMSFTUSDT: 'MSFT',
  RAMZNUSDT: 'AMZN',
  RMETAUSDT: 'META',
  RGOOGLUSDT: 'GOOGL',
  RAMDUSDT: 'AMD',
  RNFLXUSDT: 'NFLX',
  RCOINUSDT: 'COIN',
  RPLTRUSDT: 'PLTR',
  RMSTRUSDT: 'MSTR',
  RDISUSDT: 'DIS',
  RINTCUSDT: 'INTC',
};

export function referenceSymbol(tokenizedSymbol: string): string | null {
  return Object.hasOwn(mapping, tokenizedSymbol) ? mapping[tokenizedSymbol] : null;
}
