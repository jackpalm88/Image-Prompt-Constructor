import { Template, PromptData } from '../types';
import { STYLE_PRESETS } from '../constants';

const TEMPLATES_KEY = 'doma-image-studio-templates';
const OLD_PRESETS_KEY = 'nano-banana-presets'; // For migration

// --- Search Index ---

export type DocMeta = {
  name: string;
  quality: "Green" | "Amber" | "Red";
  tags: string[];
  category: string;
  textLen: number;
};

export type BuiltIndex = {
  term: Map<string, Set<string>>; // term -> Set<signature>
  tag: Map<string, Set<string>>; // tag -> Set<signature>
  cat: Map<string, Set<string>>; // category -> Set<signature>
  meta: Map<string, DocMeta>; // signature -> DocMeta
};

let searchIndex: BuiltIndex | null = null;

const STOPWORDS = new Set(['a', 'an', 'the', 'in', 'on', 'of', 'for', 'with', 'by', 'as', 'is', 'are', 'was', 'were', 'to', 'and', 'it', 'from', 'or', 'at', 'i', 'you', 'he', 'she', 'we', 'they']);

export const tokenize = (text: string): string[] => {
    const terms = text.toLowerCase().split(/\W+/);
    return [...new Set(terms.filter(term => term && !STOPWORDS.has(term)))];
};

const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    if (!map.has(key)) {
        // FIX: Explicitly type new Set() for type safety.
        map.set(key, new Set<string>());
    }
    map.get(key)!.add(value);
};

const _addToIndex = (template: Template, index: BuiltIndex) => {
    if (!template.signature) return;
    const sig = template.signature;
    const text = [template.subject, template.action, template.environment, template.style, template.lighting, template.camera].filter(Boolean).join(" ");
    const terms = tokenize(text);
    
    for (const w of terms) add(index.term, w, sig);
    for (const tg of (template.tags || [])) add(index.tag, tg.toLowerCase(), sig);
    add(index.cat, (template.category || "uncategorized").toLowerCase(), sig);
    
    index.meta.set(sig, {
        name: template.name,
        quality: template.quality || "Amber", 
        tags: template.tags || [], 
        category: template.category || "uncategorized", 
        textLen: text.length 
    });
};

const _removeFromIndex = (template: Template, index: BuiltIndex) => {
    if (!template.signature) return;
    const sig = template.signature;

    const text = [template.subject, template.action, template.environment, template.style, template.lighting, template.camera].filter(Boolean).join(" ");
    const terms = tokenize(text);

    for (const term of terms) {
        const sigs = index.term.get(term);
        if (sigs) {
            sigs.delete(sig);
            if (sigs.size === 0) index.term.delete(term);
        }
    }

    for (const tag of (template.tags || [])) {
        const lowerTag = tag.toLowerCase();
        const sigs = index.tag.get(lowerTag);
        if (sigs) {
            sigs.delete(sig);
            if (sigs.size === 0) index.tag.delete(lowerTag);
        }
    }

    const lowerCat = (template.category || "uncategorized").toLowerCase();
    const catSigs = index.cat.get(lowerCat);
    if (catSigs) {
        catSigs.delete(sig);
        if (catSigs.size === 0) index.cat.delete(lowerCat);
    }

    index.meta.delete(sig);
};


export function buildIndex(templates: Template[]): BuiltIndex {
  const index: BuiltIndex = { 
      term: new Map<string, Set<string>>(), 
      tag: new Map<string, Set<string>>(), 
      cat: new Map<string, Set<string>>(), 
      meta: new Map<string, DocMeta>() 
  };
  
  for (const t of templates) {
    if (!t.signature) continue;
    _addToIndex(t, index);
  }
  return index;
}

const getSearchIndex = async (): Promise<BuiltIndex> => {
    if (searchIndex) {
        return searchIndex;
    }
    const templates = await getTemplates();
    searchIndex = buildIndex(templates);
    return searchIndex;
};


