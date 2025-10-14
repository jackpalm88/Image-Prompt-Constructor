import type { WorkspaceBillingSummary } from '../types';
import { authorizedFetch } from './auth';

export interface BillingPlanDescriptor {
  id: 'free' | 'pro' | 'topup';
  name: string;
  price: number;
  interval: 'month' | 'one-time';
  credits: number;
  description: string;
}

export interface BillingSummaryResponse {
  summary: WorkspaceBillingSummary;
  plans: BillingPlanDescriptor[];
}

export const fetchBillingSummary = async (): Promise<BillingSummaryResponse> => {
  const response = await authorizedFetch('/api/billing/summary');
  if (!response.ok) {
    throw new Error('Unable to load billing summary');
  }
  return (await response.json()) as BillingSummaryResponse;
};

export const startCheckout = async (plan: 'pro' | 'topup', quantity?: number): Promise<string> => {
  const response = await authorizedFetch('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, quantity }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? 'Failed to start checkout');
  }
  const payload = (await response.json()) as { url: string };
  return payload.url;
};

export const openBillingPortal = async (): Promise<string> => {
  const response = await authorizedFetch('/api/billing/portal', { method: 'POST' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? 'Unable to open billing portal');
  }
  const payload = (await response.json()) as { url: string };
  return payload.url;
};
