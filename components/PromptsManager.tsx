import React, { useState, useEffect, useMemo } from 'react';
import { Template, PromptData } from '../types';
import * as templatesStore from '../services/templatesStore';
import { Notification } from '../App';
import { PinIcon, PinOffIcon, TrashIcon, SparklesIcon, EditIcon } from './icons';

interface PromptsManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onApplyTemplate: (template: PromptData) => void;
    setNotification: (notification: Notification | null) => void;
}

const PromptsManager: React.FC<PromptsManagerProps> = ({ isOpen, onClose, onApplyTemplate, setNotification }) => {
    const [allTemplates, setAllTemplates] = useState<Template[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

    const refreshTemplates = () => {
        setAllTemplates(templatesStore.getTemplates());
    };

    useEffect(() => {
        if (isOpen) {
            refreshTemplates();
        }
    }, [isOpen]);

    const categories = useMemo(() => {
        const cats = new Set(allTemplates.map(t => t.category || 'Uncategorized'));
        return ['All', ...Array.from(cats).sort()];
    }, [allTemplates]);

    const filteredTemplates = useMemo(() => {
        return allTemplates
            .filter(t => {
                const categoryMatch = selectedCategory === 'All' || (t.category || 'Uncategorized') === selectedCategory;
                if (!categoryMatch) return false;

                const query = searchQuery.toLowerCase();
                if (!query) return true;

                return (
                    t.name.toLowerCase().includes(query) ||
                    (t.category || '').toLowerCase().includes(query) ||
                    t.tags.some(tag => tag.toLowerCase().includes(query)) ||
                    t.subject.toLowerCase().includes(query) ||
                    t.action.toLowerCase().includes(query) ||
                    t.environment.toLowerCase().includes(query)
                );
            })
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }, [allTemplates, searchQuery, selectedCategory]);

    const handleAction = (action: () => void, successMessage: string) => {
        action();
        refreshTemplates();
        setNotification({ type: 'success', message: successMessage });
    };
    
    const handleTogglePin = (t: Template) => handleAction(() => templatesStore.updateTemplate(t.id, { pinned: !t.pinned }), t.pinned ? `"${t.name}" unpinned.` : `"${t.name}" pinned to Quick Access.`);
    const handleToggleFavorite = (t: Template) => handleAction(() => templatesStore.updateTemplate(t.id, { favorite: !t.favorite }), t.favorite ? `"${t.name}" removed from favorites.` : `"${t.name}" added to favorites.`);
    const handleDelete = (t: Template) => {
        if (confirm(`Are you sure you want to delete the template "${t.name}"? This cannot be undone.`)) {
            handleAction(() => templatesStore.deleteTemplate(t.id), `Template "${t.name}" deleted.`);
        }
    };
    
    const handleApply = (t: Template) => {
        templatesStore.incrementUsage(t.id);
        onApplyTemplate(t);
        onClose();
    };

    const handleSaveEdit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingTemplate) return;

        const formData = new FormData(e.currentTarget);
        const name = formData.get('name') as string;
        const category = formData.get('category') as string;
        const tags = (formData.get('tags') as string).split(',').map(t => t.trim()).filter(Boolean);
        
        handleAction(() => templatesStore.updateTemplate(editingTemplate.id, { name, category, tags }), `Template "${name}" updated.`);
        setEditingTemplate(null);
    };

    const handleExport = () => {
        const jsonString = templatesStore.exportTemplates();
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `doma-templates-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = templatesStore.importTemplates(event.target?.result as string);
            setNotification({ type: result.success ? 'success' : 'error', message: result.message });
            if (result.success) {
                refreshTemplates();
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset file input
    };

    if (!isOpen) return null;

    if (editingTemplate) {
        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEditingTemplate(null)}>
                <div className="bg-doma-cream rounded-2xl shadow-xl w-full max-w-lg animate-fade-in-up" onClick={e => e.stopPropagation()}>
                    <h3 className="font-display text-xl p-4 border-b border-gray-200">Edit Template</h3>
                    <form onSubmit={handleSaveEdit}>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Name</label>
                                <input name="name" defaultValue={editingTemplate.name} required className="w-full mt-1 bg-white border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Category</label>
                                <input name="category" defaultValue={editingTemplate.category} placeholder="e.g., Portraits, Landscapes" className="w-full mt-1 bg-white border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Tags (comma-separated)</label>
                                <input name="tags" defaultValue={editingTemplate.tags.join(', ')} placeholder="e.g., cinematic, neon, 8k" className="w-full mt-1 bg-white border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" />
                            </div>
                        </div>
                        <div className="flex justify-end p-4 border-t border-gray-200 space-x-2 bg-white/30">
                            <button type="button" onClick={() => setEditingTemplate(null)} className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-xl border border-gray-300">Cancel</button>
                            <button type="submit" className="bg-doma-green text-white font-bold py-2 px-4 rounded-xl">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-doma-cream rounded-2xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col animate-fade-in-up border border-black/10" onClick={e => e.stopPropagation()}>
                <header className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-center p-4 border-b border-gray-200 space-y-2 sm:space-y-0">
                    <h2 className="font-display text-2xl font-medium text-doma-green">Prompts Manager</h2>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search templates..." className="w-full sm:w-64 bg-white border border-gray-300 rounded-full shadow-inner-soft px-4 py-2 text-sm focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" />
                        <label className="text-sm bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-xl border border-gray-300 cursor-pointer">Import<input type="file" accept=".json" onChange={handleImport} className="hidden" /></label>
                        <button onClick={handleExport} className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-xl border border-gray-300">Export</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-doma-dark-gray text-3xl sm:hidden">&times;</button>
                    </div>
                </header>
                <div className="flex-grow flex overflow-hidden">
                    <aside className="w-48 flex-shrink-0 p-4 border-r border-gray-200 overflow-y-auto">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Categories</h3>
                        <ul className="space-y-1">
                            {categories.map(cat => (
                                <li key={cat}>
                                    <button onClick={() => setSelectedCategory(cat)} className={`w-full text-left text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${selectedCategory === cat ? 'bg-doma-green/10 text-doma-green' : 'text-gray-600 hover:bg-gray-200/50'}`}>
                                        {cat}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </aside>
                    <main className="flex-grow p-4 overflow-y-auto">
                        {filteredTemplates.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredTemplates.map(t => (
                                    <div key={t.id} className="bg-white/80 rounded-xl border border-gray-200/80 shadow-md flex flex-col transition-shadow hover:shadow-lg">
                                        <div className="p-4 flex-grow">
                                            <div className="flex justify-between items-start">
                                                <h4 className="font-bold text-doma-dark-gray mb-1 pr-2 flex-grow">{t.name}</h4>
                                                <div className="flex items-center space-x-2 flex-shrink-0">
                                                    <button onClick={() => handleToggleFavorite(t)} title={t.favorite ? "Unfavorite" : "Favorite"} className={t.favorite ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}>
                                                        <SparklesIcon className="h-5 w-5" style={{fill: t.favorite ? 'currentColor' : 'none'}}/>
                                                    </button>
                                                    <button onClick={() => handleTogglePin(t)} title={t.pinned ? "Unpin" : "Pin to Quick Access"} className={t.pinned ? 'text-doma-red' : 'text-gray-400 hover:text-doma-red'}>
                                                        {t.pinned ? <PinIcon className="h-5 w-5"/> : <PinOffIcon className="h-5 w-5"/>}
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-2">{t.category || 'Uncategorized'}</p>
                                            <p className="text-sm text-gray-600 line-clamp-2" title={t.subject}>{t.subject}</p>
                                        </div>
                                        <div className="p-3 border-t border-gray-200 bg-gray-50/50 flex justify-between items-center rounded-b-xl">
                                             <div className="flex items-center space-x-2">
                                                <button onClick={() => setEditingTemplate(t)} title="Edit" className="p-2 text-gray-500 hover:text-doma-green hover:bg-gray-200/50 rounded-full"><EditIcon className="h-4 w-4"/></button>
                                                <button onClick={() => handleDelete(t)} title="Delete" className="p-2 text-gray-500 hover:text-doma-red hover:bg-gray-200/50 rounded-full"><TrashIcon className="h-4 w-4"/></button>
                                            </div>
                                            <button onClick={() => handleApply(t)} className="bg-doma-red text-white font-bold py-1.5 px-4 text-sm rounded-xl hover:bg-red-800 transition-colors">Apply</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 mt-8">No templates found. Try adjusting your search or filter.</p>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
};

export default PromptsManager;