const emitTemplatesUpdated = () => {
    window.dispatchEvent(new CustomEvent('doma:templates-updated'));
};

// --- Normalization and Signature ---

const singleSpace = (s: string) => s.replace(/\s+/g, " ").trim();
const lower = (s?: string) => (s ? singleSpace(s).toLowerCase() : "");

export type TemplateValidationInput = Partial<PromptData & { name: string; }>;

export function validateTemplate(input: TemplateValidationInput): { ok: boolean; issues: string[]; quality: "Green" | "Amber" | "Red" } {
  const issues: string[] = [];
  const req = (s?: string) => !!s && s.trim().length > 0;

  if (!req(input.name) || input.name!.trim().length < 3 || input.name!.trim().length > 60)
    issues.push("name: 3–60 chars required");
  if (!req(input.subject) || input.subject!.trim().length > 300)
    issues.push("subject: required, ≤300 chars");

  const filled = (["subject","action","environment","style","lighting","camera"] as (keyof PromptData)[])
    .filter(k => req(input[k])).length;
  if (filled < 4) issues.push("at least 4 descriptive fields required");

  const text = [input.subject,input.action,input.environment,input.style,input.lighting,input.camera]
    .filter(Boolean).join(" ").toLowerCase();
  if (text.includes("very very") || text.includes("ultra ultra"))
    issues.push("remove double intensifiers (e.g., 'very very', 'ultra ultra')");
  
  const hasContradiction = text.includes("soft studio lighting") && text.includes("high contrast");
  if (hasContradiction) issues.push("lighting contradiction: 'soft' vs 'high contrast'");

  const isRed = 
      !req(input.name) || (input.name?.trim().length ?? 0) < 3 || (input.name?.trim().length ?? 0) > 60 ||
      !req(input.subject) || (input.subject?.trim().length ?? 0) > 300 ||
      filled < 4 ||
      hasContradiction;

  const quality = isRed ? "Red" : (issues.length > 0 ? "Amber" : "Green");
  
  return { ok: quality !== "Red", issues, quality };
}

export function normalizeTemplate(input: Partial<Template>): Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'lastUsed' | 'favorite' | 'pinned' | 'signature' | 'thumbnail' | 'quality' | 'renderSuccessCount' | 'variantOf'> {
  return {
    name: singleSpace(input.name || ""),
    subject: lower(input.subject),
    action: lower(input.action),
    environment: lower(input.environment),
    style: lower(input.style),
    lighting: lower(input.lighting),
    camera: lower(input.camera),
    category: lower(input.category || "uncategorized"),
    tags: Array.from(new Set((input.tags || []).map((t: any)=> lower(String(t))))).slice(0,10),
  };
}

export async function computeSignature(templateData: Partial<Template>): Promise<string> {
    const canonical = normalizeTemplate(templateData);
    
    // The signature is based on a subset of fields, excluding tags, to ensure stability.
    const signaturePayload = {
        name: canonical.name,
        subject: canonical.subject,
        action: canonical.action,
        environment: canonical.environment,
        style: canonical.style,
        lighting: canonical.lighting,
        camera: canonical.camera,
        category: canonical.category,
    };

    const sortedKeys = Object.keys(signaturePayload).sort();
    const stableObject: Record<string, any> = {};
    for (const key of sortedKeys) {
        stableObject[key] = (signaturePayload as any)[key];
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(stableObject));
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

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
        emitTemplatesUpdated();
    } catch (e) {
        console.error("Failed to save templates to localStorage", e);
    }
};

const convertOldPresetToTemplate = async (preset: { name: string, data: PromptData }, options: { pinned?: boolean } = {}): Promise<Template> => {
    const now = Date.now();
    const data = { ...preset.data, name: preset.name, category: 'Migrated', tags: suggestTags(preset.data) };
    
    const canonical = normalizeTemplate(data);
    const signature = await computeSignature(data);
    const validation = validateTemplate(canonical);

    return {
        id: crypto.randomUUID(),
        ...canonical,
        favorite: false,
        pinned: options.pinned || false,
        usageCount: 0,
        renderSuccessCount: 0,
        lastUsed: 0,
        createdAt: now,
        updatedAt: now,
        signature,
        quality: validation.quality,
    };
};

