import React, { useState } from 'react';
import { Tab, HistoryItem } from './types';
import { TABS } from './constants';
import GenerateView from './components/GenerateView';
import EditView from './components/EditView';
import ComposeView from './components/ComposeView';
import HistoryView from './components/HistoryView';
import Spinner from './components/Spinner';
import { GenerateIcon, EditIcon, ComposeIcon, HistoryIcon } from './components/icons';
import { applyIterativeChange } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.Generate);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [iteratingHistoryItemId, setIteratingHistoryItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addHistoryItem = (resultImage: string, prompt: string, inputImages: string[] = []) => {
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      type: activeTab,
      prompt,
      resultImage,
      inputImages,
      timestamp: Date.now(),
    };
    setHistory(prev => [newItem, ...prev]);
  };
  
  const handleIterativeChange = async (item: HistoryItem, change: string) => {
    setError(null);
    setIteratingHistoryItemId(item.id);
    try {
        const [header, base64Data] = item.resultImage.split(',');
        if (!header || !base64Data) {
            throw new Error("Invalid image data URL format in history item.");
        }
        const mimeMatch = header.match(/:(.*?);/);
        if (!mimeMatch || !mimeMatch[1]) {
            throw new Error("Could not determine mime type from image data URL.");
        }
        const mimeType = mimeMatch[1];

        const newImageUrl = await applyIterativeChange(base64Data, mimeType, change);
        const prompt = `Iterative Change: ${change.replace('Make the image slightly ', '').replace('Increase the', 'More').toLowerCase()}`;
        addHistoryItem(newImageUrl, prompt, [item.resultImage]);
    } catch(err) {
        setError((err as Error).message);
    } finally {
        setIteratingHistoryItemId(null);
    }
  };

  const getIconForTab = (tabId: Tab) => {
    switch(tabId) {
        case Tab.Generate: return <GenerateIcon className="h-5 w-5 mr-2" />;
        case Tab.Edit: return <EditIcon className="h-5 w-5 mr-2" />;
        case Tab.Compose: return <ComposeIcon className="h-5 w-5 mr-2" />;
        case Tab.History: return <HistoryIcon className="h-5 w-5 mr-2" />;
        default: return null;
    }
  }

  const renderContent = () => {
    switch (activeTab) {
      case Tab.Generate:
        return <GenerateView setError={setError} addHistoryItem={(res, p, inputs) => addHistoryItem(res, p, inputs)} />;
      case Tab.Edit:
        return <EditView setError={setError} addHistoryItem={(res, p, inputs) => addHistoryItem(res, p, inputs)} />;
      case Tab.Compose:
        return <ComposeView setError={setError} addHistoryItem={(res, p, inputs) => addHistoryItem(res, p, inputs)} />;
      case Tab.History:
        return <HistoryView history={history} onIterate={handleIterativeChange} iteratingItemId={iteratingHistoryItemId} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-gray-200 font-sans">
      <header className="bg-gray-800/30 backdrop-blur-sm sticky top-0 z-10 shadow-md">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">
            <span className="text-cyan-400">Nano Banana</span> Guided Image App
          </h1>
          <nav className="flex space-x-2 bg-gray-900/50 p-1 rounded-lg">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {getIconForTab(tab.id)}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-grow relative">
        {error && (
            <div className="absolute top-4 right-4 bg-red-800 text-white p-4 rounded-lg shadow-lg z-30 max-w-sm">
                <h3 className="font-bold mb-2">Error</h3>
                <p className="text-sm">{error}</p>
                <button onClick={() => setError(null)} className="absolute top-2 right-2 text-xl">&times;</button>
            </div>
        )}
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
