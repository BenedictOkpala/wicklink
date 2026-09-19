import type {
  AssetRelevance,
  CatalystArticle,
  CatalystEvidence,
  ExplanatoryCategory,
  TemporalRelevance,
} from './types.ts';

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // invalid URL format
  }
  return null;
}

const COMPANY_NAMES: Record<string, string[]> = {
  AAPL: ['Apple'],
  NVDA: ['NVIDIA', 'Nvidia'],
  TSLA: ['Tesla'],
  MSFT: ['Microsoft'],
  AMZN: ['Amazon'],
  META: ['Meta', 'Facebook'],
  GOOGL: ['Alphabet', 'Google'],
  AMD: ['AMD', 'Advanced Micro'],
  NFLX: ['Netflix'],
  COIN: ['Coinbase'],
  PLTR: ['Palantir'],
  MSTR: ['MicroStrategy', 'Micro Strategy', 'Strategy Inc'],
  DIS: ['Disney', 'Walt Disney'],
  INTC: ['Intel'],
};

export function classifyTemporalRelevance(ageRelativeMs: number, windowHours: number): TemporalRelevance {
  // Published in future relative to observation
  if (ageRelativeMs < -60000) return 'IRRELEVANT';
  // Published within 2 hours of observation: Breaking
  if (ageRelativeMs <= 2 * 3600 * 1000) return 'BREAKING';
  // Published within 24 hours of observation: Recent
  if (ageRelativeMs <= 24 * 3600 * 1000) return 'RECENT';
  // Published within the bounded window (e.g. 48h): Dated
  if (ageRelativeMs <= windowHours * 3600 * 1000) return 'DATED';
  return 'IRRELEVANT';
}

// Backward compatibility alias
export const classifyRelevance = classifyTemporalRelevance;

export function classifyAssetRelevance(
  headline: string,
  symbols: string[],
  targetSymbol: string
): AssetRelevance {
  const upperTarget = targetSymbol.toUpperCase();
  const aliases = [upperTarget, ...(COMPANY_NAMES[upperTarget] ?? [])];

  const headlineHasMention = aliases.some(alias => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(headline);
  });

  // If tagged across many symbols (>3) without headline focus, it is a basket or broad sector article
  if (symbols.length > 3) {
    if (!headlineHasMention) {
      return 'BASKET_OR_INDEX';
    }
    // Check if headline lists 3 or more companies (e.g., "Nvidia, AMD and Intel...")
    const multipleTickersInHeadline = symbols.filter(s =>
      new RegExp(`\\b${s}\\b`, 'i').test(headline)
    ).length >= 3;

    return multipleTickersInHeadline ? 'SECONDARY_MENTION' : 'PRIMARY_FOCUS';
  }

  // 1-3 symbols tagged: headline presence determines primary focus vs secondary mention
  if (headlineHasMention) {
    return 'PRIMARY_FOCUS';
  }

  return 'SECONDARY_MENTION';
}

