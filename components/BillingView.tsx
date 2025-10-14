import React, { useEffect, useMemo, useState } from 'react';
import type { UserProfile, WorkspaceBillingSummary } from '../types';
import {
  fetchBillingSummary,
  openBillingPortal,
  startCheckout,
  type BillingPlanDescriptor,
} from '../services/billingService';
import MiniSpinner from './MiniSpinner';

interface BillingViewProps {
  currentUser: UserProfile | null;
  onBillingUpdate?: (summary: WorkspaceBillingSummary) => void;
}

const formatStatus = (status: WorkspaceBillingSummary['status']) => {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
    case 'trialing':
      return { label: 'Trialing', tone: 'bg-sky-50 text-sky-700 border border-sky-200' };
    case 'past_due':
      return { label: 'Past Due', tone: 'bg-amber-50 text-amber-700 border border-amber-200' };
    case 'canceled':
      return { label: 'Canceled', tone: 'bg-gray-100 text-gray-600 border border-gray-200' };
    case 'incomplete':
      return { label: 'Incomplete', tone: 'bg-rose-50 text-rose-700 border border-rose-200' };
    default:
      return { label: 'Not Subscribed', tone: 'bg-gray-100 text-gray-600 border border-gray-200' };
  }
};

const formatRenewal = (summary: WorkspaceBillingSummary) => {
  if (!summary.renewalAt) {
    return 'Not scheduled';
  }
  const date = new Date(summary.renewalAt);
  return date.toLocaleString();
};