const seedInitialTemplates = async (): Promise<Template[]> => {
    const initialTemplates = await Promise.all(STYLE_PRESETS.map(p => convertOldPresetToTemplate(p, { pinned: true })));
    saveAllTemplates(initialTemplates);
    searchIndex = null; // Invalidate index after bulk change
    return initialTemplates;
};

const migrateOldPresets = async (): Promise<Template[] | null> => {
    try {
        const oldData = localStorage.getItem(OLD_PRESETS_KEY);
        if (oldData) {
            const oldPresets = JSON.parse(oldData);
            if (Array.isArray(oldPresets)) {
                const migratedTemplates = await Promise.all(oldPresets.map(p => convertOldPresetToTemplate(p)));
                const initialTemplates = await Promise.all(STYLE_PRESETS.map(p => convertOldPresetToTemplate(p, { pinned: true })));
                
                const combined = [...initialTemplates, ...migratedTemplates];
                const uniqueBySignature = Array.from(new Map(combined.map(t => [t.signature, t])).values());

                saveAllTemplates(uniqueBySignature);
                searchIndex = null; // Invalidate index after bulk change
                localStorage.removeItem(OLD_PRESETS_KEY);
                console.log(`Migrated ${oldPresets.length} old presets.`);
                return uniqueBySignature;
            }
        }
    } catch (e) {
        console.error("Failed to migrate old presets", e);
    }
    return null;
};

// --- Public API ---
export const getTemplates = async (): Promise<Template[]> => {
    let templates = getRawTemplates();

    if (templates.length > 0) {
        // One-time migration for existing templates
        let needsSave = false;
        const migratedTemplates = templates.map(t => {
            let template = { ...t };
            if (typeof template.quality === 'undefined') {
                needsSave = true;
                const validation = validateTemplate(template);
                template.quality = validation.quality;
            }
            if (typeof template.usageCount === 'undefined') {
                needsSave = true;
                template.usageCount = 0;
            }
            if (typeof template.renderSuccessCount === 'undefined') {
                needsSave = true;
                template.renderSuccessCount = 0;
            }
            return template;
        });
        if (needsSave) {
            console.log("Running one-time migration to add new fields to templates.");
            saveAllTemplates(migratedTemplates);
            searchIndex = null; // Invalidate index after bulk change
            return migratedTemplates;
        }
        return templates;
    }
    
    const migrated = await migrateOldPresets();
    if (migrated) {
        return migrated;
    }
    
    return await seedInitialTemplates();
};

export const findTemplateBySignature = async (signature: string): Promise<Template | undefined> => {
    const templates = await getTemplates();
    return templates.find(t => t.signature === signature);
};

