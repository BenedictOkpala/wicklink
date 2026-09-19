import type { Instrument } from './types.ts';
// Candidates only: membership requires an actual isReality=yes instrument response.
export interface CandidateSymbol {
  symbol: string;
  displayName: string;
  base: string;
}

// Candidates only: membership strictly requires an actual isReality=yes instrument response from Bitget.
export const CANDIDATE_SYMBOLS: CandidateSymbol[] = [
  { symbol: 'AAPL', displayName: 'Apple Inc.', base: 'RAAPL' },
  { symbol: 'NVDA', displayName: 'NVIDIA Corporation', base: 'RNVDA' },
  { symbol: 'TSLA', displayName: 'Tesla, Inc.', base: 'RTSLA' },
  { symbol: 'MSFT', displayName: 'Microsoft Corporation', base: 'RMSFT' },
  { symbol: 'AMZN', displayName: 'Amazon.com, Inc.', base: 'RAMZN' },
  { symbol: 'META', displayName: 'Meta Platforms, Inc.', base: 'RMETA' },
  { symbol: 'GOOGL', displayName: 'Alphabet Inc.', base: 'RGOOGL' },
  { symbol: 'AMD', displayName: 'Advanced Micro Devices, Inc.', base: 'RAMD' },
  { symbol: 'NFLX', displayName: 'Netflix, Inc.', base: 'RNFLX' },
  { symbol: 'COIN', displayName: 'Coinbase Global, Inc.', base: 'RCOIN' },
  { symbol: 'PLTR', displayName: 'Palantir Technologies Inc.', base: 'RPLTR' },
  { symbol: 'MSTR', displayName: 'MicroStrategy Incorporated', base: 'RMSTR' },
  { symbol: 'DIS', displayName: 'The Walt Disney Company', base: 'RDIS' },
  { symbol: 'INTC', displayName: 'Intel Corporation', base: 'RINTC' },
];

export function discoverSymbols(instruments: Instrument[], candidates: CandidateSymbol[] = CANDIDATE_SYMBOLS) {
  return candidates.flatMap(candidate => {
    const instrument = instruments.find(item => item.baseCoin.toUpperCase() === candidate.base && item.quoteCoin === 'USDT' && item.isReality.toLowerCase() === 'yes');
    return instrument ? [{ ...candidate, instrument }] : [];
  });
}
