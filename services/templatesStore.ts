import { Template, PromptData } from '../types';
import { STYLE_PRESETS } from '../constants';

const TEMPLATES_KEY = 'doma-image-studio-templates';
const OLD_PRESETS_KEY = 'nano-banana-presets'; // For migration

const emitTemplatesUpdated = () => {
    window.dispatchEvent(new CustomEvent('doma:templates-updated'));
};

// --- Normalization and Signature ---

const singleSpace = (s: string) => s.replace(/\s+/g, " ").trim();
const lower = (s?: string) => (s ? singleSpace(s).toLowerCase() : "");

export type TemplateValidationInput = Partial<PromptData & { name: string; }>;

export function validateTemplate(input: TemplateValidationInput): { ok: boolean; issues: string[]; quality: "Green" | "Amber" | "Red" } {
  const issues: string[] = [];
  let isRed = false;

  const req = (s?: string) => !!s && s.trim().length > 0;

  if (!req(input.name) || input.name!.trim().length < 3 || input.name!.trim().length > 60) {
    issues.push("Name must be between 3 and 60 characters.");
    isRed = true;
  }
  if (!req(input.subject) || input.subject!.trim().length > 300) {
    issues.push("Subject is required and must be 300 characters or less.");
    isRed = true;
  }

  const filled = (["subject","action","environment","style","lighting","camera"] as (keyof PromptData)[])
    .filter(k => req(input[k])).length;
  if (filled < 4) {
    issues.push("At least 4 descriptive fields (subject, action, etc.) are required.");
    isRed = true;
  }

  const text = [input.subject,input.action,input.environment,input.style,input.lighting,input.camera]
    .filter(Boolean).join(" ").toLowerCase();
    
  if (text.includes("soft studio lighting") && text.includes("high contrast")) {
    issues.push("Lighting is contradictory ('soft studio' vs 'high contrast').");
    isRed = true;
  }

  if (text.includes("very very") || text.includes("ultra ultra")) {
    issues.push("Avoid double intensifiers (e.g., 'very very').");
    // This is an amber issue if no red issues are present
  }
  
  let quality: "Green" | "Amber" | "Red";

  if (isRed) {
    quality = "Red";
  } else if (issues.length > 0) {
    quality = "Amber";
  } else {
    quality = "Green";
  }

  return { ok: quality !== "Red", issues, quality };
}

export function normalizeTemplate(input: Partial<Template>): Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'lastUsed' | 'favorite' | 'pinned' | 'signature' | 'thumbnail'> {
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

    return {
        id: crypto.randomUUID(),
        ...canonical,
        favorite: false,
        pinned: options.pinned || false,
        usageCount: 0,
        lastUsed: 0,
        createdAt: now,
        updatedAt: now,
        signature,
    };
};

const seedInitialTemplates = async (): Promise<Template[]> => {
    const initialTemplates = await Promise.all(STYLE_PRESETS.map(p => convertOldPresetToTemplate(p, { pinned: true })));
    saveAllTemplates(initialTemplates);
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
    const templates = getRawTemplates();
    if (templates.length > 0) {
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

    const newTemplate: Template = {
        id: crypto.randomUUID(),
        ...canonical,
        favorite: data.favorite || false,
        pinned: data.pinned || false,
        usageCount: data.usageCount || 0,
        lastUsed: data.lastUsed || 0,
        createdAt: now,
        updatedAt: now,
        signature,
        thumbnail: data.thumbnail
    };
    saveAllTemplates([...templates, newTemplate]);
    return newTemplate;
};

export async function upsertTemplate(data: Partial<Omit<Template, 'id'>>): Promise<{ status: "created" | "updated"; template: Template; }> {
    const templates = await getTemplates();
    const now = Date.now();
    
    const canonical = normalizeTemplate(data);
    const signature = await computeSignature(data);
    
    const existing = templates.find(t => t.signature === signature);

    if (existing) {
        // UPDATE logic: merge tags, update timestamp, preserve original creation date
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...(canonical.tags || [])])).sort();
        
        const updatedTemplate: Template = {
            ...existing,
            ...canonical, // Overwrite name, category etc. with new normalized values.
            tags: mergedTags,
            updatedAt: now,
            thumbnail: data.thumbnail !== undefined ? data.thumbnail : existing.thumbnail,
        };
        
        const newTemplates = templates.map(t => t.id === existing.id ? updatedTemplate : t);
        saveAllTemplates(newTemplates);
        
        return { status: "updated", template: updatedTemplate };
    } else {
        // CREATE logic
        const newTemplate: Template = {
            id: crypto.randomUUID(),
            ...canonical,
            favorite: data.favorite || false,
            pinned: data.pinned || false,
            usageCount: 0,
            lastUsed: 0,
            createdAt: now,
            updatedAt: now,
            signature,
            thumbnail: data.thumbnail,
        };
        
        saveAllTemplates([...templates, newTemplate]);
        return { status: "created", template: newTemplate };
    }
}

