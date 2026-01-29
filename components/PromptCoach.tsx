import React from 'react';

import { LightbulbIcon, WarningIcon, SparklesIcon } from './icons';
import MiniSpinner from './MiniSpinner';
import type { CoachingAdvice } from '../services/coachingService';

interface PromptCoachProps {
  advice: CoachingAdvice | null;
  loading: boolean;
  error: string | null;
  onImprove: () => void;
  disabled?: boolean;
  label: string;
  confidence: 'green' | 'amber' | 'red';
  score: number;
}

const stateStyles: Record<PromptCoachProps['confidence'], { border: string; accent: string; pill: string }> = {
  green: {
    border: 'border-emerald-200',
    accent: 'text-emerald-600',
    pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  amber: {
    border: 'border-amber-200',
    accent: 'text-amber-600',
    pill: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  red: {
    border: 'border-red-200',
    accent: 'text-red-600',
    pill: 'bg-red-50 text-red-700 border border-red-200',
  },
};

const PromptCoach: React.FC<PromptCoachProps> = ({
  advice,
  loading,
  error,
  onImprove,
  disabled = false,
  label,
  confidence,
  score,
}) => {
  const styles = stateStyles[confidence];
  const summary = advice?.summary ?? `${label} chance of success. Fine-tune details to increase confidence.`;
  const suggestions = advice?.suggestions ?? [];
  const warnings = advice?.warnings ?? [];
  const percent = Math.max(0, Math.min(100, Math.round(score * 100)));

  return (
    <div className={`mt-4 rounded-2xl border ${styles.border} bg-white shadow-inner-soft`}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md ${styles.accent}`}>
            <LightbulbIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-doma-dark-gray">Prompt Coach</p>
              <span className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${styles.pill}`}>
                {label}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-600">
              {loading ? 'Analysing your prompt…' : summary}
            </p>
            <div className="mt-3 h-1.5 w-full rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full ${confidence === 'green' ? 'bg-emerald-400' : confidence === 'amber' ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">Success prediction {percent}%</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onImprove}
          disabled={disabled || loading || !advice}
          className="flex items-center gap-2 self-end rounded-full border border-doma-green bg-white px-4 py-2 text-sm font-semibold text-doma-green transition hover:bg-doma-green/10 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
        >
          <SparklesIcon className="h-4 w-4" />
          Improve prompt
        </button>
      </div>
      {error && (
        <div className="border-t border-red-100 bg-red-50/70 px-4 py-3 text-xs text-red-600">
          <div className="flex items-start gap-2">
            <WarningIcon className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center px-4 pb-4">
          <MiniSpinner />
        </div>
      ) : (
        <div className="space-y-3 px-4 pb-4">
          <div>
            <p className="text-xs font-semibold text-gray-600">Suggestions</p>
            {suggestions.length ? (
              <ul className="mt-1 space-y-1 text-sm text-doma-dark-gray">
                {suggestions.map((tip, index) => (
                  <li key={index} className="flex items-start gap-2 rounded-lg bg-doma-cream/60 px-3 py-2 text-sm">
                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-doma-green" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-gray-500">You&apos;re in great shape. Tweak styling or camera for nuance.</p>
            )}
          </div>
          {warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50/80 p-3 text-sm text-yellow-800">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <WarningIcon className="h-4 w-4" />
                Watch outs
              </div>
              <ul className="space-y-1 text-xs">
                {warnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PromptCoach;
