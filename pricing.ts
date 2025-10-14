export type QualityBand = 'economy' | 'standard' | 'premium';

export interface SmartCreditConfig {
  base: number;
  epsilon: number;
  weightPrediction: number;
  qualityWeights: Record<QualityBand | string, number>;
  minPrice: number;
  maxPrice: number;
}

export const DEFAULT_SMART_CREDIT_CONFIG: SmartCreditConfig = {
  base: 1,
  epsilon: 0.05,
  weightPrediction: 1,
  qualityWeights: {
    economy: 0.8,
    standard: 1,
    premium: 1.35,
  },
  minPrice: 0.5,
  maxPrice: 2,
};

export const V2_SMART_CREDIT_CONFIG: SmartCreditConfig = {
  base: 1.2,
  epsilon: 0.035,
  weightPrediction: 1.15,
  qualityWeights: {
    economy: 0.75,
    standard: 1,
    premium: 1.5,
  },
  minPrice: 0.5,
  maxPrice: 2,
};

export const resolveConfigForVariant = (variant: 'v1' | 'v2'): SmartCreditConfig =>
  variant === 'v2' ? V2_SMART_CREDIT_CONFIG : DEFAULT_SMART_CREDIT_CONFIG;

export interface SmartCreditInput {
  predictionScore: number;
  qualityBand: QualityBand | string;
  base?: number;
  epsilon?: number;
  weightPrediction?: number;
  qualityWeights?: Record<QualityBand | string, number>;
  minPrice?: number;
  maxPrice?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const getQualityWeight = (
  band: QualityBand | string,
  weights: Record<string, number>,
  fallback = 1,
) => {
  const weight = weights[band];
  if (typeof weight === 'number' && Number.isFinite(weight)) {
    return weight;
  }
  return fallback;
};

export const calculateSmartCreditPrice = (
  {
    predictionScore,
    qualityBand,
    base,
    epsilon,
    weightPrediction,
    qualityWeights,
    minPrice,
    maxPrice,
  }: SmartCreditInput,
  config: SmartCreditConfig = DEFAULT_SMART_CREDIT_CONFIG,
): number => {
  const cfg = {
    ...config,
    base,
    epsilon,
    weightPrediction,
    qualityWeights,
    minPrice,
    maxPrice,
  } satisfies Partial<SmartCreditConfig> as SmartCreditConfig;

  const boundedScore = clamp(predictionScore, 0.01, 0.99);
  const qualityWeight = getQualityWeight(qualityBand, cfg.qualityWeights, cfg.qualityWeights.standard ?? 1);
  const rawPrice = cfg.base * (cfg.weightPrediction / (cfg.epsilon + boundedScore)) * qualityWeight;
  return Number(clamp(Number(rawPrice.toFixed(3)), cfg.minPrice, cfg.maxPrice).toFixed(2));
};

export const estimateCreditCharge = (input: SmartCreditInput, config?: SmartCreditConfig): number => {
  return calculateSmartCreditPrice(input, config);
};
