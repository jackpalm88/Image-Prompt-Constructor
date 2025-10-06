import React, { useState, useEffect } from 'react';
import { PromptData, ImageFile, Template } from '../types';
import { generateImage, fileToBase64, generateFullPromptIdea, remixPromptIdea } from '../services/geminiService';
import * as templatesStore from '../services/templatesStore';
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
    remixHint, setRemixHint
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [pinnedTemplates, setPinnedTemplates] = useState<Template[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [lastGeneratedSignature, setLastGeneratedSignature] = useState<string | null>(null);

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
    try {
      const compiledPrompt = `Subject: ${promptData.subject}. Action: ${promptData.action}. Environment: ${promptData.environment}. Style: ${promptData.style}. Lighting: ${promptData.lighting}. Camera: ${promptData.camera}.`;
      const imageUrl = await generateImage(promptData, subjectImage, environmentImage);
      setResultImage(imageUrl);
      
      const inputImages: string[] = [];
      if (subjectImage) inputImages.push(subjectImage.preview);
      if (environmentImage) inputImages.push(environmentImage.preview);

      addHistoryItem(imageUrl, compiledPrompt, inputImages.length > 0 ? inputImages : [], promptData);

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
    setNotification({ type: 'success', message: 'All fields have been cleared.' });
  };

  // A prompt is considered empty if it does not have at least one field with a non-empty string.
  const isPromptEmpty = !Object.values(promptData).some(val => val && typeof val === 'string' && val.trim() !== '');
  const isFormEmpty = isPromptEmpty && !subjectImage && !environmentImage;
  const inspireMeText = isPromptEmpty ? 'Inspire Me' : 'Remix Scene';
  const inspireMeTitle = isPromptEmpty ? 'Generate a new scene idea with AI' : 'Generate a variation of the current scene';
  const InspireIcon = isPromptEmpty ? LightbulbIcon : ShuffleIcon;

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
                    Generate Image
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
      <div className="bg-white/50 rounded-2xl flex flex-col justify-center p-4 min-h-[400px] lg:min-h-0 border border-black/5 shadow-lg-doma">
         {isGenerating ? <Spinner message="Generating with the model..."/> : (
            resultImage ? (
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
                     <div className="flex items-center p-3 rounded-lg bg-yellow-100/80 text-yellow-900 text-sm border border-yellow-300/50">
                        <WarningIcon className="h-5 w-5 mr-2 flex-shrink-0"/>
                        <span>Downloaded images may contain a SynthID watermark for identification.</span>
                    </div>
                  </div>
                </>
             ) : (
                <div className="flex-grow flex items-center justify-center text-center text-gray-500">
                    <p>Your generated image will appear here.</p>
                </div>
             )
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