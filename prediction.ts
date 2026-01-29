export interface PredictionPrompt {
  subject: string;
  action: string;
  environment: string;
  style: string;
  lighting: string;
  camera: string;
}

export interface PredictionContext {
  hasSubjectReference?: boolean;
  hasEnvironmentReference?: boolean;
}

export interface PredictionWeights {
  bias: number;
  coverage: number;
  subjectQuality: number;
  actionQuality: number;
  environmentQuality: number;
  styleQuality: number;
  lightingQuality: number;
  cameraQuality: number;
  detailDensity: number;
  descriptiveVariance: number;
  thematicSynergy: number;
  punctuationSignal: number;
  referenceBoost: number;
  repetitionPenalty: number;
}

export const DEFAULT_PREDICTION_WEIGHTS: PredictionWeights = {
  bias: -1.1,
  coverage: 1.25,
  subjectQuality: 0.95,
  actionQuality: 0.8,
  environmentQuality: 0.9,
  styleQuality: 0.75,
  lightingQuality: 0.65,
  cameraQuality: 0.6,
  detailDensity: 1.05,
  descriptiveVariance: 0.55,
  thematicSynergy: 0.5,
  punctuationSignal: 0.35,
  referenceBoost: 0.3,
  repetitionPenalty: -0.45,
};

export interface PredictionEvaluation extends PredictionContext {
  prompt: PredictionPrompt;
  weights?: Partial<PredictionWeights>;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const logistic = (value: number) => 1 / (1 + Math.exp(-value));

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);

const wordCount = (value: string) => tokenize(value).length;

const measureQuality = (value: string, idealWordCount: number) => {
  if (!value.trim()) return 0;
  const count = wordCount(value);
  const normalized = clamp(count / idealWordCount, 0, 1);
  // Reward light over-delivery but decay after 1.5x ideal
  if (count > idealWordCount) {
    return clamp(normalized - Math.log10(count / idealWordCount) * 0.2, 0, 1);
  }
  return normalized;
};

const measureDetailDensity = (prompt: PredictionPrompt) => {
  const totalTokens = (
    tokenize(prompt.subject).length +
    tokenize(prompt.action).length +
    tokenize(prompt.environment).length +
    tokenize(prompt.style).length +
    tokenize(prompt.lighting).length +
    tokenize(prompt.camera).length
  );
  const ideal = 48; // Roughly 8 words per field
  return clamp(totalTokens / ideal, 0, 1);
};

const measureDescriptiveVariance = (prompt: PredictionPrompt) => {
  const buckets = [
    tokenize(prompt.subject),
    tokenize(prompt.action),
    tokenize(prompt.environment),
    tokenize(prompt.style),
    tokenize(prompt.lighting),
    tokenize(prompt.camera),
  ];
  const allTokens = buckets.flat();
  if (allTokens.length === 0) return 0;
  const unique = new Set(allTokens);
  return clamp(unique.size / allTokens.length, 0, 1);
};

const measureThematicSynergy = (prompt: PredictionPrompt) => {
  const buckets = [
    new Set(tokenize(prompt.subject)),
    new Set(tokenize(prompt.action)),
    new Set(tokenize(prompt.environment)),
    new Set(tokenize(prompt.style)),
    new Set(tokenize(prompt.lighting)),
    new Set(tokenize(prompt.camera)),
  ];

  const frequency = new Map<string, number>();
  buckets.forEach((bucket) => {
    bucket.forEach((token) => {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    });
  });

  const thematicTokens = Array.from(frequency.values()).filter((count) => count >= 2).length;
  const totalUnique = frequency.size || 1;
  return clamp(thematicTokens / totalUnique, 0, 1);
};

const measurePunctuationSignal = (prompt: PredictionPrompt) => {
  const text = [prompt.subject, prompt.action, prompt.environment, prompt.style, prompt.lighting, prompt.camera]
    .join(' ')
    .toLowerCase();
  const separators = [',', ';', 'with', 'featuring'];
  const hits = separators.reduce((count, separator) => (text.includes(separator) ? count + 1 : count), 0);
  return clamp(hits / separators.length, 0, 1);
};