export const createTemplate = async (data: Partial<Omit<Template, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Template> => {
    const templates = await getTemplates();
    const now = Date.now();
    
    const canonical = normalizeTemplate(data);
    const signature = await computeSignature(data);
    const validation = validateTemplate(canonical);

    const newTemplate: Template = {
        id: crypto.randomUUID(),
        ...canonical,
        favorite: data.favorite || false,
        pinned: data.pinned || false,
        usageCount: data.usageCount || 0,
        renderSuccessCount: data.renderSuccessCount || 0,
        lastUsed: data.lastUsed || 0,
        createdAt: now,
        updatedAt: now,
        signature,
        thumbnail: data.thumbnail,
        quality: validation.quality,
    };
    if (searchIndex) {
        _addToIndex(newTemplate, searchIndex);
    }
    saveAllTemplates([...templates, newTemplate]);
    return newTemplate;
};

export async function upsertTemplate(data: Partial<Omit<Template, 'id'>>): Promise<{ status: "created" | "updated"; template: Template; }> {
    const templates = await getTemplates();
    const now = Date.now();
    
    const canonical = normalizeTemplate(data);
    const signature = await computeSignature(data);
    const validation = validateTemplate(canonical);
    
    const existingIndex = templates.findIndex(t => t.signature === signature);

    if (existingIndex === -1) {
        // CREATE logic
        const newTemplate: Template = {
            id: crypto.randomUUID(),
            ...canonical,
            favorite: data.favorite || false,
            pinned: data.pinned || false,
            usageCount: 0,
            renderSuccessCount: 0,
            lastUsed: 0,
            createdAt: now,
            updatedAt: now,
            signature,
            thumbnail: data.thumbnail,
            quality: validation.quality,
            variantOf: data.variantOf,
        };
        
        if (searchIndex) {
            _addToIndex(newTemplate, searchIndex);
        }
        saveAllTemplates([...templates, newTemplate]);
        return { status: "created", template: newTemplate };
    } else {
        // UPDATE logic: merge tags, update timestamp, preserve original creation date
        const existing = templates[existingIndex];
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...(canonical.tags || [])])).sort().slice(0,10);
        
        const updatedTemplate: Template = {
            ...existing, // preserve id, createdAt, usageCount, favorite, pinned, renderSuccessCount
            ...canonical, // Overwrite name, category etc. with new normalized values.
            tags: mergedTags,
            updatedAt: now,
            thumbnail: data.thumbnail !== undefined ? data.thumbnail : existing.thumbnail,
            quality: validation.quality,
            variantOf: data.variantOf !== undefined ? data.variantOf : existing.variantOf,
        };
        
        if (searchIndex) {
            _removeFromIndex(existing, searchIndex);
            _addToIndex(updatedTemplate, searchIndex);
        }
        
        const newTemplates = [...templates];
        newTemplates[existingIndex] = updatedTemplate;
        saveAllTemplates(newTemplates);
        
        return { status: "updated", template: updatedTemplate };
    }
}

export const updateTemplate = async (id: string, updates: Partial<Omit<Template, 'id' | 'createdAt'>>): Promise<Template | null> => {
    const templates = await getTemplates();
    const templateIndex = templates.findIndex(t => t.id === id);

    if (templateIndex === -1) {
        return null;
    }

    const oldTemplate = templates[templateIndex];
    const base = { ...oldTemplate, ...updates };
    const canonical = normalizeTemplate(base);
    const signature = await computeSignature(base);
    const validation = validateTemplate(canonical);

    const updatedTemplate: Template = {
        ...oldTemplate,
        ...canonical,
        ...updates,
        signature,
        updatedAt: Date.now(),
        quality: validation.quality,
    };
    
    if (searchIndex) {
        // Re-index even if signature is same, as tags or other non-signature meta may have changed.
        _removeFromIndex(oldTemplate, searchIndex);
        _addToIndex(updatedTemplate, searchIndex);
    }

    templates[templateIndex] = updatedTemplate;
    saveAllTemplates(templates);

    return updatedTemplate;
};

export const deleteTemplate = async (id: string): Promise<void> => {
    const templates = await getTemplates();
    
    if (searchIndex) {
        const templateToDelete = templates.find(t => t.id === id);
        if (templateToDelete) {
            _removeFromIndex(templateToDelete, searchIndex);
        }
    }

    const newTemplates = templates.filter(t => t.id !== id);
    saveAllTemplates(newTemplates);
    emitTemplatesUpdated();
};

export const getPinnedTemplates = async (): Promise<Template[]> => {
    const templates = await getTemplates();
    return templates.filter(t => t.pinned).sort((a,b) => a.name.localeCompare(b.name));
};

export const applyTemplate = async (signature: string): Promise<void> => {
    const templates = await getTemplates();
    const template = templates.find(t => t.signature === signature);
    if (template) {
        await updateTemplate(template.id, {
            usageCount: (template.usageCount || 0) + 1,
            lastUsed: Date.now(),
        });
    }
};

