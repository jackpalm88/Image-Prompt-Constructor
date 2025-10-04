

import React, { useState, useEffect } from 'react';
import { Tab, HistoryItem, PromptData, ImageFile, Template } from './types';
import { TABS } from './constants';
import GenerateView from './components/GenerateView';
import EditView from './components/EditView';
import ComposeView from './components/ComposeView';
import HistoryView from './components/HistoryView';
import PromptsManager from './components/PromptsManager';
import { SparklesIcon, BrushIcon, ComposeIcon, HistoryIcon, PromptsIcon } from './components/icons';
import { DomaLogo } from './components/Logo';

export type Notification = {
  type: 'success' | 'error';
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  }
}

const defaultPrompt: PromptData = {
    subject: '', action: '', environment: '',
    style: '', lighting: '', camera: '',
};

const initialLockedFields: Record<keyof PromptData, boolean> = {
    subject: false, action: false, environment: false,
    style: false, lighting: false, camera: false,
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.Generate);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [isPromptsManagerOpen, setIsPromptsManagerOpen] = useState(false);
  const [highlightedTemplateId, setHighlightedTemplateId] = useState<string | undefined>();
  
  // State for loading from history/other tabs
  const [imageToEdit, setImageToEdit] = useState<string | null>(null);
  const [imageToGenerate, setImageToGenerate] = useState<{ url: string; type: 'subject' | 'environment' } | null>(null);

  // Hoisted state for GenerateView
  const [promptData, setPromptData] = useState<PromptData>(defaultPrompt);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [subjectImage, setSubjectImage] = useState<ImageFile | null>(null);
  const [environmentImage, setEnvironmentImage] = useState<ImageFile | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [lockedFields, setLockedFields] = useState<Record<keyof PromptData, boolean>>(initialLockedFields);
  const [remixHint, setRemixHint] = useState('');


  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const addHistoryItem = (resultImage: string, prompt: string, inputImages: string[] = [], promptData?: PromptData) => {
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      type: activeTab,
      prompt,
      resultImage,
      inputImages,
      timestamp: Date.now(),
      promptData,
    };
    setHistory(prev => [newItem, ...prev]);
  };

  const loadPromptData = (promptDataToLoad: PromptData, presetName?: string) => {
    const { subject, action, environment, style, lighting, camera } = promptDataToLoad;
    setPromptData({ subject, action, environment, style, lighting, camera });
    
    // Reset other related state for a clean slate
    setResultImage(null);
    setSubjectImage(null);
    setEnvironmentImage(null);
    setSelectedPreset(presetName || null);
    setLockedFields(initialLockedFields);
    setRemixHint('');
  };

  const handleUsePromptFromHistory = (promptDataToLoad: PromptData) => {
    loadPromptData(promptDataToLoad);
    setActiveTab(Tab.Generate);
    setNotification({ type: 'success', message: 'Prompt loaded from history!' });
  };

  const handleApplyTemplate = (template: PromptData) => {
    loadPromptData(template, (template as Template).name || undefined);
    setActiveTab(Tab.Generate);
    setNotification({ type: 'success', message: `Template "${(template as Template).name}" applied!`});
  };

  const handleLoadImageForEdit = (imageUrl: string) => {
    setImageToEdit(imageUrl);
    setActiveTab(Tab.Edit);
  };
  
  const handleLoadImageForGenerate = (imageUrl: string, type: 'subject' | 'environment') => {
    setImageToGenerate({ url: imageUrl, type });
    setActiveTab(Tab.Generate);
  };

  const openPromptsManager = (highlightId?: string) => {
    setIsPromptsManagerOpen(true);
    setHighlightedTemplateId(highlightId);
  };

  const closePromptsManager = () => {
    setIsPromptsManagerOpen(false);
    setHighlightedTemplateId(undefined);
  };

  const getIconForTab = (tabId: Tab) => {
    switch(tabId) {
        case Tab.Generate: return <SparklesIcon className="h-5 w-5 mr-2" />;
        case Tab.Edit: return <BrushIcon className="h-5 w-5 mr-2" />;
        case Tab.Compose: return <ComposeIcon className="h-5 w-5 mr-2" />;
        case Tab.History: return <HistoryIcon className="h-5 w-5 mr-2" />;
        default: return null;
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-doma-cream text-doma-dark-gray font-sans">
      <header className="sticky top-0 z-20 bg-doma-cream/80 backdrop-blur-sm border-b border-doma-dark-gray/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <DomaLogo />
          <div className="flex items-center space-x-2">
            <button
                onClick={() => openPromptsManager()}
                className="flex items-center px-3 py-1.5 md:px-4 md:py-2 rounded-full text-sm font-semibold transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-doma-red bg-white/50 text-doma-dark-gray hover:bg-white border border-black/5 shadow-sm"
              >
                <PromptsIcon className="h-5 w-5 mr-0 md:mr-2" />
                <span className="hidden md:inline">Prompts</span>
              </button>
            <nav className="flex space-x-1 bg-doma-cream p-1 rounded-full shadow-inner-soft border border-black/5">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-3 py-1.5 md:px-4 md:py-2 rounded-full text-sm font-semibold transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-doma-red ${
                    activeTab === tab.id
                      ? 'bg-doma-green text-white shadow-md'
                      : 'text-doma-dark-gray hover:bg-white/50'
                  }`}
                >
                  {getIconForTab(tab.id)}
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-grow relative">
        {notification && (
            <div className={`fixed top-24 right-4 p-4 rounded-xl shadow-lg z-50 max-w-sm text-white animate-fade-in-up ${notification.type === 'error' ? 'bg-gradient-to-br from-doma-red to-red-700' : 'bg-gradient-to-br from-doma-green to-green-900'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold mb-1 capitalize">{notification.type}</h3>
                    <p className="text-sm">{notification.message}</p>
                    {notification.action && (
                      <button 
                        onClick={() => {
                          notification.action?.onClick();
                          setNotification(null);
                        }} 
                        className="mt-2 text-sm font-bold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md"
                      >
                        {notification.action.label}
                      </button>
                    )}
                  </div>
                  <button onClick={() => setNotification(null)} className="ml-4 text-xl leading-none flex-shrink-0">&times;</button>
                </div>
            </div>
        )}
        
        <PromptsManager
            isOpen={isPromptsManagerOpen}
            onClose={closePromptsManager}
            onApplyTemplate={handleApplyTemplate}
            setNotification={setNotification}
            highlightId={highlightedTemplateId}
        />

        <div className={activeTab === Tab.Generate ? 'block h-full' : 'hidden'}>
            <GenerateView 
              setNotification={setNotification} 
              addHistoryItem={addHistoryItem} 
              imageToLoad={imageToGenerate}
              onImageLoaded={() => setImageToGenerate(null)}
              // Pass hoisted state and setters
              promptData={promptData}
              setPromptData={setPromptData}
              resultImage={resultImage}
              setResultImage={setResultImage}
              subjectImage={subjectImage}
              setSubjectImage={setSubjectImage}
              environmentImage={environmentImage}
              setEnvironmentImage={setEnvironmentImage}
              selectedPreset={selectedPreset}
              setSelectedPreset={setSelectedPreset}
              lockedFields={lockedFields}
              setLockedFields={setLockedFields}
              remixHint={remixHint}
              setRemixHint={setRemixHint}
              onApplyTemplate={handleApplyTemplate}
              openPromptsManager={openPromptsManager}
            />
        </div>
        <div className={activeTab === Tab.Edit ? 'block h-full' : 'hidden'}>
            <EditView 
              setNotification={setNotification} 
              addHistoryItem={addHistoryItem}
              imageToLoad={imageToEdit}
              onImageLoaded={() => setImageToEdit(null)}
            />
        </div>
        <div className={activeTab === Tab.Compose ? 'block h-full' : 'hidden'}>
            <ComposeView setNotification={setNotification} addHistoryItem={addHistoryItem} />
        </div>
        <div className={activeTab === Tab.History ? 'block h-full' : 'hidden'}>
            <HistoryView 
              history={history} 
              onUsePrompt={handleUsePromptFromHistory} 
              setNotification={setNotification} 
              onLoadImageForEdit={handleLoadImageForEdit}
              onLoadImageForGenerate={handleLoadImageForGenerate}
            />
        </div>
      </main>
    </div>
  );
};

export default App;