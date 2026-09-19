export const INVESTIGATION_SYMBOLS = [
  'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL',
  'AMD', 'NFLX', 'COIN', 'PLTR', 'MSTR', 'DIS', 'INTC',
] as const;

export type SupportedSymbol = typeof INVESTIGATION_SYMBOLS[number];

export const SYMBOL_METADATA: Record<SupportedSymbol, { tokenizedSymbol: string; displayName: string }> = {
  AAPL: { tokenizedSymbol: 'RAAPLUSDT', displayName: 'Apple Inc.' },
  NVDA: { tokenizedSymbol: 'RNVDAUSDT', displayName: 'NVIDIA Corporation' },
  TSLA: { tokenizedSymbol: 'RTSLAUSDT', displayName: 'Tesla, Inc.' },
  MSFT: { tokenizedSymbol: 'RMSFTUSDT', displayName: 'Microsoft Corporation' },
  AMZN: { tokenizedSymbol: 'RAMZNUSDT', displayName: 'Amazon.com, Inc.' },
  META: { tokenizedSymbol: 'RMETAUSDT', displayName: 'Meta Platforms, Inc.' },
  GOOGL: { tokenizedSymbol: 'RGOOGLUSDT', displayName: 'Alphabet Inc.' },
  AMD: { tokenizedSymbol: 'RAMDUSDT', displayName: 'Advanced Micro Devices, Inc.' },
  NFLX: { tokenizedSymbol: 'RNFLXUSDT', displayName: 'Netflix, Inc.' },
  COIN: { tokenizedSymbol: 'RCOINUSDT', displayName: 'Coinbase Global, Inc.' },
  PLTR: { tokenizedSymbol: 'RPLTRUSDT', displayName: 'Palantir Technologies Inc.' },
  MSTR: { tokenizedSymbol: 'RMSTRUSDT', displayName: 'MicroStrategy Incorporated' },
  DIS: { tokenizedSymbol: 'RDISUSDT', displayName: 'The Walt Disney Company' },
  INTC: { tokenizedSymbol: 'RINTCUSDT', displayName: 'Intel Corporation' },
};

export function isSupportedSymbol(rawSymbol: string): boolean {
  if (!rawSymbol || typeof rawSymbol !== 'string') return false;
  return Object.hasOwn(SYMBOL_METADATA, rawSymbol.trim().toUpperCase());
}

export function getSymbolMetadata(rawSymbol: string) {
  const symbol = rawSymbol.trim().toUpperCase() as SupportedSymbol;
  return SYMBOL_METADATA[symbol] ?? null;
}