export function classifyExplanatoryCategory(
  headline: string,
  summary: string | null
): ExplanatoryCategory {
  const headlineLower = headline.toLowerCase();
  const fullText = `${headline} ${summary ?? ''}`.toLowerCase();

  // 1. Portfolio disclosure / politician trade tracking
  if (/\b(congressman|congresswoman|senator|pelosi|politician|lawmaker|trades|ditches|buys|sells|bought|sold|discloses|disclosure|13f|13-f|portfolio|filing shows|holdings|fund dumps|fund acquires|stake in)\b/i.test(fullText)) {
    return 'PORTFOLIO_DISCLOSURE';
  }

  // 2. Generic market roundups, macro wraps, weekly summaries
  if (/\b(this week on wall street|week in review|morning briefing|market wrap|market recap|markets today|wall street today|top movers|stocks to watch|fed raises|inflation data|cpi report|treasury yields|yields hit|jobs report|here's what happened|sp500|s&p 500|nasdaq falls|dow drops|sector overview|magnificent seven stocks)\b/i.test(fullText)) {
    return 'GENERIC_ROUNDUP';
  }

  // 3. Editorial commentary, opinion pieces, or casual discussion (filter before material event)
  if (/\b(exclusive:|quick spark:|opinion:|column:|analysis:|why .*|how .*|what .*|could .*|here's what|has a catch|attention correlates|forget the|says ai labs|says)\b/i.test(headlineLower)) {
    return 'GENERAL_COMMENTARY';
  }

  // 4. Material corporate events (hard economic catalysts — must be present in headline)
  if (/\b(reports (q[1-4]|earnings|results|revenue)|earnings (beat|miss|report|release)|q[1-4] (earnings|results|revenue beat)|revenue (beat|miss|surges|plunges)|eps (beat|miss)|profit warning|guidance (cut|lowered|raised|hiked|boosted|slashed)|financial results|merger|acquisition|to acquire|to buy|buyout|takeover|fda (approval|clears|rejects)|clinical trial|phase [1-3] results|ceo (resigns|steps down|fired|ousted|appointed)|cfo (resigns|steps down)|investigation by sec|doj sues|antitrust lawsuit|sec charges|stock split|dividend (cut|suspended|hike|increase)|restructuring|layoffs|production halt|product recall|major contract)\b/i.test(headlineLower)) {
    return 'MATERIAL_CORPORATE_EVENT';
  }

  // 5. Analyst ratings, price targets, or secondary product announcements
  if (/\b(upgrades|downgrades|price target|initiates coverage|launches|unveils|announces partnership|partners with|expands partnership|developer conference|unveils new)\b/i.test(headlineLower)) {
    return 'ANALYST_OR_PRODUCT';
  }

  // 6. Default generic market opinion / commentary
  return 'GENERAL_COMMENTARY';
}

export function normalizeCatalystNews(
  raw: unknown,
  targetSymbol: string,
  observationTimeMs: number,
  windowHours = 48,
  providerName = 'Alpaca Market News'
): CatalystEvidence {
  const searchedAt = new Date().toISOString();
  const upperSymbol = targetSymbol.trim().toUpperCase();

  if (!isRecord(raw) || !Array.isArray(raw.news)) {
    return {
      status: 'UNAVAILABLE',
      provider: providerName,
      searchedAt,
      symbol: upperSymbol,
      windowHours,
      articles: [],
      breakingCount: 0,
      recentCount: 0,
      materialCount: 0,
      issue: 'Malformed or empty news payload received from provider.',
    };
  }

  const rawArticles = raw.news;
  const articles: CatalystArticle[] = [];

  for (const item of rawArticles) {
    if (!isRecord(item)) continue;
    const headline = typeof item.headline === 'string' ? item.headline.trim() : '';
    if (!headline) continue;

    const rawId = item.id != null ? String(item.id) : `news-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const source = typeof item.source === 'string' && item.source.trim() ? item.source.trim() : 'Market Wire';
    const dateStr = typeof item.created_at === 'string' ? item.created_at : typeof item.published_at === 'string' ? item.published_at : null;
    if (!dateStr) continue;

    const publishedTime = Date.parse(dateStr);
    if (!Number.isFinite(publishedTime)) continue;

    const symbols = Array.isArray(item.symbols)
      ? item.symbols.filter((s): s is string => typeof s === 'string').map(s => s.toUpperCase())
      : [];

    // Ticker relevance filter: must match queried symbol in symbols list or headline
    const matchesSymbol = symbols.includes(upperSymbol) || new RegExp(`\\b${upperSymbol}\\b`, 'i').test(headline);
    if (!matchesSymbol) continue;

    const ageRelativeMs = Math.max(0, observationTimeMs - publishedTime);
    const temporalRelevance = classifyTemporalRelevance(ageRelativeMs, windowHours);

    // Only include articles that fall within the configured window
    if (temporalRelevance === 'IRRELEVANT') continue;

    const url = safeUrl(item.url);
    const summary = typeof item.summary === 'string' && item.summary.trim() ? item.summary.trim() : null;

    const assetRelevance = classifyAssetRelevance(headline, symbols, upperSymbol);
    const explanatoryCategory = classifyExplanatoryCategory(headline, summary);

    // True ONLY if primary asset focus AND verified material corporate event
    const isMaterialCatalyst = assetRelevance === 'PRIMARY_FOCUS' && explanatoryCategory === 'MATERIAL_CORPORATE_EVENT';

    articles.push({
      id: rawId,
      headline,
      source,
      publishedAt: new Date(publishedTime).toISOString(),
      url,
      symbols,
      ageRelativeMs,
      relevance: temporalRelevance,
      temporalRelevance,
      assetRelevance,
      explanatoryCategory,
      isMaterialCatalyst,
      summary,
    });
  }

  // Sort descending by publication time (most recent first)
  articles.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const breakingCount = articles.filter(a => a.temporalRelevance === 'BREAKING').length;
  const recentCount = articles.filter(a => a.temporalRelevance === 'RECENT').length;
  const materialCount = articles.filter(a => a.isMaterialCatalyst).length;

  return {
    status: articles.length > 0 ? 'AVAILABLE' : 'NO_CATALYSTS_FOUND',
    provider: providerName,
    searchedAt,
    symbol: upperSymbol,
    windowHours,
    articles,
    breakingCount,
    recentCount,
    materialCount,
    issue: articles.length === 0 ? `No qualifying catalyst headlines found within ${windowHours}h window.` : null,
  };
}