export const recordSuccess = async (signature: string): Promise<void> => {
    const templates = await getTemplates();
    const template = templates.find(t => t.signature === signature);
    if (template) {
        await updateTemplate(template.id, {
            renderSuccessCount: (template.renderSuccessCount || 0) + 1,
        });
    }
};

export const exportTemplates = async (ids?: string[]): Promise<string> => {
    let templatesToExport = await getTemplates();
    if (ids && ids.length > 0) {
        const idSet = new Set(ids);
        templatesToExport = templatesToExport.filter(t => idSet.has(t.id));
    }
    return JSON.stringify(templatesToExport, null, 2);
};

export const importTemplates = async (jsonString: string): Promise<{ success: boolean; message: string; importedCount: number }> => {
    try {
        const incomingTemplates: Partial<Template>[] = JSON.parse(jsonString);
        if (!Array.isArray(incomingTemplates)) {
            throw new Error("Imported file is not a valid template array.");
        }

        const existingTemplates = await getTemplates();
        const existingSignatures = new Set(existingTemplates.map(t => t.signature));
        let importedCount = 0;

        const newTemplates: Template[] = [];

        for (const t of incomingTemplates) {
            if (!t || !t.subject) continue;
            const signature = await computeSignature(t);
            if (!existingSignatures.has(signature)) {
                 const now = Date.now();
                 const canonical = normalizeTemplate(t);
                 const validation = validateTemplate(canonical);
                 newTemplates.push({
                    ...t,
                    ...canonical,
                    id: t.id || crypto.randomUUID(),
                    favorite: t.favorite || false,
                    pinned: t.pinned || false,
                    usageCount: t.usageCount || 0,
                    renderSuccessCount: t.renderSuccessCount || 0,
                    lastUsed: t.lastUsed || 0,
                    createdAt: t.createdAt || now,
                    updatedAt: now,
                    signature: signature,
                    quality: validation.quality,
                } as Template);
                existingSignatures.add(signature); // Avoid importing duplicates from the same file
            }
        }

        if (newTemplates.length > 0) {
            saveAllTemplates([...existingTemplates, ...newTemplates]);
            searchIndex = null; // Invalidate index after bulk import
            importedCount = newTemplates.length;
        }

        const skippedCount = incomingTemplates.length - importedCount;
        let message = `${importedCount} templates imported successfully.`;
        if (skippedCount > 0) {
            message += ` ${skippedCount} templates were skipped due to missing fields or being duplicates.`;
        }

        return { success: true, message, importedCount };

    } catch (e) {
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { success: false, message: `Import failed: ${message}`, importedCount: 0 };
    }
};

export function makeTemplateName(pd: PromptData) {
  const s = (pd.subject || "Untitled").trim();
  const st = (pd.style || "style").trim();
  return `${s} (${st})`;
}

export function suggestTags(pd: PromptData): string[] {
  const out = new Set<string>();
  [pd.subject, pd.action, pd.environment, pd.style, pd.lighting, pd.camera]
    .filter(Boolean)
    .forEach(s => s.split(/[,\s]+/).forEach(t => {
      const k = t.toLowerCase().replace(/[^a-z0-9\-]/g,"");
      if (k && k.length > 2) out.add(k);
    }));
  return Array.from(out).slice(0, 8);
}

export function saveTemplateFromPromptData(pd: PromptData, opts: {
  name?: string; category?: string; tags?: string[]; favorite?: boolean; pinned?: boolean; thumbnail?: string;
}) {
  const templateData: Partial<Template> = {
    name: opts?.name ?? makeTemplateName(pd),
    ...pd,
    category: opts?.category ?? "Uncategorized",
    tags: opts?.tags ?? [],
    favorite: opts?.favorite ?? false,
    pinned: opts?.pinned ?? false,
    thumbnail: opts?.thumbnail,
  };
  return upsertTemplate(templateData);
}

