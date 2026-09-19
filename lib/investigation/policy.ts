/**
 * NightShift V1 Research Heuristic Policy.
 *
 * NOTE: These thresholds are application monitoring heuristics designed
 * for filtering and categorization in V1, not universal or objectively
 * established market definitions. All values are configurable.
 */

export const INVESTIGATION_POLICY = {
  // Dislocation magnitude heuristic bands (percentage)
  DISLOCATION: {
    MINIMAL_THRESHOLD_PERCENT: 0.05,
    MODERATE_THRESHOLD_PERCENT: 0.25,
  },

  // Freshness heuristic thresholds (milliseconds)
  FRESHNESS: {
    FRESH_MAX_MS: 15_000,
    ACCEPTABLE_MAX_MS: 60_000,
  },

  // Timestamp alignment heuristic thresholds (milliseconds)
  SKEW: {
    TIGHT_MAX_MS: 5_000,
    MODERATE_MAX_MS: 15_000,
    WIDE_MAX_MS: 30_000,
  },

  // Liquidity heuristic thresholds (percentage spread)
  LIQUIDITY: {
    TIGHT_SPREAD_PERCENT: 0.05,
    MODERATE_SPREAD_PERCENT: 0.15,
  },
} as const;
