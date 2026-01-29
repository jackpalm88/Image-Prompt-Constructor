import type { Request, Response, NextFunction } from 'express';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

const register = new Registry();
collectDefaultMetrics({ register });

const requestDurationHistogram = new Histogram({
  name: 'doma_request_latency_ms',
  help: 'Request latency in milliseconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [25, 50, 100, 200, 400, 800, 1200, 2000, 4000, 8000, 12000],
  registers: [register],
  unit: 'milliseconds',
});

const requestCounter = new Counter({
  name: 'doma_requests_total',
  help: 'Total API requests by status code',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const failureCounter = new Counter({
  name: 'doma_failures_total',
  help: 'Total failed API responses (>=500)',
  labelNames: ['route'],
  registers: [register],
});

const failRateGauge = new Gauge({
  name: 'doma_fail_rate',
  help: 'Rolling server-side failure rate',
  registers: [register],
});

const creditsPerSuccessGauge = new Gauge({
  name: 'doma_credits_per_success',
  help: 'Average credits spent per successful image generation',
  registers: [register],
});

const latencyP99Gauge = new Gauge({
  name: 'doma_latency_p99_ms',
  help: 'Observed p99 latency for API requests in milliseconds',
  registers: [register],
  unit: 'milliseconds',
});

let totalRequests = 0;
let totalFailures = 0;
let generationSuccessCount = 0;
let totalCreditsSpentOnSuccess = 0;
let lastSlackAlert = 0;
let currentLatencyP99 = 0;

const SLACK_ALERT_INTERVAL_MS = 5 * 60 * 1000;
const FAILURE_ALERT_THRESHOLD = Number(process.env.FAILURE_ALERT_THRESHOLD ?? 0.05);
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

const sanitizeRoute = (req: Request, res: Response) => {
  if (res.locals.metricsRoute) {
    return res.locals.metricsRoute as string;
  }
  const route = (req as unknown as { route?: { path?: string } }).route?.path;
  if (route) {
    return `${req.baseUrl || ''}${route}`;
  }
  const original = req.originalUrl ?? req.url ?? req.path;
  return original.split('?')[0] ?? original ?? 'unknown';
};

const maybeSendSlackAlert = async (failRate: number) => {
  if (!slackWebhookUrl || failRate < FAILURE_ALERT_THRESHOLD) {
    return;
  }
  const now = Date.now();
  if (now - lastSlackAlert < SLACK_ALERT_INTERVAL_MS) {
    return;
  }
  lastSlackAlert = now;
  try {
    await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:rotating_light: API failure rate is ${(failRate * 100).toFixed(2)}% in the last window. Investigate immediately.`,
      }),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to send Slack alert', error);
    }
  }
};

const updateFailRate = () => {
  const rate = totalRequests === 0 ? 0 : totalFailures / totalRequests;
  failRateGauge.set(rate);
  void maybeSendSlackAlert(rate);
};

const updateLatencyGauge = () => {
  const metric = requestDurationHistogram.get();
  const countMetric = metric.values.find(value => value.metricName === 'doma_request_latency_ms_count');
  const count = countMetric?.value ?? 0;
  if (!count) {
    latencyP99Gauge.set(0);
    return;
  }
  const target = count * 0.99;
  let candidate = 0;
  const buckets = metric.values
    .filter(value => value.metricName === 'doma_request_latency_ms_bucket')
    .sort((a, b) => {
      const aLe = a.labels.le === '+Inf' ? Number.POSITIVE_INFINITY : Number(a.labels.le);
      const bLe = b.labels.le === '+Inf' ? Number.POSITIVE_INFINITY : Number(b.labels.le);
      return aLe - bLe;
    });

  for (const bucket of buckets) {
    const boundary = bucket.labels.le === '+Inf' ? candidate : Number(bucket.labels.le);
    candidate = boundary;
    if (bucket.value >= target) {
      currentLatencyP99 = boundary;
      latencyP99Gauge.set(boundary);
      return;
    }
  }
  currentLatencyP99 = candidate;
  latencyP99Gauge.set(candidate);
};

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const route = sanitizeRoute(req, res);
    const status = res.statusCode;
    requestDurationHistogram.labels(req.method, route, String(status)).observe(durationMs);
    requestCounter.labels(req.method, route, String(status)).inc();
    totalRequests += 1;
    if (status >= 500) {
      totalFailures += 1;
      failureCounter.labels(route).inc();
    }
    updateFailRate();
    updateLatencyGauge();
  });
  next();
};

export const recordGenerationSuccess = (creditsSpent: number) => {
  generationSuccessCount += 1;
  totalCreditsSpentOnSuccess += creditsSpent;
  const average = generationSuccessCount > 0 ? totalCreditsSpentOnSuccess / generationSuccessCount : 0;
  creditsPerSuccessGauge.set(average);
};

export const getObservabilitySnapshot = () => ({
  creditsPerSuccess: generationSuccessCount > 0 ? totalCreditsSpentOnSuccess / generationSuccessCount : 0,
  failRate: totalRequests === 0 ? 0 : totalFailures / totalRequests,
  latencyP99: currentLatencyP99,
});

export const metricsHandler = async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
};
