import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Template, PromptData } from '../types';
import * as templatesStore from '../services/templatesStore';
import { Notification } from '../App';
import { PinIcon, PinOffIcon, TrashIcon, SparklesIcon, EditIcon, WarningIcon, DocumentDuplicateIcon } from './icons';
import { buildIndex, BuiltIndex } from '../services/search/index';
import { searchTemplates, SearchResultItem } from '../services/search/searchTemplates';
import { LintScoreBadge } from './LintScoreBadge';
import CreateVariantModal from './CreateVariantModal';

interface PromptsManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onApplyTemplate: (template: PromptData) => void;
    setNotification: (notification: Notification | null) => void;
    highlightId?: string;
}

const CAMERA_PATTERNS = /fisheye|35mm|50mm|85mm|telephoto|low[\s|-]angle|high[\s|-]angle|overhead|wide[\s|-]angle|macro|drone|dutch/i;

const getTemplateWarnings = (template: Template): string[] => {
    const warnings: string[] = [];
    if (!template.subject?.trim()) {
        warnings.push('Subject is empty.');
    }
    if (template.tags.length === 0) {
        warnings.push('Template has no tags.');
    }
    if (template.camera?.trim() && !CAMERA_PATTERNS.test(template.camera)) {
        warnings.push('Camera description lacks common keywords (e.g., "50mm", "low angle").');
    }
    return warnings;
};

// FIX: Define a strict type for sortable keys to improve type safety.
type SortKey = 'updatedAt' | 'lastUsed' | 'usageCount' | 'createdAt' | 'name' | 'category';