const BillingView: React.FC<BillingViewProps> = ({ currentUser, onBillingUpdate }) => {
  const [summary, setSummary] = useState<WorkspaceBillingSummary | null>(currentUser?.billing ?? null);
  const [plans, setPlans] = useState<BillingPlanDescriptor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [topUpQuantity, setTopUpQuantity] = useState(1);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchBillingSummary();
        setSummary(response.summary);
        setPlans(response.plans);
        onBillingUpdate?.(response.summary);
      } catch (err) {
        setError((err as Error).message ?? 'Failed to load billing summary');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [onBillingUpdate]);

  const activePlan = useMemo(() => summary?.plan ?? 'free', [summary?.plan]);
  const statusBadge = useMemo(() => (summary ? formatStatus(summary.status) : formatStatus('none')), [summary]);
  const observability = summary?.observability ?? { creditsPerSuccess: 0, failRate: 0, latencyP99: 0 };

  const handleCheckout = async (planId: 'pro' | 'topup') => {
    setIsProcessing(true);
    setError(null);
    try {
      const quantity = planId === 'topup' ? Math.max(1, Math.min(20, topUpQuantity)) : undefined;
      const url = await startCheckout(planId, quantity);
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to start checkout');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePortal = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const url = await openBillingPortal();
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to open billing portal');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-bold text-doma-dark-gray">Billing & Observability</h1>
          <p className="text-sm text-doma-dark-gray/70">
            Manage Stripe subscriptions, top up Smart Credits, and monitor reliability metrics.
          </p>
        </div>
        {summary && (
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${statusBadge.tone}`}>
              {formatStatus(summary.status).label}
            </div>
            <div className="px-4 py-2 rounded-lg bg-white shadow-sm border border-black/5 text-sm font-semibold">
              Plan · {summary.plan === 'pro' ? 'Pro' : 'Free'}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm flex items-center gap-2">
          <span>{error}</span>
          <button
            className="ml-auto text-xs font-semibold underline"
            onClick={() => {
              setError(null);
              void (async () => {
                setIsLoading(true);
                try {
                  const response = await fetchBillingSummary();
                  setSummary(response.summary);
                  setPlans(response.plans);
                  onBillingUpdate?.(response.summary);
                } catch (err) {
                  setError((err as Error).message ?? 'Failed to load billing summary');
                } finally {
                  setIsLoading(false);
                }
              })();
            }}
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-10 text-center text-doma-dark-gray flex flex-col items-center gap-3">
          <MiniSpinner />
          <p className="text-sm">Loading billing summary…</p>
        </div>
      ) : (
        <div className="space-y-10">
          <section className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
            <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <h2 className="text-sm font-semibold text-doma-dark-gray/70">Subscription status</h2>
              <p className="text-lg font-bold text-doma-dark-gray mt-2 capitalize">{activePlan}</p>
              <p className="text-xs text-doma-dark-gray/60 mt-1">Renews: {summary ? formatRenewal(summary) : '—'}</p>
            </div>
            <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <h2 className="text-sm font-semibold text-doma-dark-gray/70">Credits / Success</h2>
              <p className="text-lg font-bold text-doma-dark-gray mt-2">{observability.creditsPerSuccess.toFixed(2)}</p>
              <p className="text-xs text-doma-dark-gray/60 mt-1">Average credits per successful image</p>
            </div>
            <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <h2 className="text-sm font-semibold text-doma-dark-gray/70">Failure Rate</h2>
              <p className="text-lg font-bold text-doma-dark-gray mt-2">{(observability.failRate * 100).toFixed(2)}%</p>
              <p className="text-xs text-doma-dark-gray/60 mt-1">Server-side errors across recent requests</p>
            </div>
            <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <h2 className="text-sm font-semibold text-doma-dark-gray/70">P99 Latency</h2>
              <p className="text-lg font-bold text-doma-dark-gray mt-2">{observability.latencyP99.toFixed(0)} ms</p>
              <p className="text-xs text-doma-dark-gray/60 mt-1">Prometheus-reported p99 across API calls</p>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-doma-dark-gray">Available plans</h2>
              <button
                onClick={() => void handlePortal()}
                disabled={isProcessing}
                className="px-4 py-2 rounded-full bg-doma-dark-gray text-white text-sm font-semibold shadow hover:bg-doma-dark-gray/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Opening portal…' : 'Manage in Stripe Portal'}
              </button>
            </div>
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => {
                const isFreePlan = plan.id === 'free';
                const isCurrentPlan = plan.id === activePlan && plan.id !== 'topup';
                const disableFreeSelection = isFreePlan && activePlan === 'free';
                const buttonDisabled =
                  isProcessing || isCurrentPlan || disableFreeSelection;
                const buttonLabel = plan.id === 'topup'
                  ? `Buy ${plan.credits * Math.max(1, Math.min(20, topUpQuantity))} credits`
                  : isCurrentPlan
                  ? 'Current plan'
                  : isFreePlan
                  ? activePlan === 'free'
                    ? 'Included'
                    : 'Downgrade via portal'
                  : 'Subscribe with Stripe';

                const handlePlanSelection = () => {
                  if (buttonDisabled) {
                    return;
                  }
                  if (plan.id === 'topup') {
                    void handleCheckout('topup');
                    return;
                  }
                  if (plan.id === 'pro') {
                    void handleCheckout('pro');
                    return;
                  }
                  if (isFreePlan && activePlan !== 'free') {
                    void handlePortal();
                  }
                };

                return (
                  <div
                    key={plan.id}
                    className={`bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6 flex flex-col ${
                      plan.id === activePlan ? 'ring-2 ring-doma-yellow' : ''
                    }`}
                  >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-doma-dark-gray">{plan.name}</h3>
                      <p className="text-xs text-doma-dark-gray/60 mt-1">{plan.description}</p>
                    </div>
                    <span className="text-lg font-bold text-doma-dark-gray">
                      {plan.price === 0 ? 'Free' : `$${plan.price.toFixed(0)}`}
                      <span className="text-xs text-doma-dark-gray/60 font-normal">/{plan.interval === 'month' ? 'mo' : 'one-time'}</span>
                    </span>
                  </div>
                  <div className="mt-4 text-sm text-doma-dark-gray/80">
                    Includes <span className="font-semibold text-doma-dark-gray">{plan.credits}</span> credits
                    {plan.interval === 'month' ? ' per month.' : ' per purchase.'}
                  </div>
                  {plan.id === 'topup' ? (
                    <div className="mt-4 flex items-center gap-3">
                      <label className="text-xs font-semibold text-doma-dark-gray/70" htmlFor="topupQuantity">
                        Quantity
                      </label>
                      <input
                        id="topupQuantity"
                        type="number"
                        min={1}
                        max={20}
                        value={topUpQuantity}
                        onChange={(event) => setTopUpQuantity(Number(event.target.value))}
                        className="w-20 rounded-lg border border-black/10 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-doma-yellow"
                      />
                    </div>
                  ) : (
                    <div className="mt-4 text-xs text-doma-dark-gray/60">
                      Billing cycles renew automatically. Cancel anytime in the portal.
                    </div>
                  )}
                  <button
                    onClick={handlePlanSelection}
                    disabled={buttonDisabled}
                    className="mt-6 px-4 py-2 rounded-full bg-doma-yellow text-doma-dark-gray text-sm font-semibold shadow hover:bg-doma-yellow/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {buttonLabel}
                  </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default BillingView;
