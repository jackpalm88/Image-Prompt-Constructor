import React, { useState } from 'react';
import { Template } from '../types';
import { parseBulkPrompts, ParsedBulkPrompt } from '../services/geminiService';
import { Notification } from '../App';
import Spinner from './Spinner';

interface BulkImportModalProps {
    onClose: () => void;
    onImport: (templates: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>[]) => void;
    setNotification: (notification: Notification | null) => void;
}

const BulkImportModal: React.FC<BulkImportModalProps> = ({ onClose, onImport, setNotification }) => {
    const [text, setText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    
    const handleImport = async () => {
        const prompts = text.split('\n').filter(line => line.trim() !== '');
        if (prompts.length === 0) {
            setNotification({ type: 'error', message: 'Please paste at least one prompt.' });
            return;
        }
        if (prompts.length < 5) {
             if (!confirm(`You've entered fewer than 5 prompts. The AI performs best with 5 or more. Do you want to continue anyway?`)) {
                return;
            }
        }

        setIsParsing(true);
        setNotification(null);
        try {
            const parsedPrompts: ParsedBulkPrompt[] = await parseBulkPrompts(text);
            const newTemplates = parsedPrompts.map(p => ({
                ...p,
                favorite: false,
                pinned: false,
                usageCount: 0,
                lastUsed: null,
            }));

            onImport(newTemplates);
            onClose();
        } catch (err) {
            setNotification({ type: 'error', message: `Failed to parse prompts: ${(err as Error).message}` });
        } finally {
            setIsParsing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-doma-cream rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in-up border border-black/10" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                    <h3 className="font-display text-2xl font-medium text-doma-green">Bulk Import Prompts</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-doma-dark-gray text-2xl">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto space-y-4">
                    {isParsing ? (
                        <Spinner message="Parsing prompts with AI..." />
                    ) : (
                        <>
                            <p className="text-sm text-gray-600">Paste your prompts below, with each full prompt on a new line. The AI will analyze each one, assign a category and tags, and create a structured template from it.</p>
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                rows={10}
                                className="w-full bg-white border border-gray-300 rounded-lg shadow-inner-soft p-2 text-doma-dark-gray focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green"
                                placeholder={"A knight in shining armor, riding a majestic griffin, over a misty mountain range. Style of a fantasy oil painting...\nA futuristic cityscape at night, with flying cars and neon signs, in a cyberpunk aesthetic...\n..."}
                            />
                        </>
                    )}
                </div>
                <div className="flex justify-end items-center p-4 border-t border-gray-200 space-x-3 bg-white/30 rounded-b-lg">
                    <button onClick={onClose} disabled={isParsing} className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-xl transition-colors border border-gray-300 shadow-sm disabled:opacity-50">
                        Cancel
                    </button>
                    <button onClick={handleImport} disabled={isParsing} className="bg-gradient-to-br from-doma-red to-red-800 hover:from-red-800 hover:to-doma-red text-white font-bold py-2 px-4 rounded-xl transition-colors shadow-md disabled:opacity-50">
                        {isParsing ? 'Parsing...' : 'Import & Save Templates'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkImportModal;