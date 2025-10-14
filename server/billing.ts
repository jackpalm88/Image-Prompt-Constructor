import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';

import type { WorkspaceBillingSummary } from '../types';
import { addCredits } from './credits';
import { getObservabilitySnapshot } from './observability';
import { getPricingVariant } from './featureFlags';
import {
  appendAuditLog,
  getWorkspaceBillingFallbackUser,
  getWorkspaceRecord,
  recordBillingEvent,
  updateWorkspaceBilling,
} from './storage';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2024-11-20',
    })
  : null;

const ensureStripe = () => {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }
  return stripe;
};

const successUrl = process.env.STRIPE_SUCCESS_URL ?? 'https://doma.app/billing/success';
const cancelUrl = process.env.STRIPE_CANCEL_URL ?? 'https://doma.app/billing/cancel';
const proPriceId = process.env.STRIPE_PRICE_PRO_MONTHLY;
const topupPriceId = process.env.STRIPE_PRICE_CREDITS_TOPUP;
const topupCredits = Number(process.env.TOPUP_CREDIT_QUANTITY ?? 100);

const billingPlanSummary = (workspaceId: string, overrides?: Partial<WorkspaceBillingSummary>): WorkspaceBillingSummary => ({
  plan: overrides?.plan ?? 'free',
  status: overrides?.status ?? 'none',
  renewalAt: overrides?.renewalAt ?? null,
  stripeCustomerId: overrides?.stripeCustomerId,
  stripeSubscriptionId: overrides?.stripeSubscriptionId,
  abVariant: overrides?.abVariant ?? 'v1',
  observability: overrides?.observability ?? {
    creditsPerSuccess: 0,
    failRate: 0,
    latencyP99: 0,
  },
});

const mapSubscriptionStatus = (status: Stripe.Subscription.Status): WorkspaceBillingSummary['status'] => {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'incomplete':
    case 'incomplete_expired':
      return 'incomplete';
    case 'canceled':
      return 'canceled';
    default:
      return 'active';
  }
};

const resolveCustomer = async (
  workspaceId: string,
  userId: string,
  customerEmail?: string | null,
) => {
  const stripeClient = ensureStripe();
  const workspace = await getWorkspaceRecord(workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  if (workspace.stripeCustomerId) {
    return workspace.stripeCustomerId;
  }
  const customer = await stripeClient.customers.create({
    email: customerEmail ?? undefined,
    metadata: { workspaceId },
  });
  await updateWorkspaceBilling(workspaceId, { stripeCustomerId: customer.id });
  await appendAuditLog(workspaceId, userId, 'billing-customer-created', { customerId: customer.id });
  await recordBillingEvent(workspaceId, 'customer_created', { customerId: customer.id });
  return customer.id;
};

export const createCheckoutSession = async (
  workspaceId: string,
  userId: string,
  plan: 'pro' | 'topup',
  options: { quantity?: number; email?: string | null } = {},
) => {
  const stripeClient = ensureStripe();
  const workspace = await getWorkspaceRecord(workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  const customerId = await resolveCustomer(workspaceId, userId, options.email);
  const pricingVariant = await getPricingVariant(workspaceId);
  await updateWorkspaceBilling(workspaceId, { pricingVariant });

  if (plan === 'pro' && !proPriceId) {
    throw new Error('Stripe Pro price is not configured');
  }
  if (plan === 'topup' && !topupPriceId) {
    throw new Error('Stripe top-up price is not configured');
  }

  const metadata = {
    workspaceId,
    initiatorUserId: userId,
    plan,
    pricingVariant,
  } satisfies Record<string, string>;

  if (plan === 'topup') {
    metadata.topupCredits = String(options.quantity ?? 1);
  }

  const session = await stripeClient.checkout.sessions.create({
    customer: customerId,
    mode: plan === 'pro' ? 'subscription' : 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items:
      plan === 'pro'
        ? [
            {
              price: proPriceId!,
              quantity: 1,
            },
          ]
        : [
            {
              price: topupPriceId!,
              quantity: options.quantity ?? 1,
            },
          ],
    allow_promotion_codes: true,
    subscription_data:
      plan === 'pro'
        ? {
            metadata,
          }
        : undefined,
    metadata,
  });

  await recordBillingEvent(workspaceId, 'checkout_created', { plan, sessionId: session.id });
  await appendAuditLog(workspaceId, userId, 'billing-checkout-started', { plan, sessionId: session.id });

  return session.url;
};

export const createBillingPortalSession = async (
  workspaceId: string,
  userId: string,
) => {
  const stripeClient = ensureStripe();
  const workspace = await getWorkspaceRecord(workspaceId);
  if (!workspace?.stripeCustomerId) {
    throw new Error('No Stripe customer found for workspace');
  }
  const session = await stripeClient.billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: process.env.STRIPE_PORTAL_RETURN_URL ?? successUrl,
  });
  await appendAuditLog(workspaceId, userId, 'billing-portal', { sessionId: session.id });
  await recordBillingEvent(workspaceId, 'billing_portal_opened', { sessionId: session.id });
  return session.url;
};

