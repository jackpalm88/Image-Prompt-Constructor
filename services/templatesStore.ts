import { Template, PromptData } from '../types';
import { STYLE_PRESETS } from '../constants';

const TEMPLATES_KEY = 'doma-image-studio-templates';
const OLD_PRESETS_KEY = 'nano-banana-presets'; // For migration

// --- Helper Functions ---
const getRawTemplates = (): Template[] => {
    try {
        const storedData = localStorage.getItem(TEMPLATES_KEY);
        if (storedData) {
            return JSON.parse(storedData);
        }
    } catch (e) {
        console.error("Failed to parse templates from localStorage", e);
    }
    return [];
};

const saveAllTemplates = (templates: Template[]) => {
    try {
        localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    } catch (e) {
        console.error("Failed to save templates to localStorage", e);
    }
};

const convertOldPresetToTemplate = (preset: { name: string, data: PromptData }, options: { pinned?: boolean } = {}): Template => {
    const now = Date.now();
    return {
        id: crypto.randomUUID(),
        name: preset.name,
        ...preset.data,
        category: 'Migrated',
        tags: [],
        favorite: false,
        pinned: options.pinned || false,
        usageCount: 0,
        lastUsed: null,
        createdAt: now,
        updatedAt: now,
    };
};

const seedInitialTemplates = (): Template[] => {
    const initialTemplates = STYLE_PRESETS.map(p => convertOldPresetToTemplate(p, { pinned: true }));
    saveAllTemplates(initialTemplates);
    return initialTemplates;
};

const migrateOldPresets = (): Template[] | null => {
    try {
        const oldData = localStorage.getItem(OLD_PRESETS_KEY);
        if (oldData) {
            const oldPresets = JSON.parse(oldData);
            if (Array.isArray(oldPresets)) {
                const migratedTemplates = oldPresets.map(p => convertOldPresetToTemplate(p));
                const initialTemplates = STYLE_PRESETS.map(p => convertOldPresetToTemplate(p, { pinned: true }));
                
                // Combine and remove duplicates by name
                const combined = [...initialTemplates, ...migratedTemplates];
                const uniqueByName = Array.from(new Map(combined.map(t => [t.name.toLowerCase(), t])).values());

                saveAllTemplates(uniqueByName);
                localStorage.removeItem(OLD_PRESETS_KEY);
                console.log(`Migrated ${oldPresets.length} old presets.`);
                return uniqueByName;
            }
        }
    } catch (e) {
        console.error("Failed to migrate old presets", e);
    }
    return null;
};


// --- Public API ---
export const getTemplates = (): Template[] => {
    const templates = getRawTemplates();
    if (templates.length > 0) {
        return templates;
    }
    
    const migrated = migrateOldPresets();
    if (migrated) {
        return migrated;
    }
    
    return seedInitialTemplates();
};

export const createTemplate = (data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Template => {
    const templates = getTemplates();
    const now = Date.now();
    const newTemplate: Template = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
    };
    saveAllTemplates([...templates, newTemplate]);
    return newTemplate;
};

export const updateTemplate = (id: string, updates: Partial<Omit<Template, 'id' | 'createdAt'>>): Template | null => {
    const templates = getTemplates();
    let updatedTemplate: Template | null = null;
    const newTemplates = templates.map(t => {
        if (t.id === id) {
            updatedTemplate = { ...t, ...updates, updatedAt: Date.now() };
            return updatedTemplate;
        }
        return t;
    });
    if(updatedTemplate) {
        saveAllTemplates(newTemplates);
    }
    return updatedTemplate;
};

export const deleteTemplate = (id: string): void => {
    const templates = getTemplates();
    const newTemplates = templates.filter(t => t.id !== id);
    saveAllTemplates(newTemplates);
};

export const getPinnedTemplates = (): Template[] => {
    return getTemplates().filter(t => t.pinned).sort((a,b) => a.name.localeCompare(b.name));
};

export const incrementUsage = (id: string): void => {
    updateTemplate(id, {
        usageCount: (getTemplates().find(t => t.id === id)?.usageCount || 0) + 1,
        lastUsed: Date.now(),
    });
};

export const exportTemplates = (ids?: string[]): string => {
    let templatesToExport = getTemplates();
    if (ids && ids.length > 0) {
        const idSet = new Set(ids);
        templatesToExport = templatesToExport.filter(t => idSet.has(t.id));
    }
    return JSON.stringify(templatesToExport, null, 2);
};

export const importTemplates = (jsonString: string): { success: boolean; message: string; importedCount: number } => {
    try {
        const incomingTemplates = JSON.parse(jsonString);
        if (!Array.isArray(incomingTemplates)) {
            throw new Error("Imported file is not a valid template array.");
        }

        const existingTemplates = getTemplates();
        const existingNames = new Set(existingTemplates.map(t => t.name.toLowerCase()));
        let importedCount = 0;

        const templatesToImport = incomingTemplates.filter(t => {
            // Basic validation
            return t.name && t.subject && !existingNames.has(t.name.toLowerCase());
        });

        const newTemplates = templatesToImport.map(t => {
            const now = Date.now();
            return {
                ...t,
                id: t.id || crypto.randomUUID(),
                category: t.category || 'Imported',
                tags: t.tags || [],
                favorite: t.favorite || false,
                pinned: t.pinned || false,
                usageCount: t.usageCount || 0,
                lastUsed: t.lastUsed || null,
                createdAt: t.createdAt || now,
                updatedAt: now,
            };
        });

        if (newTemplates.length > 0) {
            saveAllTemplates([...existingTemplates, ...newTemplates]);
            importedCount = newTemplates.length;
        }

        const skippedCount = incomingTemplates.length - importedCount;
        let message = `${importedCount} templates imported successfully.`;
        if (skippedCount > 0) {
            message += ` ${skippedCount} templates were skipped due to missing fields or duplicate names.`;
        }

        return { success: true, message, importedCount };

    } catch (e) {
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { success: false, message: `Import failed: ${message}`, importedCount: 0 };
    }
};