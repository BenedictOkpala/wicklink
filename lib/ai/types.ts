import type { InvestigationEvidence, InvestigationHypothesis, InvestigationSignal, InvestigationAssessment } from '../investigation/types.ts';

export interface AiInvestigationInput {
  evidence: InvestigationEvidence;
  signals: InvestigationSignal[];
  hypotheses: InvestigationHypothesis[];
}

export interface AiInvestigationOutput {
  assessment: InvestigationAssessment;
  hypotheses: InvestigationHypothesis[];
}

export interface AiProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}
