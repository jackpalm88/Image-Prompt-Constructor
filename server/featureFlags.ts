import { getClient, PollingMode, type IConfigCatClient } from 'configcat-node';

const sdkKey = process.env.CONFIGCAT_SDK_KEY;
const fallbackVariant = process.env.DEFAULT_PRICING_VARIANT === 'v2' ? 'v2' : 'v1';
let client: IConfigCatClient | null = null;

if (sdkKey) {
  client = getClient(sdkKey, {
    pollMode: PollingMode.LazyLoad,
    pollIntervalSeconds: 60,
  });
}

const normalizeVariant = (variant: string | undefined | null) =>
  variant === 'v2' ? 'v2' : 'v1';

export const getPricingVariant = async (workspaceId: string) => {
  if (client) {
    try {
      const result = await client.getValueAsync('v1_vs_v2_pricing', fallbackVariant, {
        identifier: workspaceId,
      });
      return normalizeVariant(result);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('ConfigCat pricing flag failed, falling back to defaults', error);
      }
    }
  }

  const unleashVariant = process.env.UNLEASH_PRICING_VARIANT;
  if (unleashVariant) {
    return normalizeVariant(unleashVariant);
  }

  return fallbackVariant;
};

export const disposeFeatureFlagClient = async () => {
  await client?.dispose();
};
