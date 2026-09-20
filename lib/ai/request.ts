import { isRecord } from '../bitget/normalize.ts';
import type { AiInvestigationInput, AiInvestigationOutput } from './types.ts';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompts.ts';
import type { DislocationVerdict, HypothesisId, HypothesisStatus, InvestigationAssessment, InvestigationHypothesis } from '../investigation/types.ts';

export interface AiExecutionResult {
  status: 'COMPLETED' | 'AI_ANALYSIS_UNAVAILABLE' | 'FAILED';
  output: AiInvestigationOutput | null;
  issue: string | null;
}

export function normalizeAiEndpoint(rawUrl: string = 'https://api.openai.com/v1'): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.openai.com/v1/chat/completions';
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

export function parseAiOutput(raw: unknown): AiInvestigationOutput | null {
  if (!isRecord(raw)) return null;

  // Validate assessment
  if (!isRecord(raw.assessment)) return null;
  const a = raw.assessment;
  if (typeof a.summary !== 'string' || typeof a.primaryExplanation !== 'string') return null;

  const validVerdicts: DislocationVerdict[] = [
    'MEANINGFUL_DISLOCATION',
    'MARKET_STRUCTURE_EFFECT',
    'DATA_LATENCY_ARTIFACT',
    'INSUFFICIENT_DATA',
  ];
  const verdict = typeof a.dislocationVerdict === 'string' && validVerdicts.includes(a.dislocationVerdict as DislocationVerdict)
    ? (a.dislocationVerdict as DislocationVerdict)
    : 'MARKET_STRUCTURE_EFFECT';

  const toStringArray = (arr: unknown): string[] => Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];

  const whyThisMatters = typeof a.whyThisMatters === 'string' && a.whyThisMatters.trim().length > 0
    ? a.whyThisMatters.trim()
    : a.primaryExplanation;

  const closedMarketCallout = typeof a.closedMarketCallout === 'string' && a.closedMarketCallout.trim().length > 0
    ? a.closedMarketCallout.trim()
    : null;

  const assessment: InvestigationAssessment = {
    summary: a.summary,
    primaryExplanation: a.primaryExplanation,
    whyThisMatters,
    closedMarketCallout,
    dislocationVerdict: verdict,
    keyRisks: toStringArray(a.keyRisks),
    keyEvidencePoints: toStringArray(a.keyEvidencePoints),
    limitations: toStringArray(a.limitations),
  };

  // Validate hypotheses
  if (!Array.isArray(raw.hypotheses)) return null;
  const validIds: HypothesisId[] = [
    'LIQUIDITY_IMBALANCE',
    'OFF_HOURS_PRICE_DISCOVERY',
    'REFERENCE_LAG',
    'TOKENIZED_MARKET_LAG',
    'MARKET_EVENT',
    'INSUFFICIENT_EVIDENCE',
  ];
  const validStatuses: HypothesisStatus[] = [
    'SUPPORTED',
    'PARTIALLY_SUPPORTED',
    'PLAUSIBLE',
    'WEAK',
    'CONTRADICTED',
    'INSUFFICIENT_DATA',
    'UNRESOLVED',
  ];

  const hypotheses: InvestigationHypothesis[] = [];
  for (const item of raw.hypotheses) {
    if (!isRecord(item) || typeof item.id !== 'string' || !validIds.includes(item.id as HypothesisId)) continue;
    const status = typeof item.status === 'string' && validStatuses.includes(item.status as HypothesisStatus)
      ? (item.status as HypothesisStatus)
      : 'UNRESOLVED';
    const confidence = typeof item.confidence === 'number' && Number.isFinite(item.confidence)
      ? Math.max(0, Math.min(1, item.confidence))
      : 0.5;

    hypotheses.push({
      id: item.id as HypothesisId,
      title: typeof item.title === 'string' ? item.title : item.id,
      description: typeof item.description === 'string' ? item.description : '',
      supportingEvidence: toStringArray(item.supportingEvidence),
      contradictingEvidence: toStringArray(item.contradictingEvidence),
      confidence,
      status,
    });
  }

  if (hypotheses.length === 0) return null;

  return { assessment, hypotheses };
}

// Pure transport seam for offline testing without server-only
export async function requestAiInvestigation(
  input: AiInvestigationInput,
  apiKey: string | undefined,
  endpointOrBaseUrl: string = 'https://api.openai.com/v1',
  model: string = 'gpt-4o-mini',
  fetcher: typeof fetch = fetch,
  timeoutMs: number = 10000,
): Promise<AiExecutionResult> {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey) {
    return {
      status: 'AI_ANALYSIS_UNAVAILABLE',
      output: null,
      issue: 'AI API credentials are not configured in environment (set AI_API_KEY or OPENAI_API_KEY). Deterministic evidence, signals, and research heuristics are active.',
    };
  }

  const endpointUrl = normalizeAiEndpoint(endpointOrBaseUrl);

  try {
    const response = await fetcher(endpointUrl, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${trimmedKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(input) },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      return {
        status: 'FAILED',
        output: null,
        issue: `AI provider returned HTTP ${response.status}.`,
      };
    }

    const json: unknown = await response.json();
    if (!isRecord(json) || !Array.isArray(json.choices) || !json.choices[0] || !isRecord(json.choices[0])) {
      return {
        status: 'FAILED',
        output: null,
        issue: 'Malformed response structure from AI provider.',
      };
    }

    const message = json.choices[0].message;
    if (!isRecord(message) || typeof message.content !== 'string') {
      return {
        status: 'FAILED',
        output: null,
        issue: 'Empty content in AI provider response.',
      };
    }

    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(message.content);
    } catch {
      return {
        status: 'FAILED',
        output: null,
        issue: 'AI provider response did not contain valid JSON.',
      };
    }

    const output = parseAiOutput(parsedContent);
    if (!output) {
      return {
        status: 'FAILED',
        output: null,
        issue: 'AI response failed schema validation.',
      };
    }

    return {
      status: 'COMPLETED',
      output,
      issue: null,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {
      status: 'FAILED',
      output: null,
      issue: isTimeout
        ? 'AI provider request timed out (10s threshold reached). Falling back to deterministic investigation.'
        : 'AI provider request network error occurred. Falling back to deterministic investigation.',
    };
  }
}