export async function createVariant(
  parentSignature: string,
  patch: Partial<Pick<Template, "style" | "lighting" | "environment" | "camera">>
): Promise<{ status: "created" | "updated"; template: Template } | { status: "error"; error: string }> {
  const parent = await findTemplateBySignature(parentSignature);
  if (!parent) {
    return { status: "error", error: "Parent template not found." };
  }

  const allowedPatch: Partial<Template> = {};
  if (patch.style !== undefined) allowedPatch.style = patch.style;
  if (patch.lighting !== undefined) allowedPatch.lighting = patch.lighting;
  if (patch.environment !== undefined) allowedPatch.environment = patch.environment;
  if (patch.camera !== undefined) allowedPatch.camera = patch.camera;

  const variantCandidate: Partial<Omit<Template, 'id'>> = {
    ...parent,
    ...allowedPatch,
    name: `${parent.name} • Var`,
    variantOf: parent.signature,
    favorite: false,
    pinned: false,
    usageCount: 0,
    renderSuccessCount: 0,
    thumbnail: undefined,
  };

  const { status, template } = await upsertTemplate(variantCandidate);
  return { status, template };
}


// --- Bulk Actions ---
export const deleteManyTemplates = async (ids: string[]): Promise<void> => {
    const idSet = new Set(ids);
    const templates = await getTemplates();

    if (searchIndex) {
        templates.forEach(t => {
            if (idSet.has(t.id)) {
                _removeFromIndex(t, searchIndex);
            }
        });
    }

    const newTemplates = templates.filter(t => !idSet.has(t.id));
    saveAllTemplates(newTemplates);
    emitTemplatesUpdated();
};

export const updateManyTemplates = async (ids: string[], updates: Partial<Template>): Promise<void> => {
    const idSet = new Set(ids);
    const templates = await getTemplates();
    const updatedTemplates = [...templates];

    for (let i = 0; i < updatedTemplates.length; i++) {
        const t = updatedTemplates[i];
        if (idSet.has(t.id)) {
            const oldTemplate = t;

            const base = { ...oldTemplate, ...updates };
            const canonical = normalizeTemplate(base);
            const signature = await computeSignature(base);
            const validation = validateTemplate(canonical);
            
            const updatedTemplate = {
                ...oldTemplate,
                ...canonical,
                ...updates,
                signature,
                updatedAt: Date.now(),
                quality: validation.quality,
            };
            
            if (searchIndex) {
                _removeFromIndex(oldTemplate, searchIndex);
                _addToIndex(updatedTemplate, searchIndex);
            }
            updatedTemplates[i] = updatedTemplate;
        }
    }
    
    saveAllTemplates(updatedTemplates);
};

// --- New Search Function ---

export interface SearchOptions {
    q?: string;
    tags?: string[];
    category?: string;
    minQuality?: "Green" | "Amber";
}

export interface SearchResult {
    template: Template;
    score: number;
}

