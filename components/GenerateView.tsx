import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PromptData, ImageFile, Template } from '../types';
import {
  generateImage,
  startBatchGeneration,
  fetchBatchJob,
  fileToBase64,
  generateFullPromptIdea,
  remixPromptIdea,
  type BatchJobSummary,
} from '../services/geminiService';
import * as templatesStore from '../services/templatesStore';
import type { TemplateVersionEntry } from '../services/templatesStore';
import Spinner from './Spinner';
import { DownloadIcon, WarningIcon, SaveIcon, LightbulbIcon, ShuffleIcon, DocumentAddIcon, TrashIcon, ThumbsUpIcon } from './icons';
import ImageViewer from './ImageViewer';
import { QUICK_SELECT_OPTIONS } from '../constants';
import StylePresetSelector from './StylePresetSelector';
import FieldPicker from './FieldPicker';
import { Notification } from '../App';
import MiniSpinner from './MiniSpinner';
import BulkImportModal from './BulkImportModal';
import QuickSaveTemplateModal from './QuickSaveTemplateModal';
import { calculateSmartCreditPrice, DEFAULT_SMART_CREDIT_CONFIG, type QualityBand } from '../pricing';
import { summarizePrediction, computeFieldHash, type PredictionSummary } from '../prediction';
import { previewCreditPrice, type CreditPreviewResult } from '../services/userService';
import PromptCoach from './PromptCoach';
import { evaluatePrompt, type CoachingAdvice } from '../services/coachingService';

interface GenerateViewProps {
  setNotification: (notification: Notification | null) => void;
  addHistoryItem: (resultImage: string, prompt: string, inputImages?: string[], promptData?: PromptData) => void;
  imageToLoad: { url: string; type: 'subject' | 'environment' } | null;
  onImageLoaded: () => void;
  onApplyTemplate: (template: PromptData) => void;
  openPromptsManager: (highlightId?: string) => void;
  
  // Hoisted State
  promptData: PromptData;
  setPromptData: (data: PromptData | ((prev: PromptData) => PromptData)) => void;
  resultImage: string | null;
  setResultImage: (image: string | null) => void;
  subjectImage: ImageFile | null;
  setSubjectImage: (image: ImageFile | null) => void;
  environmentImage: ImageFile | null;
  setEnvironmentImage: (image: ImageFile | null) => void;
  selectedPreset: string | null;
  setSelectedPreset: (preset: string | null) => void;
  lockedFields: Record<keyof PromptData, boolean>;
  setLockedFields: (fields: Record<keyof PromptData, boolean> | ((prev: Record<keyof PromptData, boolean>) => Record<keyof PromptData, boolean>)) => void;
  remixHint: string;
  setRemixHint: (hint: string) => void;
  userCredits: number | null;
  onCreditsUpdate: (credits: number) => void;
  billingVariant: 'v1' | 'v2';
}

const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
};