const getRenewalDate = (timestamp?: number | null) =>
  timestamp ? new Date(timestamp * 1000) : null;

const handleSubscriptionEvent = async (subscription: Stripe.Subscription) => {
  const workspaceId = subscription.metadata?.workspaceId;
  if (!workspaceId) {
    return;
  }
  const status = mapSubscriptionStatus(subscription.status);
  await updateWorkspaceBilling(workspaceId, {
    plan: subscription.status === 'canceled' ? 'free' : 'pro',
    billingStatus: status,
    stripeSubscriptionId: subscription.status === 'canceled' ? null : subscription.id,
    renewalAt: getRenewalDate(subscription.current_period_end),
  });
  await recordBillingEvent(workspaceId, 'subscription_event', {
    status,
    subscriptionId: subscription.id,
  });
};

const handleCheckoutSessionCompleted = async (session: Stripe.Checkout.Session) => {
  const workspaceId = session.metadata?.workspaceId;
  if (!workspaceId) {
    return;
  }
  const initiatorUserId = session.metadata?.initiatorUserId ?? null;
  await updateWorkspaceBilling(workspaceId, {
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : undefined,
  });
  if (session.mode === 'subscription') {
    await appendAuditLog(workspaceId, initiatorUserId, 'billing-subscribe', {
      sessionId: session.id,
      pricingVariant: session.metadata?.pricingVariant,
    });
  } else if (session.mode === 'payment') {
    const units = Number(session.metadata?.topupCredits ?? 1);
    const credits = Math.max(1, units) * topupCredits;
    const creditRecipient = initiatorUserId ?? (await getWorkspaceBillingFallbackUser(workspaceId));
    if (creditRecipient) {
      await addCredits(workspaceId, creditRecipient, credits, 'billing-topup', {
        sessionId: session.id,
        initiatedBy: initiatorUserId ?? 'stripe_webhook',
      });
    } else {
      await recordBillingEvent(workspaceId, 'topup_missing_recipient', {
        sessionId: session.id,
        credits,
      });
    }
    await appendAuditLog(workspaceId, initiatorUserId ?? creditRecipient, 'billing-topup', {
      sessionId: session.id,
      credits,
      creditedUserId: creditRecipient,
      initiatedBy: initiatorUserId,
    });
  }
  await recordBillingEvent(workspaceId, 'checkout_completed', {
    mode: session.mode,
    sessionId: session.id,
  });
};

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const stripeWebhookHandler = async (req: Request, res: Response) => {
  const stripeClient = ensureStripe();
  const signature = req.headers['stripe-signature'];
  if (!signature || !stripeWebhookSecret) {
    res.status(400).send('Missing Stripe webhook configuration');
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
  } catch (error) {
    res.status(400).send(`Webhook Error: ${(error as Error).message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
          await handleSubscriptionEvent(subscription);
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (error) {
    res.status(500).send(`Webhook handler failed: ${(error as Error).message}`);
  }
};

export const getBillingSummary = async (workspaceId: string): Promise<WorkspaceBillingSummary> => {
  const workspace = await getWorkspaceRecord(workspaceId);
  if (!workspace) {
    return billingPlanSummary(workspaceId);
  }
  const observability = getObservabilitySnapshot();
  return {
    plan: workspace.plan,
    status: workspace.billingStatus,
    renewalAt: workspace.renewalAt?.toISOString() ?? null,
    stripeCustomerId: workspace.stripeCustomerId ?? undefined,
    stripeSubscriptionId: workspace.stripeSubscriptionId ?? undefined,
    abVariant: workspace.pricingVariant,
    observability,
  } satisfies WorkspaceBillingSummary;
};

export const checkoutSchema = z.object({
  plan: z.enum(['pro', 'topup']),
  quantity: z.number().int().positive().max(20).optional(),
});
