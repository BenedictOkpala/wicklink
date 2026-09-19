import 'server-only';
import { requestAiInvestigation, type AiExecutionResult } from './request.ts';
import type { AiInvestigationInput } from './types.ts';

export async function runAiInvestigation(input: AiInvestigationInput): Promise<AiExecutionResult> {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  return requestAiInvestigation(input, apiKey, baseUrl, model, fetch);
}
