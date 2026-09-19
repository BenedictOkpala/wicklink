import type { DataStatus } from '../bitget/types.ts';

export interface ReferenceTrade {
  symbol: string;
  price: number | null;
  timestamp: string | null;
  feed: 'iex' | 'overnight';
  referenceType?: 'TRADE' | 'INDICATIVE_MIDPOINT';
  bidPrice?: number | null;
  askPrice?: number | null;
  currency: 'USD';
  status: DataStatus;
}

export interface ReferenceResult {
  feed?: 'iex' | 'overnight';
  httpStatus?: number;
  trades: ReferenceTrade[];
  status: DataStatus;
  issue: string | null;
}
