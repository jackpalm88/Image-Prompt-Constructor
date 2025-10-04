import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Template, PromptData } from '../types';
import * as templatesStore from '../services/templatesStore';
import { Notification } from '../App';
import { PinIcon, PinOffIcon, TrashIcon, SparklesIcon, EditIcon, WarningIcon } from './icons';

interface PromptsManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onApplyTemplate: (template: PromptData) => void;
    setNotification: (notification: Notification | null) => void;
    highlightId?: string;
}

const STOPWORDS = new Set(['a', 'an', 'the', 'in', 'on', 'of', 'for', 'with', 'by', 'as', 'is', 'are', 'was', 'were']);
const CAMERA_PATTERNS = /fisheye|35mm|50mm|85mm|telephoto|low[\s|-]angle|high[\s|-]angle|overhead|wide[\s|-]angle|macro|drone|dutch/i;

const getTemplateWarnings = (template: Template): string[] => {
    const warnings: string[] = [];
    if (!template.subject?.trim()) {
        warnings.push('Subject is empty.');
    }
    if (template.tags.length > 0 && template.tags.every(tag => tag.length < 3 || STOPWORDS.has(tag))) {
        warnings.push('Tags may be trivial or common stopwords.');
    }
    if (template.camera?.trim() && !CAMERA_PATTERNS.test(template.camera)) {
        warnings.push('Camera description lacks common keywords (e.g., "50mm", "low angle").');
    }
    return warnings;
};


