
import React, { useState } from 'react';
import { HistoryItem, PromptData } from '../types';
import HistoryDetailModal from './HistoryDetailModal';
import { Notification } from '../App';
import { DownloadIcon, EditIcon, UserIcon, PhotographIcon } from './icons';

interface HistoryViewProps {
  history: HistoryItem[];
  onUsePrompt: (promptData: PromptData) => void;
  onLoadImageForEdit: (imageUrl: string) => void;
  onLoadImageForGenerate: (imageUrl: string, type: 'subject' | 'environment') => void;
  setNotification: (notification: Notification | null) => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({ history, onUsePrompt, onLoadImageForEdit, onLoadImageForGenerate, setNotification }) => {
    const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

    const handleDownload = (imageUrl: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `doma-history-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleEdit = (imageUrl: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onLoadImageForEdit(imageUrl);
    };

    const handleUseAs = (imageUrl: string, type: 'subject' | 'environment', e: React.MouseEvent) => {
        e.stopPropagation();
        onLoadImageForGenerate(imageUrl, type);
    };

    if (history.length === 0) {
        return (
            <div className="flex items-center justify-center h-full p-8">
                <p className="text-gray-500 text-lg">Your generation history is empty.</p>
            </div>
        );
    }

  return (
    <>
        <div className="p-4 md:p-8">
            <h2 className="font-display text-3xl font-medium text-doma-green mb-6">Generation History</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {history.map(item => (
                    <div key={item.id} className="bg-white rounded-2xl overflow-hidden shadow-lg-doma flex flex-col transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 border border-black/5">
                        <div className="relative group" onClick={() => setSelectedItem(item)}>
                            <img src={item.resultImage} alt="history item" className="w-full h-48 object-cover cursor-pointer" />
                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                                <button onClick={(e) => handleDownload(item.resultImage, e)} title="Download" className="p-3 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors">
                                    <DownloadIcon className="h-5 w-5" />
                                </button>
                                <button onClick={(e) => handleEdit(item.resultImage, e)} title="Edit Image" className="p-3 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors">
                                    <EditIcon className="h-5 w-5" />
                                </button>
                                <button onClick={(e) => handleUseAs(item.resultImage, 'subject', e)} title="Use as Subject" className="p-3 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors">
                                    <UserIcon className="h-5 w-5" />
                                </button>
                                <button onClick={(e) => handleUseAs(item.resultImage, 'environment', e)} title="Use as Environment" className="p-3 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors">
                                    <PhotographIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        <div className="p-4 flex flex-col flex-grow">
                            <p className="text-xs text-gray-500 mb-2">{new Date(item.timestamp).toLocaleString()}</p>
                            <p 
                                className="text-sm text-doma-dark-gray line-clamp-3 leading-tight flex-grow cursor-pointer hover:text-doma-green transition-colors"
                                onClick={() => setSelectedItem(item)}
                                title="Click to see details"
                            >
                                {item.prompt}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        {selectedItem && (
            <HistoryDetailModal 
                item={selectedItem}
                onClose={() => setSelectedItem(null)}
                onUsePrompt={onUsePrompt}
                setNotification={setNotification}
            />
        )}
    </>
  );
};

export default HistoryView;