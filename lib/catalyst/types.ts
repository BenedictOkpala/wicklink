export type TemporalRelevance = 'BREAKING' | 'RECENT' | 'DATED' | 'IRRELEVANT';
export type CatalystRelevance = TemporalRelevance; // Backward compatibility alias

export type AssetRelevance = 'PRIMARY_FOCUS' | 'SECONDARY_MENTION' | 'BASKET_OR_INDEX';

export type ExplanatoryCategory =
  | 'MATERIAL_CORPORATE_EVENT'
  | 'ANALYST_OR_PRODUCT'
  | 'GENERIC_ROUNDUP'
  | 'PORTFOLIO_DISCLOSURE'
  | 'GENERAL_COMMENTARY';

export interface CatalystArticle {
  id: string;
  headline: string;
  source: string;
  publishedAt: string;
  url: string | null;
  symbols: string[];
  ageRelativeMs: number; // Age relative to observation timestamp (positive = before observation)
  relevance: TemporalRelevance; // Temporal proximity tier (BREAKING / RECENT / DATED / IRRELEVANT)
  temporalRelevance: TemporalRelevance;
  assetRelevance: AssetRelevance;
  explanatoryCategory: ExplanatoryCategory;
  isMaterialCatalyst: boolean; // True ONLY if primary asset focus AND material corporate event
  summary: string | null;
}

export type CatalystStatus =
  | 'AVAILABLE'
  | 'NO_CATALYSTS_FOUND'
  | 'UNAVAILABLE'
  | 'UNCONFIGURED';

export interface CatalystEvidence {
  status: CatalystStatus;
  provider: string;
  searchedAt: string;
  symbol: string;
  windowHours: number;
  articles: CatalystArticle[];
  breakingCount: number;
  recentCount: number;
  materialCount: number; // Count of articles meeting material catalyst criteria
  issue: string | null;
}