const PromptsManager: React.FC<PromptsManagerProps> = ({ isOpen, onClose, onApplyTemplate, setNotification, highlightId }) => {
    const [allTemplates, setAllTemplates] = useState<Template[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

    const [selectedIds, setSelectedIds] = useState(new Set<string>());
    const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', dir: 'desc' });
    const [filters, setFilters] = useState({ pinnedOnly: false, favoritesOnly: false });
    
    const highlightRef = useRef<HTMLDivElement>(null);

    const refreshTemplates = async () => {
        setAllTemplates(await templatesStore.getTemplates());
    };

    useEffect(() => {
        if (isOpen) {
            const handleTemplatesUpdate = () => refreshTemplates();
            const handleStorageUpdate = (event: StorageEvent) => {
                if (event.key === 'doma-image-studio-templates') {
                    handleTemplatesUpdate();
                }
            };
    
            window.addEventListener('doma:templates-updated', handleTemplatesUpdate);
            window.addEventListener('storage', handleStorageUpdate);
    
            refreshTemplates();
    
            return () => {
                window.removeEventListener('doma:templates-updated', handleTemplatesUpdate);
                window.removeEventListener('storage', handleStorageUpdate);
            };
        }
    }, [isOpen]);

    useEffect(() => {
        if (highlightId && highlightRef.current) {
            highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [highlightId, allTemplates]);


    const categories = useMemo(() => {
        const cats = new Set(allTemplates.map(t => t.category || 'Uncategorized'));
        return ['All', ...Array.from(cats).sort()];
    }, [allTemplates]);

    const filteredAndSortedTemplates = useMemo(() => {
        return allTemplates
            .filter(t => {
                const categoryMatch = selectedCategory === 'All' || (t.category || 'Uncategorized') === selectedCategory;
                if (!categoryMatch) return false;

                if (filters.pinnedOnly && !t.pinned) return false;
                if (filters.favoritesOnly && !t.favorite) return false;

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
            .sort((a, b) => {
                const { key, dir } = sortConfig;
                const dir_mod = dir === 'asc' ? 1 : -1;
                const valA = a[key as keyof Template];
                const valB = b[key as keyof Template];

                if (typeof valA === 'string' && typeof valB === 'string') {
                    return valA.localeCompare(valB) * dir_mod;
                }
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return (valA - valB) * dir_mod;
                }
                return 0;
            });
    }, [allTemplates, searchQuery, selectedCategory, sortConfig, filters]);

    const handleSelect = (id: string) => {
        const newSelection = new Set(selectedIds);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        setSelectedIds(newSelection);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === filteredAndSortedTemplates.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredAndSortedTemplates.map(t => t.id)));
        }
    };
    
    // Individual actions
    const handleTogglePin = async (t: Template) => {
        await templatesStore.updateTemplate(t.id, { pinned: !t.pinned });
        setNotification({ type: 'success', message: t.pinned ? `"${t.name}" unpinned.` : `"${t.name}" pinned.` });
    };
    const handleToggleFavorite = async (t: Template) => {
        await templatesStore.updateTemplate(t.id, { favorite: !t.favorite });
        setNotification({ type: 'success', message: t.favorite ? `Unfavorited "${t.name}".` : `Favorited "${t.name}".`});
    };
    const handleDelete = async (t: Template) => {
        if (confirm(`Delete "${t.name}"? This cannot be undone.`)) {
            await templatesStore.deleteTemplate(t.id);
            setNotification({ type: 'success', message: `Template "${t.name}" deleted.`});
        }
    };
    
    // Bulk actions
    const handleBulkDelete = async () => {
        if (confirm(`Delete ${selectedIds.size} templates? This cannot be undone.`)) {
            await templatesStore.deleteManyTemplates(Array.from(selectedIds));
            setNotification({ type: 'success', message: `${selectedIds.size} templates deleted.` });
            setSelectedIds(new Set());
        }
    };

    const handleBulkPin = async (pinned: boolean) => {
        await templatesStore.updateManyTemplates(Array.from(selectedIds), { pinned });
        setNotification({ type: 'success', message: `${selectedIds.size} templates ${pinned ? 'pinned' : 'unpinned'}.` });
        setSelectedIds(new Set());
    };
    
    const handleBulkMove = async (category: string) => {
        await templatesStore.updateManyTemplates(Array.from(selectedIds), { category });
        setNotification({ type: 'success', message: `${selectedIds.size} templates moved to "${category}".` });
        setSelectedIds(new Set());
    };

    const handleBulkExport = async () => {
        const jsonString = await templatesStore.exportTemplates(Array.from(selectedIds));
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `doma-templates-export-${selectedIds.size}-items.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setSelectedIds(new Set());
    }

    const handleApply = async (t: Template) => {
        await templatesStore.incrementUsage(t.id);
        onApplyTemplate(t);
        onClose();
    };

    const handleSaveEdit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingTemplate) return;

        const formData = new FormData(e.currentTarget);
        const name = formData.get('name') as string;
        const category = formData.get('category') as string;
        const tags = (formData.get('tags') as string).split(',').map(t => t.trim()).filter(Boolean);
        
        const updatedTemplateData = {
            ...editingTemplate,
            name,
            category,
            tags
        };

        const validation = templatesStore.validateTemplate(updatedTemplateData);
        if (validation.quality === 'Red') {
            alert(`Could not save template. Please fix issues:\n- ${validation.issues.join('\n- ')}`);
            return;
        }
        if (validation.quality === 'Amber' && validation.issues.length > 0) {
            if (!window.confirm(`There are some quality warnings, but you can proceed:\n- ${validation.issues.join('\n- ')}\n\nDo you want to save anyway?`)) {
                return;
            }
        }
        
        await templatesStore.updateTemplate(editingTemplate.id, { name, category, tags });
        setNotification({ type: 'success', message: `Template "${name}" updated.`});
        setEditingTemplate(null);
    };

    const handleExportAll = async () => {
        const jsonString = await templatesStore.exportTemplates();
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
        reader.onload = async (event) => {
            const result = await templatesStore.importTemplates(event.target?.result as string);
            setNotification({ type: result.success ? 'success' : 'error', message: result.message });
            if (result.success && result.importedCount > 0) {
                await refreshTemplates();
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
                                <input name="category" defaultValue={editingTemplate.category} placeholder="e.g., Portraits, Landscapes" list="category-suggestions" className="w-full mt-1 bg-white border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" />
                                <datalist id="category-suggestions">
                                    {categories.filter(c => c !== 'All').map(c => <option key={c} value={c} />)}
                                </datalist>
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
            <div className="bg-doma-cream rounded-2xl shadow-xl w-full max-w-7xl h-[90vh] flex flex-col animate-fade-in-up border border-black/10" onClick={e => e.stopPropagation()}>
                <header className="flex-shrink-0 flex flex-wrap justify-between items-center p-4 border-b border-gray-200 gap-2">
                    <h2 className="font-display text-2xl font-medium text-doma-green">Prompts Manager</h2>
                    <div className="flex items-center gap-2 flex-wrap">
                        <input type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search templates..." className="w-48 bg-white border border-gray-300 rounded-full shadow-inner-soft px-4 py-2 text-sm focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" />
                        <label className="text-sm bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-xl border border-gray-300 cursor-pointer">Import<input type="file" accept=".json" onChange={handleImport} className="hidden" /></label>
                        <button onClick={handleExportAll} className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-xl border border-gray-300">Export All</button>
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
                         <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">Filters</h3>
                         <div className="space-y-2 text-sm">
                            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.pinnedOnly} onChange={e => setFilters(f => ({...f, pinnedOnly: e.target.checked}))} /> Pinned</label>
                            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.favoritesOnly} onChange={e => setFilters(f => ({...f, favoritesOnly: e.target.checked}))} /> Favorites</label>
                         </div>
                    </aside>
                    <main className="flex-grow flex flex-col overflow-hidden">
                        <div className="flex-shrink-0 flex flex-wrap items-center justify-between p-2 border-b border-gray-200 bg-white/30 gap-2">
                            <div className="flex items-center gap-2 text-sm">
                                <input type="checkbox" title="Select all" 
                                    checked={filteredAndSortedTemplates.length > 0 && selectedIds.size === filteredAndSortedTemplates.length}
                                    onChange={handleSelectAll} 
                                />
                                {selectedIds.size > 0 ? (
                                    <>
                                        <span>{selectedIds.size} selected</span>
                                        <button onClick={() => handleBulkPin(true)} className="px-2 py-1 border rounded-md hover:bg-gray-100">Pin</button>
                                        <button onClick={() => handleBulkPin(false)} className="px-2 py-1 border rounded-md hover:bg-gray-100">Unpin</button>
                                        <select onChange={(e) => handleBulkMove(e.target.value)} className="text-sm border rounded-md p-1 hover:bg-gray-100 bg-white" value="">
                                            <option value="" disabled>Move to...</option>
                                            {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <button onClick={handleBulkExport} className="px-2 py-1 border rounded-md hover:bg-gray-100">Export</button>
                                        <button onClick={handleBulkDelete} className="px-2 py-1 border rounded-md hover:bg-red-50 text-red-600">Delete</button>
                                    </>
                                ) : (
                                    <span>{filteredAndSortedTemplates.length} templates shown</span>
                                )}
                            </div>
                             <div className="flex items-center gap-2 text-sm">
                                <span>Sort by:</span>
                                <select value={`${sortConfig.key}-${sortConfig.dir}`} onChange={e => {
                                    const [key, dir] = e.target.value.split('-');
                                    setSortConfig({ key, dir });
                                }} className="text-sm border rounded-md p-1 hover:bg-gray-100 bg-white">
                                    <option value="updatedAt-desc">Last Updated</option>
                                    <option value="lastUsed-desc">Last Used</option>
                                    <option value="usageCount-desc">Most Used</option>
                                    <option value="createdAt-desc">Date Created</option>
                                    <option value="name-asc">Name (A-Z)</option>
                                    <option value="category-asc">Category</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex-grow p-4 overflow-y-auto">
                            {filteredAndSortedTemplates.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                                    {filteredAndSortedTemplates.map(t => {
                                        const warnings = getTemplateWarnings(t);
                                        const isHighlighted = t.id === highlightId;
                                        return (
                                        <div key={t.id} ref={isHighlighted ? highlightRef : null} className={`bg-white/80 rounded-xl border flex flex-col transition-all duration-300 hover:shadow-lg ${selectedIds.has(t.id) ? 'border-doma-green shadow-md' : 'border-gray-200/80 shadow-sm'} ${isHighlighted ? 'ring-2 ring-offset-2 ring-doma-red animate-pulse' : ''}`}>
                                            <div className="p-4 flex-grow flex gap-4">
                                                <input type="checkbox" className="mt-1" checked={selectedIds.has(t.id)} onChange={() => handleSelect(t.id)} />
                                                {t.thumbnail && <img src={t.thumbnail} alt="thumbnail" className="w-20 h-20 object-cover rounded-md flex-shrink-0" />}
                                                <div className="flex-grow">
                                                    <div className="flex justify-between items-start">
                                                        <h4 className="font-bold text-doma-dark-gray mb-1 pr-2 flex-grow">{t.name}</h4>
                                                        <div className="flex items-center space-x-2 flex-shrink-0">
                                                            {warnings.length > 0 && <div className="relative group"><WarningIcon className="h-5 w-5 text-yellow-500" /><div className="absolute bottom-full mb-2 -right-2 w-64 bg-black text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"><ul className="list-disc list-inside">{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div></div>}
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
                                            </div>
                                            <div className="p-3 border-t border-gray-200 bg-gray-50/50 flex justify-between items-center rounded-b-xl">
                                                <div className="flex items-center space-x-2">
                                                    <button onClick={() => setEditingTemplate(t)} title="Edit" className="p-2 text-gray-500 hover:text-doma-green hover:bg-gray-200/50 rounded-full"><EditIcon className="h-4 w-4"/></button>
                                                    <button onClick={() => handleDelete(t)} title="Delete" className="p-2 text-gray-500 hover:text-doma-red hover:bg-gray-200/50 rounded-full"><TrashIcon className="h-4 w-4"/></button>
                                                </div>
                                                <button onClick={() => handleApply(t)} className="bg-doma-red text-white font-bold py-1.5 px-4 text-sm rounded-xl hover:bg-red-800 transition-colors">Apply</button>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            ) : (
                                <p className="text-center text-gray-500 mt-8">No templates found. Try adjusting your search or filter.</p>
                            )}
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default PromptsManager;