export const updateTemplate = async (id: string, updates: Partial<Omit<Template, 'id' | 'createdAt'>>): Promise<Template | null> => {
    const templates = await getTemplates();
    let updatedTemplate: Template | null = null;
    
    const newTemplates = await Promise.all(templates.map(async t => {
        if (t.id === id) {
            const base = { ...t, ...updates };
            const canonical = normalizeTemplate(base);
            const signature = await computeSignature(base);

            updatedTemplate = { 
                ...t, // preserve original id, createdAt, etc.
                ...canonical, 
                ...updates, // apply other updates like favorite/pinned
                signature,
                updatedAt: Date.now() 
            };
            return updatedTemplate;
        }
        return t;
    }));

    if(updatedTemplate) {
        saveAllTemplates(newTemplates);
    }
    return updatedTemplate;
};

export const deleteTemplate = async (id: string): Promise<void> => {
    const templates = await getTemplates();
    const newTemplates = templates.filter(t => t.id !== id);
    saveAllTemplates(newTemplates);
};

export const getPinnedTemplates = async (): Promise<Template[]> => {
    const templates = await getTemplates();
    return templates.filter(t => t.pinned).sort((a,b) => a.name.localeCompare(b.name));
};

export const incrementUsage = async (id: string): Promise<void> => {
    const templates = await getTemplates();
    const template = templates.find(t => t.id === id);
    if (template) {
        await updateTemplate(id, {
            usageCount: (template.usageCount || 0) + 1,
            lastUsed: Date.now(),
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
                 newTemplates.push({
                    ...t,
                    ...canonical,
                    id: t.id || crypto.randomUUID(),
                    favorite: t.favorite || false,
                    pinned: t.pinned || false,
                    usageCount: t.usageCount || 0,
                    lastUsed: t.lastUsed || 0,
                    createdAt: t.createdAt || now,
                    updatedAt: now,
                    signature: signature,
                } as Template);
                existingSignatures.add(signature); // Avoid importing duplicates from the same file
            }
        }

        if (newTemplates.length > 0) {
            saveAllTemplates([...existingTemplates, ...newTemplates]);
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

// --- Bulk Actions ---
export const deleteManyTemplates = async (ids: string[]): Promise<void> => {
    const idSet = new Set(ids);
    const templates = await getTemplates();
    const newTemplates = templates.filter(t => !idSet.has(t.id));
    saveAllTemplates(newTemplates);
};

// Fix: Add 'updates' parameter and implement logic to re-compute signature on change.
export const updateManyTemplates = async (ids: string[], updates: Partial<Template>): Promise<void> => {
    const idSet = new Set(ids);
    const templates = await getTemplates();
    const newTemplates = await Promise.all(templates.map(async t => {
        if (idSet.has(t.id)) {
            const base = { ...t, ...updates };
            const canonical = normalizeTemplate(base);
            const signature = await computeSignature(base);
            return {
                ...t,
                ...canonical,
                ...updates,
                signature,
                updatedAt: Date.now()
            };
        }
        return t;
    }));
    saveAllTemplates(newTemplates);
};