const measureRepetitionPenalty = (prompt: PredictionPrompt) => {
  const tokens = tokenize(
    [prompt.subject, prompt.action, prompt.environment, prompt.style, prompt.lighting, prompt.camera].join(' '),
  );
  if (tokens.length === 0) return 0;
  const counts = new Map<string, number>();
  tokens.forEach((token) => {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  });
  const repeated = Array.from(counts.values()).filter((count) => count >= 3).length;
  return clamp(repeated / Math.max(tokens.length / 4, 1), 0, 1);
};

const computeCoverage = (prompt: PredictionPrompt) => {
  const fields = [prompt.subject, prompt.action, prompt.environment, prompt.style, prompt.lighting, prompt.camera];
  const filled = fields.filter((value) => value.trim().length > 0).length;
  return clamp(filled / fields.length, 0, 1);
};

export const computePredictionScore = ({
  prompt,
  hasSubjectReference,
  hasEnvironmentReference,
  weights: overrides,
}: PredictionEvaluation): number => {
  const weights: PredictionWeights = { ...DEFAULT_PREDICTION_WEIGHTS, ...overrides };

  const subjectQuality = measureQuality(prompt.subject, 8);
  const actionQuality = measureQuality(prompt.action, 8);
  const environmentQuality = measureQuality(prompt.environment, 14);
  const styleQuality = measureQuality(prompt.style, 8);
  const lightingQuality = measureQuality(prompt.lighting, 6);
  const cameraQuality = measureQuality(prompt.camera, 6);

  const detailDensity = measureDetailDensity(prompt);
  const descriptiveVariance = measureDescriptiveVariance(prompt);
  const thematicSynergy = measureThematicSynergy(prompt);
  const punctuationSignal = measurePunctuationSignal(prompt);
  const repetitionPenalty = measureRepetitionPenalty(prompt);
  const coverage = computeCoverage(prompt);
  const referenceBoost = clamp(
    (hasSubjectReference ? 0.6 : 0) + (hasEnvironmentReference ? 0.4 : 0),
    0,
    1,
  );

  const weightedSum =
    weights.bias +
    weights.coverage * coverage +
    weights.subjectQuality * subjectQuality +
    weights.actionQuality * actionQuality +
    weights.environmentQuality * environmentQuality +
    weights.styleQuality * styleQuality +
    weights.lightingQuality * lightingQuality +
    weights.cameraQuality * cameraQuality +
    weights.detailDensity * detailDensity +
    weights.descriptiveVariance * descriptiveVariance +
    weights.thematicSynergy * thematicSynergy +
    weights.punctuationSignal * punctuationSignal +
    weights.referenceBoost * referenceBoost +
    weights.repetitionPenalty * repetitionPenalty;

  const score = logistic(weightedSum);
  return Number(clamp(Number(score.toFixed(4)), 0, 1));
};

export type PredictionConfidence = 'green' | 'amber' | 'red';

export const classifyPrediction = (score: number): PredictionConfidence => {
  if (score >= 0.65) return 'green';
  if (score >= 0.4) return 'amber';
  return 'red';
};

export const describeConfidence = (score: number): 'Likely' | 'Uncertain' | 'At risk' => {
  if (score >= 0.65) return 'Likely';
  if (score >= 0.4) return 'Uncertain';
  return 'At risk';
};

export const computeFieldHash = (prompt: PredictionPrompt) => {
  const normalized = [
    prompt.subject.trim().toLowerCase(),
    prompt.action.trim().toLowerCase(),
    prompt.environment.trim().toLowerCase(),
    prompt.style.trim().toLowerCase(),
    prompt.lighting.trim().toLowerCase(),
    prompt.camera.trim().toLowerCase(),
  ].join('|');

  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized.charCodeAt(index);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Force 32bit int
  }
  return `p_${Math.abs(hash).toString(36)}`;
};

export interface PredictionSummary {
  score: number;
  confidence: PredictionConfidence;
  label: 'Likely' | 'Uncertain' | 'At risk';
}

export const summarizePrediction = (evaluation: PredictionEvaluation): PredictionSummary => {
  const score = computePredictionScore(evaluation);
  const confidence = classifyPrediction(score);
  const label = describeConfidence(score);
  return { score, confidence, label };
};
