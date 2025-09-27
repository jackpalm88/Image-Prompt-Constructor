import React from 'react';
import { HistoryItem } from '../types';
import MiniSpinner from './MiniSpinner';

interface HistoryViewProps {
  history: HistoryItem[];
  onIterate: (item: HistoryItem, change: string) => void;
  iteratingItemId: string | null;
}

const HistoryView: React.FC<HistoryViewProps> = ({ history, onIterate, iteratingItemId }) => {
    if (history.length === 0) {
        return (
            <div className="flex items-center justify-center h-full p-8">
                <p className="text-gray-400 text-lg">Your generation history is empty.</p>
            </div>
        );
    }

  return (
    <div className="p-4 md:p-8">
        <h2 className="text-2xl font-bold text-cyan-300 mb-6">Generation History</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {history.map(item => {
                const isIterating = item.id === iteratingItemId;
                return (
                    <div key={item.id} className="bg-gray-800 rounded-lg overflow-hidden shadow-lg group flex flex-col">
                        <div className="relative">
                            <img src={item.resultImage} alt="history item" className={`w-full h-48 object-cover transition-opacity ${isIterating ? 'opacity-30' : 'group-hover:opacity-80'}`} />
                            {isIterating && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                    <MiniSpinner />
                                </div>
                            )}
                        </div>
                        <div className="p-4 flex flex-col flex-grow">
                            <p className="text-xs text-gray-400 mb-2">{new Date(item.timestamp).toLocaleString()}</p>
                            <p className="text-sm text-gray-200 line-clamp-3 leading-tight flex-grow">{item.prompt}</p>
                            
                              <div className="mt-4 pt-3 border-t border-gray-700/50">
                                <p className="text-xs font-semibold text-gray-400 mb-2">Apply small change:</p>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => onIterate(item, 'Make the image slightly warmer')} disabled={isIterating} className="text-xs bg-cyan-900/70 hover:bg-cyan-800/90 text-cyan-200 rounded-full px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Warmer</button>
                                    <button onClick={() => onIterate(item, 'Make the image slightly sharper')} disabled={isIterating} className="text-xs bg-cyan-900/70 hover:bg-cyan-800/90 text-cyan-200 rounded-full px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Sharper</button>
                                    <button onClick={() => onIterate(item, 'Increase the contrast slightly')} disabled={isIterating} className="text-xs bg-cyan-900/70 hover:bg-cyan-800/90 text-cyan-200 rounded-full px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">More contrast</button>
                                </div> 
                              </div> 
                        </div>
                    </div>
                )
            })}
        </div>
    </div>
  );
};

export default HistoryView;