const GenerateView: React.FC<GenerateViewProps> = ({
    setNotification, addHistoryItem, imageToLoad, onImageLoaded, onApplyTemplate, openPromptsManager,
    promptData, setPromptData, resultImage, setResultImage,
    subjectImage, setSubjectImage, environmentImage, setEnvironmentImage,
    selectedPreset, setSelectedPreset, lockedFields, setLockedFields,
    remixHint, setRemixHint,
    userCredits,
    onCreditsUpdate,
    billingVariant,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [pinnedTemplates, setPinnedTemplates] = useState<Template[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [lastGeneratedSignature, setLastGeneratedSignature] = useState<string | null>(null);
  const [qualityBand, setQualityBand] = useState<QualityBand>('standard');
  const [coachingAdvice, setCoachingAdvice] = useState<CoachingAdvice | null>(null);
  const [isCoachingLoading, setIsCoachingLoading] = useState(false);
  const [coachingError, setCoachingError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<CreditPreviewResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [outputMode, setOutputMode] = useState<'single' | 'batch4' | 'batch8'>('single');
  const batchSize = useMemo(() => (outputMode === 'batch4' ? 4 : outputMode === 'batch8' ? 8 : 1), [outputMode]);
  const [activeBatchJob, setActiveBatchJob] = useState<BatchJobSummary | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [isPollingBatch, setIsPollingBatch] = useState(false);
  const [templateSignature, setTemplateSignature] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<TemplateVersionEntry[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [versionTooltip, setVersionTooltip] = useState<string | null>(null);
  const [lastCompletedJobId, setLastCompletedJobId] = useState<string | null>(null);
  const [rollbackSelection, setRollbackSelection] = useState<number | null>(null);

  const resolveTemplateSignature = useCallback(async (): Promise<string> => {
    if (templateSignature) {
      return templateSignature;
    }
    const signature = await templatesStore.computeSignature(promptData);
    setTemplateSignature(signature);
    return signature;
  }, [promptData, templateSignature]);

  const hasMeaningfulPrompt = useMemo(
    () => Object.values(promptData).some((val) => val && typeof val === 'string' && val.trim() !== ''),
    [promptData],
  );

  const predictionSummary = useMemo<PredictionSummary>(
    () =>
      summarizePrediction({
        prompt: promptData,
        hasSubjectReference: Boolean(subjectImage),
        hasEnvironmentReference: Boolean(environmentImage),
      }),
    [promptData, subjectImage, environmentImage],
  );

  const activeVariant = previewResult?.variant ?? billingVariant;
  const activeVariantConfig = useMemo(() => resolveConfigForVariant(activeVariant), [activeVariant]);

  const estimatedPrice = useMemo(
    () =>
      calculateSmartCreditPrice(
        {
          predictionScore: predictionSummary.score,
          qualityBand,
          base: activeVariantConfig.base,
        },
        activeVariantConfig,
      ),
    [predictionSummary.score, qualityBand, activeVariantConfig],
  );
  const estimatedCharge = useMemo(() => Math.max(1, Math.ceil(estimatedPrice)), [estimatedPrice]);

  const previewScore = previewResult?.predictionScore ?? predictionSummary.score;
  const previewConfidence = previewResult?.confidence ?? predictionSummary.confidence;
  const previewLabel = previewResult?.label ?? predictionSummary.label;
  const previewPrice = previewResult?.price ?? estimatedPrice;
  const previewCharge = previewResult?.rounded ?? estimatedCharge;
  const fieldHash = useMemo(
    () =>
      computeFieldHash({
        subject: promptData.subject,
        action: promptData.action,
        environment: promptData.environment,
        style: promptData.style,
        lighting: promptData.lighting,
        camera: promptData.camera,
      }),
    [promptData],
  );
  const previewPercentage = Math.round(previewScore * 100);
  const isHighRisk = previewScore < 0.4;
  const confidenceStyle = useMemo(() => {
    switch (previewConfidence) {
      case 'green':
        return { text: 'text-emerald-600', badge: 'bg-emerald-50 border border-emerald-200' };
      case 'amber':
        return { text: 'text-amber-600', badge: 'bg-amber-50 border border-amber-200' };
      default:
        return { text: 'text-red-600', badge: 'bg-red-50 border border-red-200' };
    }
  }, [previewConfidence]);

  useEffect(() => {
    const refreshPinnedTemplates = async () => {
        setPinnedTemplates(await templatesStore.getPinnedTemplates());
    };

    const handleStorageUpdate = (event: StorageEvent) => {
        if (event.key === 'doma-image-studio-templates') {
            refreshPinnedTemplates();
        }
    };
    
    refreshPinnedTemplates(); // Initial load

    window.addEventListener('doma:templates-updated', refreshPinnedTemplates as EventListener);
    window.addEventListener('storage', handleStorageUpdate);

    return () => {
        window.removeEventListener('doma:templates-updated', refreshPinnedTemplates as EventListener);
        window.removeEventListener('storage', handleStorageUpdate);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSignatureAndVersions = async () => {
      try {
        const signature = await templatesStore.computeSignature(promptData);
        if (cancelled) return;
        setTemplateSignature(signature);
        const versions = await templatesStore.getTemplateVersions(signature);
        if (cancelled) return;
        setVersionHistory(versions);
        const current = await templatesStore.getCurrentTemplateVersion(signature);
        if (cancelled) return;
        const resolvedVersion = current?.version ?? (versions.length ? versions[versions.length - 1].version : null);
        setCurrentVersion(resolvedVersion);
        setRollbackSelection(resolvedVersion);
      } catch (error) {
        console.error('Failed to compute template signature', error);
      }
    };

    loadSignatureAndVersions();

    return () => {
      cancelled = true;
    };
  }, [promptData]);

  useEffect(() => {
    const loadImage = async () => {
        if (imageToLoad) {
            const { url, type } = imageToLoad;
            const file = await dataUrlToFile(url, `${type}-${Date.now()}.png`);
            const base64 = await fileToBase64(file);
            const imageFile: ImageFile = { file, preview: url, base64 };
            
            if (type === 'subject') {
                if(subjectImage) URL.revokeObjectURL(subjectImage.preview);
                setSubjectImage(imageFile);
            } else {
                if(environmentImage) URL.revokeObjectURL(environmentImage.preview);
                setEnvironmentImage(imageFile);
            }
            setNotification({ type: 'success', message: `Image loaded as ${type} reference.` });
            onImageLoaded();
        }
    }
    loadImage();
  }, [imageToLoad, onImageLoaded]);

  useEffect(() => {
    if (!hasMeaningfulPrompt) {
      setPreviewResult(null);
      setPreviewError(null);
      setIsPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setIsPreviewLoading(true);
    setPreviewError(null);

    const timer = setTimeout(() => {
      previewCreditPrice(promptData, qualityBand, {
        base: DEFAULT_SMART_CREDIT_CONFIG.base,
        hasSubjectReference: Boolean(subjectImage),
        hasEnvironmentReference: Boolean(environmentImage),
      })
        .then((result) => {
          if (cancelled) return;
          setPreviewResult(result);
          setIsPreviewLoading(false);
        })
        .catch((error) => {
          if (cancelled) return;
          setPreviewError((error as Error).message ?? 'Unable to preview credits');
          setIsPreviewLoading(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [promptData, qualityBand, subjectImage, environmentImage, hasMeaningfulPrompt]);

  useEffect(() => {
    if (!activeBatchJob) {
      setIsPollingBatch(false);
      return;
    }

    if (activeBatchJob.status === 'succeeded' || activeBatchJob.status === 'failed') {
      setIsPollingBatch(false);
      return;
    }

    setIsPollingBatch(true);

    const timer = setTimeout(async () => {
      try {
        const next = await fetchBatchJob(activeBatchJob.id);
        setActiveBatchJob(next);
        if (typeof next.remainingCredits === 'number') {
          onCreditsUpdate(next.remainingCredits);
        }
      } catch (error) {
        console.error(error);
        setNotification({ type: 'error', message: (error as Error).message });
        setIsGenerating(false);
        setIsPollingBatch(false);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [activeBatchJob, onCreditsUpdate, setNotification]);

  useEffect(() => {
    if (!activeBatchJob) {
      return;
    }

    if (activeBatchJob.status === 'succeeded' && lastCompletedJobId !== activeBatchJob.id) {
      setIsGenerating(false);
      setLastCompletedJobId(activeBatchJob.id);

      const successes = activeBatchJob.results.filter((result) => result.status === 'succeeded');
      const failures = activeBatchJob.results.filter((result) => result.status === 'failed');

      if (successes.length > 0 && selectedVariant === null) {
        const first = successes[0];
        if (first.imageUrl) {
          setResultImage(first.imageUrl);
          setSelectedVariant(first.slot);
        }
      }

      if (typeof activeBatchJob.remainingCredits === 'number') {
        onCreditsUpdate(activeBatchJob.remainingCredits);
      }

      if (templateSignature) {
        setLastGeneratedSignature(templateSignature);
      }

      setNotification({
        type: 'success',
        message: `Batch completed with ${successes.length} success${successes.length === 1 ? '' : 'es'}${
          failures.length ? ` (${failures.length} refunded)` : ''
        }.`,
      });
    }

    if (activeBatchJob.status === 'failed' && lastCompletedJobId !== activeBatchJob.id) {
      setIsGenerating(false);
      setLastCompletedJobId(activeBatchJob.id);
      setNotification({ type: 'error', message: 'Batch generation failed. Any spent credits were refunded.' });
    }
  }, [activeBatchJob, lastCompletedJobId, onCreditsUpdate, selectedVariant, setNotification, templateSignature]);

  useEffect(() => {
    if (!hasMeaningfulPrompt) {
      setCoachingAdvice(null);
      setCoachingError(null);
      setIsCoachingLoading(false);
      return;
    }

    let active = true;
    setIsCoachingLoading(true);
    setCoachingError(null);

    evaluatePrompt(promptData)
      .then((advice) => {
        if (!active) return;
        setCoachingAdvice(advice);
        setIsCoachingLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setCoachingAdvice(null);
        setCoachingError((error as Error).message ?? 'Unable to fetch coaching');
        setIsCoachingLoading(false);
      });

    return () => {
      active = false;
    };
  }, [promptData, hasMeaningfulPrompt]);

  const handleChange = (name: keyof PromptData, value: string) => {
    setPromptData(prev => ({ ...prev, [name]: value }));
    setSelectedPreset(null);
  };

  const handleToggleLock = (fieldName: keyof PromptData) => {
    setLockedFields(prev => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  const handlePresetSelect = async (template: Template) => {
      onApplyTemplate(template);
      await templatesStore.applyTemplate(template.signature);
  };
  
  const handleSaveAsTemplate = () => {
    setShowSaveModal(true);
  };
  
  const handleUnpinTemplate = async (templateId: string) => {
      await templatesStore.updateTemplate(templateId, { pinned: false });
      setNotification({ type: 'success', message: 'Template unpinned from Quick Access.' });
  }

  const handleImprovePrompt = useCallback(() => {
    if (!coachingAdvice) {
      setNotification({ type: 'error', message: 'Coaching feedback is not ready yet.' });
      return;
    }

    const improved = coachingAdvice.improvedPrompt;
    if (!improved) {
      setNotification({ type: 'error', message: 'No suggestions available to apply yet.' });
      return;
    }

    let updated = false;
    setPromptData((prev) => {
      const next = { ...prev };
      (Object.keys(prev) as (keyof PromptData)[]).forEach((key) => {
        if (lockedFields[key]) return;
        const candidate = improved[key];
        if (typeof candidate === 'string' && candidate.trim() && candidate !== prev[key]) {
          next[key] = candidate;
          updated = true;
        }
      });
      return next;
    });

    if (updated) {
      setNotification({ type: 'success', message: 'Prompt fields updated with coaching suggestions.' });
    } else {
      setNotification({
        type: 'error',
        message: 'No coaching suggestions applied (fields may be locked or already updated).',
      });
    }
  }, [coachingAdvice, lockedFields, setNotification, setPromptData]);

  const handleBulkImport = async (newTemplates: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>[]) => {
    let addedCount = 0;

    for (const t of newTemplates) {
      const { status } = await templatesStore.upsertTemplate(t);
      if (status === 'created') {
        addedCount++;
      }
    }

    if (addedCount > 0) {
        let message = `${addedCount} new template${addedCount > 1 ? 's' : ''} imported successfully!`;
        if (addedCount < newTemplates.length) {
            message += ` ${newTemplates.length - addedCount} were duplicates and were updated/merged.`
        }
        setNotification({ type: 'success', message });
    } else {
        setNotification({ type: 'success', message: 'All imported templates were duplicates of existing ones. Their metadata may have been updated.' });
    }
};

  const handleSubjectImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(subjectImage) URL.revokeObjectURL(subjectImage.preview);
      const base64 = await fileToBase64(file);
      setSubjectImage({
        file,
        preview: URL.createObjectURL(file),
        base64,
      });
    }
  };

  const handleClearSubjectImage = () => {
    if (subjectImage) {
        URL.revokeObjectURL(subjectImage.preview);
        setSubjectImage(null);
    }
  };
  
  const handleEnvironmentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(environmentImage) URL.revokeObjectURL(environmentImage.preview);
      const base64 = await fileToBase64(file);
      setEnvironmentImage({
        file,
        preview: URL.createObjectURL(file),
        base64,
      });
    }
  };

  const handleClearEnvironmentImage = () => {
    if (environmentImage) {
        URL.revokeObjectURL(environmentImage.preview);
        setEnvironmentImage(null);
    }
  };
  
  const handleInspireMe = async () => {
      setIsGeneratingIdea(true);
      setNotification(null);
      // Check if prompt is empty based on current state at time of click.
      const isCurrentlyEmpty = !Object.values(promptData).some(val => val && typeof val === 'string' && val.trim() !== '');
      try {
          let newPromptData: PromptData;
          if (isCurrentlyEmpty) {
              newPromptData = await generateFullPromptIdea(subjectImage, environmentImage);
              setLockedFields(prev => Object.keys(prev).reduce((acc, key) => ({...acc, [key]: false}), {} as Record<keyof PromptData, boolean>));
              setNotification({ type: 'success', message: 'New idea generated!' });
          } else {
              newPromptData = await remixPromptIdea(promptData, lockedFields, remixHint);
              setNotification({ type: 'success', message: 'Scene remixed successfully!' });
              setRemixHint('');
          }
          
          const finalPromptData = { ...newPromptData };
          (Object.keys(lockedFields) as Array<keyof PromptData>).forEach(key => {
              if (lockedFields[key]) {
                  finalPromptData[key] = promptData[key];
              }
          });

          setPromptData(finalPromptData);
          setSelectedPreset(null);
      } catch (err) {
          setNotification({ type: 'error', message: (err as Error).message });
      } finally {
          setIsGeneratingIdea(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const allFieldsFilled = Object.values(promptData).every(val => val && typeof val === 'string' && val.trim() !== '');
    if (!allFieldsFilled) {
        setNotification({type: 'error', message: 'All prompt fields must be filled before generating.'});
        return;
    }

    setIsGenerating(true);
    setNotification(null);
    setResultImage(null);
    setLastGeneratedSignature(null);
    setActiveBatchJob(null);
    setSelectedVariant(null);
    setVersionTooltip(null);
    setLastCompletedJobId(null);

    if (batchSize > 1) {
      try {
        const job = await startBatchGeneration(promptData, subjectImage, environmentImage, {
          qualityBand,
          base: DEFAULT_SMART_CREDIT_CONFIG.base,
          batchSize: batchSize as 4 | 8,
          fieldHash,
        });
        setActiveBatchJob(job);
        setPreviewResult({
          price: job.pricePerImage,
          rounded: job.creditsPerImage,
          predictionScore: job.predictionScore ?? predictionSummary.score,
          confidence: job.confidence ?? predictionSummary.confidence,
          label: job.label ?? predictionSummary.label,
          variant: job.pricingVariant,
        });
        if (typeof job.remainingCredits === 'number') {
          onCreditsUpdate(job.remainingCredits);
        }
        setNotification({
          type: 'success',
          message: `Batch request queued: ${job.batchSize} variants at ${job.creditsPerImage} credits each.`,
        });
      } catch (err) {
        setIsGenerating(false);
        setNotification({ type: 'error', message: (err as Error).message });
      }
      return;
    }

    try {
      const response = await generateImage(promptData, subjectImage, environmentImage, {
        qualityBand,
        base: DEFAULT_SMART_CREDIT_CONFIG.base,
        fieldHash,
      });
      setResultImage(response.imageUrl);

      const inputImages: string[] = [];
      if (subjectImage) inputImages.push(subjectImage.preview);
      if (environmentImage) inputImages.push(environmentImage.preview);

      addHistoryItem(response.imageUrl, response.prompt, inputImages.length > 0 ? inputImages : [], promptData);

      onCreditsUpdate(response.remainingCredits);
      setNotification({
        type: 'success',
        message: `Image generated for ${response.creditsCharged} credits (smart price ${response.price.toFixed(2)} — ${response.label}).`,
      });

      setPreviewResult({
        price: response.price,
        rounded: response.creditsCharged,
        predictionScore: response.predictionScore,
        confidence: response.confidence,
        label: response.label,
        variant: response.variant,
      });

      const signature = await templatesStore.computeSignature(promptData);
      setLastGeneratedSignature(signature);

    } catch (err) {
      setNotification({ type: 'error', message: (err as Error).message });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `doma-generated-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGoodResult = async () => {
    if (!lastGeneratedSignature) return;
    try {
        await templatesStore.recordSuccess(lastGeneratedSignature);
        setNotification({ type: 'success', message: 'Thanks for the feedback! Success recorded.' });
        setLastGeneratedSignature(null); // Prevent multiple clicks
    } catch (err) {
        setNotification({ type: 'error', message: (err as Error).message });
    }
  };

  const handlePromoteVariant = async () => {
    try {
      const signature = await resolveTemplateSignature();
      const variantImage =
        activeBatchJob && selectedVariant !== null
          ? activeBatchJob.results.find((result) => result.slot === selectedVariant)?.imageUrl
          : resultImage;

      if (!variantImage) {
        setNotification({ type: 'error', message: 'Select a variant to promote before saving a version.' });
        return;
      }

      const { previousVersion, entry } = await templatesStore.promoteTemplateVersion(signature, {
        imageUrl: variantImage,
        promptData,
        jobId: activeBatchJob?.id,
        slot: selectedVariant ?? undefined,
      });

      const versions = await templatesStore.getTemplateVersions(signature);
      setVersionHistory(versions);
      setCurrentVersion(entry.version);
      setRollbackSelection(entry.version);
      setVersionTooltip(`v${previousVersion ?? 0} → v${entry.version}`);
      setNotification({ type: 'success', message: `Promoted to version v${entry.version}.` });
    } catch (error) {
      setNotification({ type: 'error', message: (error as Error).message ?? 'Failed to promote version.' });
    }
  };

  const handleRollbackVersion = async () => {
    if (rollbackSelection === null) {
      setNotification({ type: 'error', message: 'Select a saved version to rollback to.' });
      return;
    }

    try {
      const signature = await resolveTemplateSignature();
      const entry = await templatesStore.rollbackTemplateVersion(signature, rollbackSelection);
      if (!entry || !entry.imageUrl) {
        setNotification({ type: 'error', message: 'Unable to rollback to the selected version.' });
        return;
      }

      setResultImage(entry.imageUrl);
      setSelectedVariant(null);
      setCurrentVersion(entry.version);
      setVersionTooltip(`Rolled back to v${entry.version}`);

      const versions = await templatesStore.getTemplateVersions(signature);
      setVersionHistory(versions);
      setNotification({ type: 'success', message: `Rolled back to version v${entry.version}.` });
    } catch (error) {
      setNotification({ type: 'error', message: (error as Error).message ?? 'Failed to rollback version.' });
    }
  };

  const handleSelectVariant = (slot: number, imageUrl?: string | null) => {
    if (!imageUrl) {
      setNotification({ type: 'error', message: 'Variant image is still processing.' });
      return;
    }
    setSelectedVariant(slot);
    setResultImage(imageUrl);
    setVersionTooltip(null);
  };

  const handleClearFields = () => {
    setPromptData({
      subject: '', action: '', environment: '',
      style: '', lighting: '', camera: '',
    });
    handleClearSubjectImage();
    handleClearEnvironmentImage();
    setSelectedPreset(null);
    setLockedFields({
      subject: false, action: false, environment: false,
      style: false, lighting: false, camera: false,
    });
    setRemixHint('');
    setResultImage(null);
    setLastGeneratedSignature(null);
    setActiveBatchJob(null);
    setSelectedVariant(null);
    setVersionTooltip(null);
    setVersionHistory([]);
    setCurrentVersion(null);
    setRollbackSelection(null);
    setLastCompletedJobId(null);
    setNotification({ type: 'success', message: 'All fields have been cleared.' });
  };

  // A prompt is considered empty if it does not have at least one field with a non-empty string.
  const isPromptEmpty = !Object.values(promptData).some(val => val && typeof val === 'string' && val.trim() !== '');
  const isFormEmpty = isPromptEmpty && !subjectImage && !environmentImage;
  const inspireMeText = isPromptEmpty ? 'Inspire Me' : 'Remix Scene';
  const inspireMeTitle = isPromptEmpty ? 'Generate a new scene idea with AI' : 'Generate a variation of the current scene';
  const InspireIcon = isPromptEmpty ? LightbulbIcon : ShuffleIcon;
  const outputModeOptions: Array<{ id: 'single' | 'batch4' | 'batch8'; label: string }> = [
    { id: 'single', label: 'Single' },
    { id: 'batch4', label: 'Batch x4' },
    { id: 'batch8', label: 'Batch x8' },
  ];
  const generateButtonLabel = batchSize === 1 ? 'Generate Image' : `Generate ${batchSize} Variants`;
  const batchTotalCharge = batchSize > 1 ? previewCharge * batchSize : previewCharge;

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-4 md:p-8 h-full">
      <div className="flex flex-col space-y-6 bg-white/50 p-4 sm:p-6 rounded-2xl shadow-lg-doma border border-black/5">
        <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-3xl font-medium text-doma-green flex-shrink-0">Scene Composer</h2>
            <div className="flex items-center gap-2 flex-grow justify-end flex-wrap">
                {!isPromptEmpty && (
                    <input
                        type="text"
                        value={remixHint}
                        onChange={(e) => setRemixHint(e.target.value)}
                        placeholder="Add a hint, e.g., 'make it winter'"
                        className="w-full max-w-xs text-sm border-gray-300 rounded-full shadow-inner-soft px-3 py-2 focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green transition-all duration-300 disabled:opacity-50"
                        disabled={isGenerating || isGeneratingIdea}
                    />
                )}
                <button
                    type="button"
                    onClick={() => setIsBulkImportOpen(true)}
                    disabled={isGenerating || isGeneratingIdea}
                    className="flex items-center space-x-2 text-sm bg-white border border-doma-green hover:bg-doma-green/10 text-doma-green font-semibold py-2 px-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex-shrink-0"
                    title="Bulk import prompts to create templates"
                    >
                    <DocumentAddIcon className="h-5 w-5 text-doma-green" />
                    <span>Bulk Import</span>
                </button>
                <div className="flex items-center bg-white border border-doma-green/40 rounded-full px-1 py-1 shadow-inner-soft">
                  {outputModeOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setOutputMode(option.id)}
                      disabled={isGenerating || isGeneratingIdea}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        outputMode === option.id
                          ? 'bg-doma-green text-white shadow'
                          : 'text-doma-green hover:bg-doma-green/10'
                      } ${isGenerating || isGeneratingIdea ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                type="button"
                onClick={handleInspireMe}
                disabled={isGenerating || isGeneratingIdea}
                className="flex items-center space-x-2 text-sm bg-white border border-doma-yellow hover:bg-doma-yellow/10 text-doma-green font-semibold py-2 px-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex-shrink-0"
                title={inspireMeTitle}
                >
                {isGeneratingIdea ? (
                    <MiniSpinner />
                ) : (
                    <InspireIcon className="h-5 w-5 text-doma-yellow" />
                )}
                <span>{inspireMeText}</span>
                </button>
            </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 mb-6">
          <div className="bg-white border border-black/5 rounded-2xl p-4 shadow-inner-soft">
            <p className="text-xs uppercase tracking-wide text-gray-500">Remaining credits</p>
            <p className="text-2xl font-semibold text-doma-dark-gray">{typeof userCredits === 'number' ? userCredits : '—'}</p>
          </div>
          <div className="bg-white border border-black/5 rounded-2xl p-4 shadow-inner-soft">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Quality band</p>
            <div className="flex gap-2">
              {(['economy', 'standard', 'premium'] as QualityBand[]).map(band => (
                <button
                  key={band}
                  type="button"
                  onClick={() => setQualityBand(band)}
                  className={`flex-1 px-3 py-2 rounded-full text-sm font-semibold transition-colors border ${
                    qualityBand === band
                      ? 'bg-doma-green text-white border-doma-green'
                      : 'bg-white text-doma-dark-gray border-black/10 hover:bg-doma-green/10'
                  }`}
                >
                  {band.charAt(0).toUpperCase() + band.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white border border-black/5 rounded-2xl p-4 shadow-inner-soft">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Success outlook</p>
                <p className={`text-xl font-semibold ${confidenceStyle.text}`}>{previewLabel}</p>
                <p className="text-xs text-gray-500">{previewPercentage}% predicted success</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-semibold ${confidenceStyle.badge} ${confidenceStyle.text}`}>
                {previewConfidence === 'green' ? 'Green' : previewConfidence === 'amber' ? 'Amber' : 'Red'}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
              <span>Smart price</span>
              {isPreviewLoading ? (
                <MiniSpinner />
              ) : (
                <span className="font-semibold text-doma-dark-gray">{previewPrice.toFixed(2)} credits</span>
              )}
            </div>
            <p className="text-xs text-gray-500 text-right">
              {batchSize > 1 ? (
                <>
                  {previewCharge} credits each · <span className="font-semibold text-doma-dark-gray">{batchTotalCharge}</span> total
                </>
              ) : (
              <>Charged {previewCharge} credits</>
              )}
            </p>
            <p className="text-[11px] text-gray-400 text-right">Pricing variant · <span className="font-semibold uppercase">{activeVariant}</span></p>
            {previewError && (
              <p className="mt-2 text-xs text-doma-red font-semibold">{previewError}</p>
            )}
            {hasMeaningfulPrompt && isHighRisk && !previewError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/70 p-2 text-xs text-red-600">
                <WarningIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Prediction is below 40%. Improve the prompt to reduce the chance of wasting credits.</span>
              </div>
            )}
          </div>
        </div>
        <PromptCoach
          advice={coachingAdvice}
          loading={isCoachingLoading}
          error={coachingError}
          onImprove={handleImprovePrompt}
          disabled={isGenerating || isGeneratingIdea}
          label={previewLabel}
          confidence={previewConfidence}
          score={previewScore}
        />
        <form onSubmit={handleSubmit} className="space-y-4">
            <StylePresetSelector 
                templates={pinnedTemplates}
                onSelect={handlePresetSelect}
                onUnpin={handleUnpinTemplate}
                selectedPreset={selectedPreset}
            />
            <div className="border-t border-gray-200 !mt-6 pt-4">
                <p className="text-sm font-medium text-gray-600 mb-2">{subjectImage || environmentImage ? 'Use the fields below to describe the scene. Your uploaded image(s) will be used as a visual reference.' : 'Customize the fields below, or upload an image as a reference:'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="md:col-span-1 space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Optional Subject Image</label>
                    {subjectImage ? (
                        <div className="relative w-full h-24 bg-white rounded-xl flex items-center justify-center border border-gray-300 shadow-inner-soft">
                            <img src={subjectImage.preview} alt="Subject preview" className="max-h-full max-w-full object-contain rounded-md p-1" />
                            <button onClick={handleClearSubjectImage} type="button" className="absolute top-1 right-1 bg-red-600/80 text-white rounded-full h-5 w-5 flex items-center justify-center font-bold text-xs leading-none">&times;</button>
                        </div>
                    ) : (
                        <label className="w-full h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center relative bg-white/50 hover:border-doma-green transition-colors cursor-pointer">
                            <span className="text-sm text-gray-500">Upload Image</span>
                            <input type="file" onChange={handleSubjectImageUpload} accept="image/*" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"/>
                        </label>
                    )}
                </div>
                <div className="md:col-span-2">
                    <FieldPicker label="Subject Description" name="subject" value={promptData.subject} onChange={handleChange} placeholder="e.g., A robot holding a red skateboard." promptContext={promptData} setNotification={setNotification} initialOptions={QUICK_SELECT_OPTIONS.subject} isLocked={lockedFields.subject} onToggleLock={handleToggleLock} />
                </div>
            </div>

            <FieldPicker label="Action" name="action" value={promptData.action} onChange={handleChange} placeholder="e.g., cruising down a futuristic city street." promptContext={promptData} setNotification={setNotification} initialOptions={QUICK_SELECT_OPTIONS.action} isLocked={lockedFields.action} onToggleLock={handleToggleLock} />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="md:col-span-2">
                    <FieldPicker label="Environment / Background" name="environment" value={promptData.environment} onChange={handleChange} placeholder="e.g., neon-lit skyscrapers, flying vehicles." isTextarea promptContext={promptData} setNotification={setNotification} initialOptions={QUICK_SELECT_OPTIONS.environment} isLocked={lockedFields.environment} onToggleLock={handleToggleLock} />
                </div>
                <div className="md:col-span-1 space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Optional Env. Ref Image</label>
                    {environmentImage ? (
                        <div className="relative w-full h-full min-h-24 bg-white rounded-xl flex items-center justify-center border border-gray-300 shadow-inner-soft">
                            <img src={environmentImage.preview} alt="Environment preview" className="max-h-full max-w-full object-contain rounded-md p-1" />
                            <button onClick={handleClearEnvironmentImage} type="button" className="absolute top-1 right-1 bg-red-600/80 text-white rounded-full h-5 w-5 flex items-center justify-center font-bold text-xs leading-none">&times;</button>
                        </div>
                    ) : (
                        <label className="w-full h-full min-h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center relative bg-white/50 hover:border-doma-green transition-colors cursor-pointer">
                            <span className="text-sm text-gray-500">Upload Image</span>
                            <input type="file" onChange={handleEnvironmentImageUpload} accept="image/*" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"/>
                        </label>
                    )}
                </div>
            </div>

            <FieldPicker label="Style" name="style" value={promptData.style} onChange={handleChange} placeholder="e.g., hyperrealistic, 8k, digital art." promptContext={promptData} setNotification={setNotification} initialOptions={QUICK_SELECT_OPTIONS.style} isLocked={lockedFields.style} onToggleLock={handleToggleLock} />
            <FieldPicker label="Lighting" name="lighting" value={promptData.lighting} onChange={handleChange} placeholder="e.g., dramatic backlighting, lens flare." promptContext={promptData} setNotification={setNotification} initialOptions={QUICK_SELECT_OPTIONS.lighting} isLocked={lockedFields.lighting} onToggleLock={handleToggleLock} />
            <FieldPicker label="Camera / Angle" name="camera" value={promptData.camera} onChange={handleChange} placeholder="e.g., wide-angle lens, low-angle shot." promptContext={promptData} setNotification={setNotification} initialOptions={QUICK_SELECT_OPTIONS.camera} isLocked={lockedFields.camera} onToggleLock={handleToggleLock} />
             <div className="flex items-center space-x-2 !mt-6">
                <button type="submit" disabled={isGenerating || isGeneratingIdea} className="flex-grow bg-doma-green hover:bg-opacity-90 text-white font-bold py-3 px-4 rounded-xl transition duration-300 shadow-lg-doma disabled:opacity-50 disabled:cursor-not-allowed">
                    {generateButtonLabel}
                </button>
                <button type="button" onClick={handleClearFields} disabled={isGenerating || isGeneratingIdea || isFormEmpty} title="Clear all fields and images" className="flex items-center gap-2 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-doma-dark-gray font-bold rounded-xl transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                    <TrashIcon className="h-5 w-5" />
                    <span>Clear</span>
                </button>
                <button type="button" onClick={handleSaveAsTemplate} disabled={isGenerating || isGeneratingIdea || isPromptEmpty} title="Save current fields as a new template" className="flex items-center gap-2 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-doma-dark-gray font-bold rounded-xl transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                    <SaveIcon className="h-5 w-5" />
                    <span>Save</span>
                </button>
            </div>
        </form>
      </div>
      <div className="bg-white/50 rounded-2xl flex flex-col p-4 min-h-[400px] lg:min-h-0 border border-black/5 shadow-lg-doma">
        {activeBatchJob ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-doma-dark-gray">Batch {activeBatchJob.batchSize} variants</p>
                <p className="text-xs text-gray-500">
                  {activeBatchJob.results.filter((r) => r.status === 'succeeded').length} ready ·{' '}
                  {activeBatchJob.results.filter((r) => r.status === 'running').length} running ·{' '}
                  {activeBatchJob.results.filter((r) => r.status === 'queued').length} queued
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Pricing variant ·{' '}
                  <span className="font-semibold uppercase">
                    {activeBatchJob.pricingVariant ?? activeVariant}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isPollingBatch && <MiniSpinner />}
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${
                    activeBatchJob.status === 'succeeded'
                      ? 'bg-emerald-100 text-emerald-700'
                      : activeBatchJob.status === 'failed'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {activeBatchJob.status}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 flex-grow overflow-y-auto pb-2">
              {activeBatchJob.results.map((result) => {
                const isSelected = selectedVariant === result.slot && result.status === 'succeeded';
                return (
                  <button
                    key={result.slot}
                    type="button"
                    onClick={() => handleSelectVariant(result.slot, result.imageUrl)}
                    disabled={result.status !== 'succeeded'}
                    className={`relative rounded-xl border ${
                      isSelected ? 'border-doma-green ring-2 ring-doma-green/40' : 'border-black/10'
                    } overflow-hidden h-36 flex items-center justify-center bg-white shadow-inner-soft transition-transform hover:scale-[1.01] disabled:cursor-not-allowed`}
                  >
                    {result.status === 'succeeded' && result.imageUrl ? (
                      <img src={result.imageUrl} alt={`Variant ${result.slot + 1}`} className="h-full w-full object-cover" />
                    ) : result.status === 'failed' ? (
                      <span className="text-xs text-red-600 font-semibold">Failed — refunded</span>
                    ) : result.status === 'running' ? (
                      <div className="flex flex-col items-center text-xs text-gray-500">
                        <MiniSpinner />
                        <span className="mt-1">Generating…</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Queued</span>
                    )}
                    <span className="absolute top-2 left-2 text-xs font-semibold text-white bg-black/60 rounded-full px-2 py-0.5">
                      #{result.slot + 1}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePromoteVariant}
                  disabled={isGenerating || (!resultImage && !activeBatchJob.results.some((r) => r.status === 'succeeded'))}
                  className="flex items-center gap-2 bg-doma-green hover:bg-opacity-90 text-white text-sm font-semibold px-4 py-2 rounded-full shadow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <SaveIcon className="h-4 w-4" />
                  <span>Promote to Final</span>
                </button>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {versionTooltip && <span className="px-2 py-1 rounded-full bg-doma-yellow/20 text-doma-dark-gray">{versionTooltip}</span>}
                  {currentVersion && (
                    <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600" title={`Active version v${currentVersion}`}>
                      Active v{currentVersion}
                    </span>
                  )}
                </div>
              </div>
              {versionHistory.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <label className="font-semibold" htmlFor="version-select">Version history</label>
                  <select
                    id="version-select"
                    value={rollbackSelection ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRollbackSelection(value ? Number(value) : null);
                    }}
                    className="border border-gray-300 rounded-full px-3 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-doma-green/40"
                  >
                    {versionHistory.map((entry) => (
                      <option key={entry.version} value={entry.version}>
                        v{entry.version} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleRollbackVersion}
                    className="px-3 py-1 rounded-full border border-doma-green text-doma-green hover:bg-doma-green/10 font-semibold"
                  >
                    Rollback
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : isGenerating ? (
          <div className="flex flex-col items-center justify-center flex-grow">
            <Spinner message="Generating with the model..." />
          </div>
        ) : resultImage ? (
          <>
            <div className="flex-grow w-full relative">
              <ImageViewer src={resultImage} alt="Generated result" />
            </div>
            <div className="flex-shrink-0 flex flex-col items-center space-y-3 pt-4">
              <div className="flex space-x-4">
                <button onClick={handleDownload} className="flex items-center space-x-2 bg-doma-green hover:bg-opacity-90 text-white font-bold py-2 px-4 rounded-xl transition duration-300 shadow-md">
                  <DownloadIcon className="h-5 w-5" />
                  <span>Download</span>
                </button>
                {lastGeneratedSignature && (
                  <button
                    onClick={handleGoodResult}
                    className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-xl transition duration-300 shadow-md"
                    title="Mark this generation as a successful result for the prompt"
                  >
                    <ThumbsUpIcon className="h-5 w-5" />
                    <span>Good Result</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePromoteVariant}
                  className="flex items-center gap-2 bg-doma-green/90 hover:bg-doma-green text-white text-sm font-semibold px-4 py-2 rounded-full shadow"
                >
                  <SaveIcon className="h-4 w-4" />
                  <span>Promote version</span>
                </button>
                {versionTooltip && (
                  <span className="text-xs text-gray-500 bg-doma-yellow/20 px-2 py-1 rounded-full">{versionTooltip}</span>
                )}
              </div>
              {versionHistory.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <label className="font-semibold" htmlFor="version-select-inline">Version history</label>
                  <select
                    id="version-select-inline"
                    value={rollbackSelection ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRollbackSelection(value ? Number(value) : null);
                    }}
                    className="border border-gray-300 rounded-full px-3 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-doma-green/40"
                  >
                    {versionHistory.map((entry) => (
                      <option key={entry.version} value={entry.version}>
                        v{entry.version} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleRollbackVersion}
                    className="px-3 py-1 rounded-full border border-doma-green text-doma-green hover:bg-doma-green/10 font-semibold"
                  >
                    Rollback
                  </button>
                </div>
              )}
              <div className="flex items-center p-3 rounded-lg bg-yellow-100/80 text-yellow-900 text-sm border border-yellow-300/50">
                <WarningIcon className="h-5 w-5 mr-2 flex-shrink-0" />
                <span>Downloaded images may contain a SynthID watermark for identification.</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-grow flex items-center justify-center text-center text-gray-500">
            <p>Your generated image will appear here.</p>
          </div>
        )}
      </div>
    </div>
    {isBulkImportOpen && (
        <BulkImportModal
            onClose={() => setIsBulkImportOpen(false)}
            onImport={handleBulkImport}
            setNotification={setNotification}
        />
    )}
    {showSaveModal && (
        <QuickSaveTemplateModal
          promptData={promptData}
          thumbnail={resultImage}
          onClose={()=>setShowSaveModal(false)}
          onSaved={(id, status)=>{
            setNotification({ 
                type: 'success', 
                message: status === 'updated' 
                    ? 'Existing template updated with new metadata/tags.' 
                    : 'Template saved successfully!',
                action: {
                    label: 'Open Manager',
                    onClick: () => openPromptsManager(id),
                }
            });
          }}
        />
    )}
    </>
  );
};

export default GenerateView;