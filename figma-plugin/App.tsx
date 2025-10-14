import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type { QualityBand } from '../pricing';
import type { PromptData, Template } from '../types';
import { ensureAuthSession } from '../services/auth';
import { previewCreditPrice, type CreditPreviewResult } from '../services/userService';
import { getTemplates, findTemplateBySignature } from '../services/templatesStore';
import {
  fetchFigmaStatus,
  importFigmaArtboard,
  requestFigmaOAuthUrl,
  sendImageToFigma,
  type FigmaConnectionStatus,
  type FigmaSendResult,
} from '../services/figmaService';

const EMPTY_PROMPT: PromptData = {
  subject: '',
  action: '',
  environment: '',
  style: '',
  lighting: '',
  camera: '',
};

const QUALITY_OPTIONS: { value: QualityBand; label: string }[] = [
  { value: 'economy', label: 'Economy' },
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
];

const toDataUrl = (image?: { base64: string; mimeType: string } | null) =>
  image ? `data:${image.mimeType};base64,${image.base64}` : null;

const FigmaPluginApp: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [promptData, setPromptData] = useState<PromptData>(EMPTY_PROMPT);
  const [qualityBand, setQualityBand] = useState<QualityBand>('standard');
  const [environmentImage, setEnvironmentImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [figmaStatus, setFigmaStatus] = useState<FigmaConnectionStatus | null>(null);
  const [figmaFileId, setFigmaFileId] = useState('');
  const [artboardId, setArtboardId] = useState('');
  const [artboardWidth, setArtboardWidth] = useState<string>('');
  const [artboardHeight, setArtboardHeight] = useState<string>('');
  const [creditPreview, setCreditPreview] = useState<CreditPreviewResult | null>(null);
  const [lastResult, setLastResult] = useState<FigmaSendResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [oauthState, setOauthState] = useState<string | null>(null);

  const environmentPreview = useMemo(() => toDataUrl(environmentImage), [environmentImage]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await fetchFigmaStatus();
      setFigmaStatus(status);
    } catch (error) {
      console.warn('Unable to refresh Figma status', error);
    }
  }, []);

  useEffect(() => {
    ensureAuthSession().catch(error => {
      console.error('Failed to ensure auth session', error);
      setErrorMessage('Unable to initialize authentication. Reload the plugin.');
    });
  }, []);

  useEffect(() => {
    getTemplates()
      .then(setTemplates)
      .catch(error => {
        console.error('Failed to load templates', error);
        setErrorMessage('Unable to load templates. Try refreshing.');
      });
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'figma-oauth-complete') {
        if (event.data.success) {
          setStatusMessage('Figma account connected successfully.');
          refreshStatus();
        } else if (event.data.error) {
          setErrorMessage(event.data.error as string);
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refreshStatus]);

  useEffect(() => {
    if (!promptData.subject && !promptData.action) {
      setCreditPreview(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      previewCreditPrice(promptData, qualityBand, {
        hasEnvironmentReference: Boolean(environmentImage),
      })
        .then(result => {
          if (!controller.signal.aborted) {
            setCreditPreview(result);
          }
        })
        .catch(error => {
          console.warn('Credit preview failed', error);
          if (!controller.signal.aborted) {
            setCreditPreview(null);
          }
        });
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [promptData, qualityBand, environmentImage]);

  const handleTemplateChange = async (signature: string) => {
    setSelectedTemplate(signature);
    if (!signature) {
      setPromptData(EMPTY_PROMPT);
      return;
    }

    const template = await findTemplateBySignature(signature);
    if (template) {
      const { subject, action, environment, style, lighting, camera } = template;
      setPromptData({ subject, action, environment, style, lighting, camera });
    }
  };

  const handlePromptChange = (field: keyof PromptData, value: string) => {
    setPromptData(prev => ({ ...prev, [field]: value }));
  };

  const handleEnvironmentUpload: React.ChangeEventHandler<HTMLInputElement> = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please choose an image file for the reference.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setEnvironmentImage({ base64, mimeType: file.type });
      setStatusMessage('Reference image attached from upload.');
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the selected file.');
    };
    reader.readAsDataURL(file);
  };

  const handleImportArtboard = async () => {
    if (!figmaFileId || !artboardId) {
      setErrorMessage('Provide both a Figma file ID and artboard node ID before importing.');
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    try {
      const artboard = await importFigmaArtboard({ fileId: figmaFileId.trim(), nodeId: artboardId.trim() });
      setEnvironmentImage({ base64: artboard.base64, mimeType: artboard.mimeType });
      if (artboard.width && !artboardWidth) {
        setArtboardWidth(Math.round(artboard.width).toString());
      }
      if (artboard.height && !artboardHeight) {
        setArtboardHeight(Math.round(artboard.height).toString());
      }
      setStatusMessage('Artboard imported as environment reference.');
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleConnectFigma = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    try {
      const { url, state } = await requestFigmaOAuthUrl();
      setOauthState(state);
      const popup = window.open(url, 'figma-oauth', 'width=520,height=680');
      if (!popup) {
        throw new Error('Popup blocked. Allow popups and try again.');
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsConnecting(false);
    }
  };

  const validateFigmaTarget = () => {
    if (!figmaStatus?.connected) {
      throw new Error('Connect your Figma account before sending.');
    }
    if (!figmaFileId || !artboardId) {
      throw new Error('Figma file ID and artboard node ID are required.');
    }
    const width = Number(artboardWidth);
    const height = Number(artboardHeight);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error('Provide valid artboard width and height in pixels.');
    }
    return { width, height };
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const { width, height } = validateFigmaTarget();
      const result = await sendImageToFigma({
        promptData,
        qualityBand,
        environmentImage,
        subjectImage: null,
        figma: {
          fileId: figmaFileId.trim(),
          artboardId: artboardId.trim(),
          artboardWidth: width,
          artboardHeight: height,
          name: promptData.subject || 'DOMA Image',
        },
      });

      setLastResult(result);
      setStatusMessage('Image generated and sent to Figma.');
      refreshStatus();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleResetReference = () => {
    setEnvironmentImage(null);
    setStatusMessage('Environment reference cleared.');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">D.O.M.A × Figma</h1>
          <button
            className="px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium disabled:bg-indigo-800/50"
            onClick={handleConnectFigma}
            disabled={isConnecting}
          >
            {figmaStatus?.connected ? 'Reconnect Figma' : 'Connect Figma'}
          </button>
        </header>

        {statusMessage && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/40 px-4 py-3 text-sm text-emerald-100">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/40 px-4 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        )}

        <section className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Template</label>
              <select
                value={selectedTemplate}
                onChange={event => handleTemplateChange(event.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">Custom prompt</option>
                {templates.map(template => (
                  <option key={template.signature} value={template.signature}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Quality</label>
              <select
                value={qualityBand}
                onChange={event => setQualityBand(event.target.value as QualityBand)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {QUALITY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(promptData) as (keyof PromptData)[]).map(field => (
              <label key={field} className="space-y-1 text-sm">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{field}</span>
                <textarea
                  value={promptData[field]}
                  onChange={event => handlePromptChange(field, event.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  rows={field === 'subject' ? 3 : 2}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Figma Target</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm space-y-1">
              <span className="block text-xs uppercase tracking-wide text-slate-400">File ID</span>
              <input
                value={figmaFileId}
                onChange={event => setFigmaFileId(event.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="e.g. AbCdEfGh123"
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="block text-xs uppercase tracking-wide text-slate-400">Artboard Node ID</span>
              <input
                value={artboardId}
                onChange={event => setArtboardId(event.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="e.g. 12:34"
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="block text-xs uppercase tracking-wide text-slate-400">Artboard Width (px)</span>
              <input
                value={artboardWidth}
                onChange={event => setArtboardWidth(event.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="e.g. 1024"
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="block text-xs uppercase tracking-wide text-slate-400">Artboard Height (px)</span>
              <input
                value={artboardHeight}
                onChange={event => setArtboardHeight(event.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="e.g. 768"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleImportArtboard}
              disabled={isImporting}
              className="px-4 py-2 rounded-md bg-slate-800 border border-slate-600 text-sm hover:bg-slate-700 disabled:opacity-50"
            >
              {isImporting ? 'Importing…' : 'Import artboard as reference'}
            </button>
            <label className="px-4 py-2 rounded-md bg-slate-800 border border-slate-600 text-sm hover:bg-slate-700 cursor-pointer">
              <span>Upload PNG reference</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleEnvironmentUpload} />
            </label>
            {environmentImage && (
              <button
                onClick={handleResetReference}
                className="px-4 py-2 rounded-md bg-slate-800 border border-slate-600 text-sm hover:bg-slate-700"
              >
                Clear reference
              </button>
            )}
          </div>

          {environmentPreview && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Environment reference</p>
              <img src={environmentPreview} alt="Environment reference" className="rounded-lg max-h-48 object-contain" />
            </div>
          )}
        </section>

        <section className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Smart credits</h2>
              {creditPreview ? (
                <p className="text-xs text-slate-400 mt-1">
                  {creditPreview.rounded} credits · {creditPreview.label} ({creditPreview.confidence})
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-1">Fill prompt details to estimate credit usage.</p>
              )}
            </div>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-5 py-2 rounded-md bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium disabled:bg-indigo-800/50"
            >
              {isGenerating ? 'Generating…' : 'Generate & Insert'}
            </button>
          </div>

          {lastResult && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-wide">
                <span>Last insert</span>
                <span>{new Date().toLocaleTimeString()}</span>
              </div>
              <p className="text-slate-200">Charged {lastResult.creditsCharged} credits · Prediction score {lastResult.predictionScore.toFixed(2)}</p>
              {lastResult.figma.url && (
                <a
                  href={lastResult.figma.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-300 hover:text-indigo-200 text-xs"
                >
                  Open in Figma ↗
                </a>
              )}
            </div>
          )}
        </section>

        <footer className="text-center text-[11px] text-slate-600">
          OAuth state: {oauthState ?? '—'}
        </footer>
      </div>
    </div>
  );
};

export default FigmaPluginApp;
