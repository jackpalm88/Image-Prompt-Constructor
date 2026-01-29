import { Buffer } from 'node:buffer';

export type AnalyticsEventName = 'generate_success' | 'coaching_used' | 'credits_spent';

export interface AnalyticsEventPayload {
  event: AnalyticsEventName;
  userId: string;
  workspaceId: string;
  properties?: Record<string, unknown>;
}

const mixpanelToken = process.env.MIXPANEL_TOKEN;
const amplitudeApiKey = process.env.AMPLITUDE_API_KEY;

const trackMixpanel = async (payload: AnalyticsEventPayload) => {
  if (!mixpanelToken) {
    return;
  }

  const properties = {
    token: mixpanelToken,
    time: Date.now(),
    distinct_id: payload.userId,
    workspace_id: payload.workspaceId,
    ...payload.properties,
  } satisfies Record<string, unknown>;

  const body = Buffer.from(JSON.stringify([{ event: payload.event, properties }])).toString('base64');

  try {
    await fetch('https://api.mixpanel.com/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${body}`,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to send Mixpanel event', error);
    }
  }
};

const trackAmplitude = async (payload: AnalyticsEventPayload) => {
  if (!amplitudeApiKey) {
    return;
  }

  const eventBody = {
    api_key: amplitudeApiKey,
    events: [
      {
        user_id: payload.userId,
        event_type: payload.event,
        event_properties: {
          workspace_id: payload.workspaceId,
          ...payload.properties,
        },
      },
    ],
  } satisfies Record<string, unknown>;

  try {
    await fetch('https://api2.amplitude.com/2/httpapi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to send Amplitude event', error);
    }
  }
};

export const trackEvent = async (payload: AnalyticsEventPayload) => {
  const tasks: Array<Promise<void>> = [];
  tasks.push(trackMixpanel(payload));
  tasks.push(trackAmplitude(payload));
  await Promise.allSettled(tasks);
};