const PromptsManager: React.FC<PromptsManagerProps> = ({ isOpen, onClose, onApplyTemplate, setNotification, highlightId }) => {
    const [allTemplates, setAllTemplates] = useState<Template[]>([]);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [variantParent, setVariantParent] = useState<Template | null>(null);
    const [selectedIds, setSelectedIds] = useState(new Set<string>());
    const [sortConfig, setSortConfig] = useState<{ key: SortKey | 'best', dir: 'asc' | 'desc' }>({ key: 'updatedAt', dir: 'desc' });
    
    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [minQuality, setMinQuality] = useState<'Amber' | 'Green'>('Amber');
    const [searchIndex, setSearchIndex] = useState<BuiltIndex | null>(null);
    const [processedTemplates, setProcessedTemplates] = useState<{template: Template, score: number}[]>([]);
    
    const highlightRef = useRef<HTMLDivElement>(null);

    const refreshTemplates = async () => {
        const templates = await templatesStore.getTemplates();
        setAllTemplates(templates);
        setSearchIndex(buildIndex(templates)); // Rebuild index on any refresh
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
    }, [highlightId, processedTemplates]);

    const categories = useMemo(() => {
        const cats = new Set(allTemplates.map(t => t.category || 'Uncategorized'));
        return ['All', ...Array.from(cats).sort()];
    }, [allTemplates]);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        allTemplates.forEach(t => t.tags.forEach(tag => tags.add(tag.toLowerCase())));
        return Array.from(tags).sort();
    }, [allTemplates]);
    
    useEffect(() => {
        const processAndSetTemplates = async () => {
            if (!searchIndex) {
                setProcessedTemplates([]);
                return;
            }

            const isSearchActive = searchQuery.trim().length > 0 || selectedTags.length > 0 || selectedCategory !== 'All';

            if (sortConfig.key === 'best' && !isSearchActive) {
                const bestOfResults = await templatesStore.getBestOf();
                setProcessedTemplates(bestOfResults);
                return;
            }

            if (isSearchActive) {
                const { results } = searchTemplates(searchIndex, { 
                    q: searchQuery, 
                    tags: selectedTags, 
                    category: selectedCategory === 'All' ? undefined : selectedCategory, 
                    minQuality,
                    limit: 100 
                });
                const templateMap = new Map(allTemplates.map(t => [t.signature, t]));
                const searchResults = results
                    .map(res => ({ template: templateMap.get(res.signature), score: res.score }))
                    .filter(item => item.template) as { template: Template, score: number }[];
                setProcessedTemplates(searchResults);
                return;
            }

            // Fallback to simple filtering and sorting if no search is active
            let filtered = allTemplates.filter(t => {
                if (minQuality === 'Green' && t.quality !== 'Green') return false;
                if (minQuality === 'Amber' && t.quality === 'Red') return false;
                return true;
            });

            if (sortConfig.key !== 'best') {
              filtered.sort((a, b) => {
                  const { key, dir } = sortConfig;
                  const dir_mod = dir === 'asc' ? 1 : -1;
                  const valA = a[key];
                  const valB = b[key];

                  if (typeof valA === 'string' && typeof valB === 'string') {
                      return valA.localeCompare(valB) * dir_mod;
                  }
                  if (typeof valA === 'number' && typeof valB === 'number') {
                      return (valA - valB) * dir_mod;
                  }
                  return 0;
              });
            }
            
            setProcessedTemplates(filtered.map(t => ({ template: t, score: 0 })));
        };

        processAndSetTemplates();
    }, [allTemplates, searchIndex, searchQuery, selectedCategory, selectedTags, minQuality, sortConfig]);

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
        if (selectedIds.size === processedTemplates.length) {
            // FIX: Using `new Set()` creates a Set<unknown>, which corrupts the state type. Explicitly define it as `new Set<string>()`.
            setSelectedIds(new Set<string>());
        } else {
            setSelectedIds(new Set(processedTemplates.map(item => item.template.id)));
        }
    };
    
    const handleToggleTag = (tag: string) => {
        setSelectedTags(prev => 
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const handleTogglePin = async (t: Template) => {
        await templatesStore.updateTemplate(t.id, { pinned: !t.pinned });
        setNotification({ type: 'success', message: t.pinned ? `"${t.name}" unpinned.` : `"${t.name}" pinned.` });
    };
    const handleToggleFavorite = async (t: Template) => {
        await templatesStore.updateTemplate(t.id, { favorite: !t.favorite });
        setNotification({ type: 'success', message: t.favorite ? `Unfavorited "${t.name}".` : `Favorited "${t.name}".`});
    };
    
    const handleDelete = async (t: Template) => {
      if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
      try {
        await templatesStore.deleteTemplate(t.id); // <- await!
        await refreshTemplates();                  // <- tūlīt atsvaidzini vietējo stāvokli
        setNotification({ type: 'success', message: `Template "${t.name}" deleted.` });
      } catch (e) {
        console.error("deleteTemplate failed:", e);
        setNotification({ type: 'error', message: `Failed to delete: ${String(e)}` });
      }
    };
      
    const handleBulkDelete = async () => {
      if (!confirm(`Delete ${selectedIds.size} templates? This cannot be undone.`)) return;
      const ids = Array.from(selectedIds);
      try {
        await templatesStore.deleteManyTemplates(ids); // <- await!
        await refreshTemplates();                      // <- tūlīt refresh
        // FIX: Using `new Set()` creates a Set<unknown>, which corrupts the state type. Explicitly define it as `new Set<string>()`.
        setSelectedIds(new Set<string>());
        setNotification({ type: 'success', message: `${ids.length} templates deleted.` });
      } catch (e) {
        console.error("deleteManyTemplates failed:", e);
        setNotification({ type: 'error', message: `Failed to bulk delete: ${String(e)}` });
      }
    };

    const handleBulkPin = async (pinned: boolean) => {
        await templatesStore.updateManyTemplates(Array.from(selectedIds), { pinned });
        setNotification({ type: 'success', message: `${selectedIds.size} templates ${pinned ? 'pinned' : 'unpinned'}.` });
        // FIX: Using `new Set()` creates a Set<unknown>, which corrupts the state type. Explicitly define it as `new Set<string>()`.
        setSelectedIds(new Set<string>());
    };
    
    const handleBulkMove = async (category: string) => {
        await templatesStore.updateManyTemplates(Array.from(selectedIds), { category });
        setNotification({ type: 'success', message: `${selectedIds.size} templates moved to "${category}".` });
        // FIX: Using `new Set()` creates a Set<unknown>, which corrupts the state type. Explicitly define it as `new Set<string>()`.
        setSelectedIds(new Set<string>());
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
        // FIX: Using `new Set()` creates a Set<unknown>, which corrupts the state type. Explicitly define it as `new Set<string>()`.
        setSelectedIds(new Set<string>());
    }

    const handleApply = async (t: Template) => {
        await templatesStore.applyTemplate(t.signature);
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
    
    if (variantParent) {
        return (
            <CreateVariantModal 
                parentTemplate={variantParent}
                onClose={() => setVariantParent(null)}
                onVariantCreated={(newTemplate) => {
                    setNotification({ type: 'success', message: `Variant "${newTemplate.name}" created successfully.`});
                    setVariantParent(null);
                }}
            />
        )
    }

    const isSearchOrFilterActive = searchQuery.trim().length > 0 || selectedTags.length > 0 || selectedCategory !== 'All';

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
                    <aside className="w-56 flex-shrink-0 p-4 border-r border-gray-200 overflow-y-auto flex flex-col gap-4">
                        <div>
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
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Filters</h3>
                            <div className="space-y-2 text-sm p-2 bg-white/50 rounded-md">
                                <label className="block">Min Quality:</label>
                                <select value={minQuality} onChange={e => setMinQuality(e.target.value as any)} className="w-full text-sm border-gray-300 rounded-md p-1">
                                    <option value="Amber">Show Good & Fair</option>
                                    <option value="Green">Show Good Only</option>
                                </select>
                            </div>
                        </div>
                         <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Tags</h3>
                            <div className="max-h-80 overflow-y-auto pr-2 -mr-2 space-y-1">
                                {allTags.map(tag => (
                                    <button 
                                        key={tag}
                                        onClick={() => handleToggleTag(tag)}
                                        className={`w-full text-left text-xs font-medium px-2 py-1 rounded transition-colors ${selectedTags.includes(tag) ? 'bg-doma-green/20 text-doma-green' : 'text-gray-500 hover:bg-gray-200/50'}`}
                                    >{tag}</button>
                                ))}
                            </div>
                        </div>
                    </aside>
                    <main className="flex-grow flex flex-col overflow-hidden">
                        <div className="flex-shrink-0 flex flex-wrap items-center justify-between p-2 border-b border-gray-200 bg-white/30 gap-2">
                            <div className="flex items-center gap-2 text-sm">
                                <input type="checkbox" title="Select all" 
                                    checked={processedTemplates.length > 0 && selectedIds.size === processedTemplates.length}
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
                                    <span>{processedTemplates.length} templates shown</span>
                                )}
                            </div>
                             <div className="flex items-center gap-2 text-sm">
                                {!isSearchOrFilterActive && (
                                    <>
                                    <span>Sort by:</span>
                                    <select value={`${sortConfig.key}-${sortConfig.dir}`} onChange={e => {
                                        const [key, dir] = e.target.value.split('-');
                                        setSortConfig({ key: key as SortKey | 'best', dir: dir as 'asc' | 'desc' });
                                    }} className="text-sm border rounded-md p-1 hover:bg-gray-100 bg-white">
                                        <option value="best-desc">Best Score</option>
                                        <option value="updatedAt-desc">Last Updated</option>
                                        <option value="lastUsed-desc">Last Used</option>
                                        <option value="usageCount-desc">Most Used</option>
                                        <option value="createdAt-desc">Date Created</option>
                                        <option value="name-asc">Name (A-Z)</option>
                                        <option value="category-asc">Category</option>
                                    </select>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex-grow p-4 overflow-y-auto">
                            {processedTemplates.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                                    {processedTemplates.map(({template: t, score}) => {
                                        const warnings = getTemplateWarnings(t);
                                        const isHighlighted = t.id === highlightId;
                                        return (
                                        <div key={t.id} ref={isHighlighted ? highlightRef : null} className={`bg-white/80 rounded-xl border flex flex-col transition-all duration-300 hover:shadow-lg ${selectedIds.has(t.id) ? 'border-doma-green shadow-md' : 'border-gray-200/80 shadow-sm'} ${isHighlighted ? 'ring-2 ring-offset-2 ring-doma-red' : ''}`}>
                                            <div className="p-4 flex-grow flex gap-4">
                                                <input type="checkbox" className="mt-1" checked={selectedIds.has(t.id)} onChange={() => handleSelect(t.id)} />
                                                {t.thumbnail && <img src={t.thumbnail} alt="thumbnail" className="w-20 h-20 object-cover rounded-md flex-shrink-0" />}
                                                <div className="flex-grow">
                                                    <div className="flex justify-between items-start">
                                                        <h4 className="font-bold text-doma-dark-gray mb-1 pr-2 flex-grow flex items-center gap-2">
                                                            <span>{t.name}</span>
                                                            <LintScoreBadge quality={t.quality || 'Amber'} />
                                                        </h4>
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
                                                    <div className="text-xs text-gray-500 mb-2 flex justify-between">
                                                        <span>{t.category || 'Uncategorized'}</span>
                                                        {score > 0 && <span className="font-mono text-gray-400" title="Relevance Score">{score.toFixed(2)}</span>}
                                                    </div>
                                                    <p className="text-sm text-gray-600 line-clamp-2 mb-2" title={t.subject}>{t.subject}</p>
                                                    <p className="text-xs text-gray-400 font-mono">
                                                        Usage: {t.usageCount || 0} &bull; Success: {t.renderSuccessCount || 0}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="p-3 border-t border-gray-200 bg-gray-50/50 flex justify-between items-center rounded-b-xl">
                                                <div className="flex items-center space-x-1">
                                                    <button onClick={() => setEditingTemplate(t)} title="Edit" className="p-2 text-gray-500 hover:text-doma-green hover:bg-gray-200/50 rounded-full"><EditIcon className="h-4 w-4"/></button>
                                                    <button onClick={() => setVariantParent(t)} title="Create Variant" className="p-2 text-gray-500 hover:text-doma-green hover:bg-gray-200/50 rounded-full"><DocumentDuplicateIcon className="h-4 w-4"/></button>
                                                    <button
                                                      type="button"
                                                      onClick={(e) => { e.stopPropagation(); handleDelete(t); }}
                                                      className="p-1 rounded-full hover:bg-red-50 text-gray-500 hover:text-doma-red"
                                                      title="Delete"
                                                    >
                                                      <TrashIcon className="h-4 w-4" />
                                                    </button>
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