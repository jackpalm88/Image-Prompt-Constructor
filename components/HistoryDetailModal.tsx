
import React from 'react';
import { HistoryItem, PromptData } from '../types';
import { Notification } from '../App';

interface HistoryDetailModalProps {
    item: HistoryItem;
    onClose: () => void;
    onUsePrompt: (promptData: PromptData) => void;
    setNotification: (notification: Notification | null) => void;
}

const HistoryDetailModal: React.FC<HistoryDetailModalProps> = ({ item, onClose, onUsePrompt, setNotification }) => {
    const handleCopy = () => {
        navigator.clipboard.writeText(item.prompt);
        setNotification({ type: 'success', message: 'Prompt copied to clipboard!' });
    };

    const handleUse = () => {
        if (item.promptData) {
            onUsePrompt(item.promptData);
            onClose();
        }
    };
    
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    return (
        <div 
            className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div 
                className="bg-doma-cream rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in-up border border-black/10"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                    <h3 className="font-display text-2xl font-medium text-doma-green">History Details</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-doma-dark-gray text-2xl">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="col-span-1">
                            <img src={item.resultImage} alt="Result" className="w-full h-auto object-cover rounded-lg border border-gray-200 shadow-lg" />
                            {item.inputImages.length > 0 && (
                                <div className="mt-4">
                                    <h4 className="font-semibold text-gray-500 text-xs uppercase tracking-wider mb-2">Inputs</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {item.inputImages.map((src, i) => (
                                            <img key={i} src={src} alt={`Input ${i+1}`} className="w-full h-auto object-cover rounded-md border border-gray-200" />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="col-span-2 space-y-3 text-sm">
                             <p className="text-xs text-gray-500">
                                {new Date(item.timestamp).toLocaleString()} &bull; {item.type}
                            </p>
                            {item.promptData ? (
                                <div className="space-y-3 p-4 bg-white/60 rounded-lg border border-gray-200/80 shadow-inner-soft">
                                    {Object.entries(item.promptData).map(([key, value]) => (
                                        <div key={key}>
                                            <p className="font-semibold text-gray-500 text-xs uppercase tracking-wider">{capitalize(key)}</p>
                                            <p className="text-doma-dark-gray">{value}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div>
                                    <p className="font-semibold text-gray-500 text-xs uppercase tracking-wider">Prompt</p>
                                    <p className="text-doma-dark-gray whitespace-pre-wrap">{item.prompt}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end items-center p-4 border-t border-gray-200 space-x-3 bg-white/30 rounded-b-lg">
                    <button onClick={handleCopy} className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-xl transition-colors border border-gray-300 shadow-sm">
                        Copy Prompt
                    </button>
                    {item.promptData && (
                        <button onClick={handleUse} className="bg-doma-green hover:bg-opacity-90 text-white font-bold py-2 px-4 rounded-xl transition-colors shadow-md">
                            Use this Prompt
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HistoryDetailModal;