export const searchTemplates = async (options: SearchOptions, allTemplates: Template[]): Promise<SearchResult[]> => {
    const { q = '', tags = [], category, minQuality } = options;
    const qTerms = tokenize(q);

    const index = await getSearchIndex();
    const templateMap = new Map(allTemplates.map(t => [t.signature, t]));

    let candidateSigs: Set<string>;
    const hasQuery = qTerms.length > 0 || tags.length > 0 || (category && category !== 'All');

    if (!hasQuery) {
        candidateSigs = new Set(index.meta.keys());
    } else {
        // FIX: Explicitly type new Set() to avoid type inference issues.
        candidateSigs = new Set<string>();
        qTerms.forEach(term => index.term.get(term)?.forEach(sig => candidateSigs.add(sig)));
        tags.forEach(tag => index.tag.get(tag.toLowerCase())?.forEach(sig => candidateSigs.add(sig)));
        
        if (tags.length > 0 && qTerms.length === 0 && (!category || category === 'All')) {
            // If only tags are selected, we start with the first tag's hits and intersect with the rest.
            // FIX: Explicitly type new Set() to avoid type inference issues.
            const tagHits = tags.map(t => index.tag.get(t.toLowerCase()) || new Set<string>());
            if (tagHits.length > 0) {
                candidateSigs = new Set(tagHits[0]);
                for(let i=1; i < tagHits.length; i++) {
                    candidateSigs = new Set([...candidateSigs].filter(sig => tagHits[i].has(sig)));
                }
            }
        }

        if (category && category !== 'All') {
            // FIX: Explicitly type new Set() to avoid type inference issues.
            const catHits = index.cat.get(category.toLowerCase()) || new Set<string>();
            if (qTerms.length > 0 || tags.length > 0) {
                 candidateSigs = new Set([...candidateSigs].filter(sig => catHits.has(sig)));
            } else {
                candidateSigs = catHits;
            }
        }
    }

    const results: SearchResult[] = [];
    
    let avgTextLen = 0;
    if (index.meta.size > 0) {
        let totalLen = 0;
        index.meta.forEach(m => totalLen += m.textLen);
        avgTextLen = totalLen / index.meta.size;
    }

    for (const sig of candidateSigs) {
        const meta = index.meta.get(sig);
        const template = templateMap.get(sig);
        if (!meta || !template) continue;
        
        if (minQuality === "Green" && meta.quality !== "Green") continue;
        if (minQuality === "Amber" && meta.quality === "Red") continue;
        
        // Scoring
        let textMatch = 0;
        if (qTerms.length > 0) {
            const templateText = [meta.name, template.subject, template.action, template.environment, template.style, template.lighting, template.camera].filter(Boolean).join(" ");
            const templateTokens = new Set(tokenize(templateText));
            let matchedTerms = 0;
            qTerms.forEach(term => {
                if (templateTokens.has(term)) matchedTerms++;
            });
            textMatch = matchedTerms / qTerms.length;
            if (meta.textLen < avgTextLen) textMatch += 0.05;
        } else if (hasQuery) {
            textMatch = 1.0;
        }
        
        const tagMatch = tags.reduce((acc, tag) => {
            return meta.tags.map(t => t.toLowerCase()).includes(tag.toLowerCase()) ? acc + 0.1 : acc;
        }, 0);
        
        const categoryBoost = (category && category !== 'All' && meta.category.toLowerCase() === category.toLowerCase()) ? 0.1 : 0;
        const qualityBoost = meta.quality === "Green" ? 0.1 : meta.quality === "Amber" ? 0.05 : 0;
        
        const score = Math.max(0, Math.min(1, 
            (textMatch * 0.6) + 
            (Math.min(0.3, tagMatch) * 0.2) + 
            (categoryBoost * 0.1) + 
            (qualityBoost * 0.1)
        ));

        if (score >= 0.15) {
            results.push({ template, score });
        }
    }
    
    results.sort((a,b) => b.score - a.score);
    return results.slice(0, 50);
};

export type BestOfResult = {
    template: Template;
    score: number;
};

export async function getBestOf(limit = 20, minUses = 1): Promise<BestOfResult[]> {
    const all = (await getTemplates()).filter(t => (t.usageCount || 0) >= minUses);
    if (all.length === 0) return [];
    
    const maxU = Math.max(1, ...all.map(t => t.usageCount || 0));
    const maxS = Math.max(1, ...all.map(t => t.renderSuccessCount || 0));
    const qW = (q?: "Green" | "Amber" | "Red") => q === "Green" ? 1 : q === "Amber" ? 0.6 : 0.2;

    const results = all.map(t => {
        const usageN = (t.usageCount || 0) / maxU;
        const succN = (t.renderSuccessCount || 0) / maxS;
        const score = 0.6 * succN + 0.3 * usageN + 0.1 * qW(t.quality);
        return { template: t, score };
    }).sort((a, b) => b.score - a.score).slice(0, limit);

    return results;
}