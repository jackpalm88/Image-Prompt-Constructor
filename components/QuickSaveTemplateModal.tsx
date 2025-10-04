import React, { useState, useEffect } from "react";
import type { PromptData } from "../types";
import { saveTemplateFromPromptData, makeTemplateName, suggestTags, validateTemplate } from "../services/templatesStore";
import { suggestTemplateMetadata, createThumbnail } from "../services/geminiService";
import { ShuffleIcon } from './icons';
import MiniSpinner from './MiniSpinner';

export default function QuickSaveTemplateModal({
  promptData,
  thumbnail,
  onClose,
  onSaved,
}: {
  promptData: PromptData;
  thumbnail: string | null;
  onClose: () => void;
  onSaved?: (id: string, status: "created" | "updated") => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(true);

  const getAiSuggestions = async () => {
      setIsSuggesting(true);
      try {
          const metadata = await suggestTemplateMetadata(promptData);
          setName(metadata.name);
          setCategory(metadata.category);
          setTags(metadata.tags.join(', '));
      } catch (error) {
          console.error("AI suggestion failed, falling back to local generation:", error);
          setName(makeTemplateName(promptData));
          setCategory("Uncategorized");
          setTags(suggestTags(promptData).join(', '));
      } finally {
          setIsSuggesting(false);
      }
  };

  useEffect(() => {
    getAiSuggestions();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSave = async () => {
    const templateDraft = {
        ...promptData,
        name: name.trim(),
        category: category.trim(),
        tags: tags.split(",").map(s=>s.trim()).filter(Boolean),
    };

    const validation = validateTemplate(templateDraft);

    if (validation.quality === 'Red') {
        alert(`Could not save template. Please fix issues:\n- ${validation.issues.join('\n- ')}`);
        return;
    }

    if (validation.quality === 'Amber' && validation.issues.length > 0) {
        if (!window.confirm(`There are some quality warnings, but you can proceed:\n- ${validation.issues.join('\n- ')}\n\nDo you want to save anyway?`)) {
            return;
        }
    }
    
    let finalThumbnail: string | undefined = undefined;
    if (thumbnail) {
        try {
            // Create a compressed version for storage to avoid localStorage quota issues
            finalThumbnail = await createThumbnail(thumbnail, 256);
        } catch (error) {
            console.error("Failed to create thumbnail, saving without it.", error);
            finalThumbnail = undefined;
        }
    }
    
    const { status, template } = await saveTemplateFromPromptData(promptData, {
        name: name.trim() || undefined,
        category: category.trim() || undefined,
        tags: tags.split(",").map(s=>s.trim()).filter(Boolean),
        pinned: false,
        favorite: false,
        thumbnail: finalThumbnail,
    });

    onSaved?.(template.id, status);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-doma-dark-gray">Save as Template</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="space-y-3 relative">
          {isSuggesting && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg z-10">
                    <MiniSpinner />
                    <p className="text-sm text-gray-500 mt-2">AI is suggesting details...</p>
                </div>
            )}
          {thumbnail && (
              <div className="flex items-center gap-4 p-2 bg-gray-100 rounded-lg">
                  <img src={thumbnail} alt="thumbnail preview" className="w-16 h-16 object-cover rounded-md" />
                  <p className="text-xs text-gray-600">This image will be saved as the template's thumbnail.</p>
              </div>
          )}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <button onClick={getAiSuggestions} disabled={isSuggesting} className="flex items-center gap-1 text-xs text-doma-green hover:underline disabled:opacity-50 disabled:cursor-not-allowed" title="Suggest with AI again">
                  <ShuffleIcon className="h-3 w-3" />
                  Regenerate
              </button>
            </div>
            <input value={name} onChange={e=>setName(e.target.value)} disabled={isSuggesting} className="w-full bg-white border border-gray-300 rounded-lg shadow-inner-soft p-2 text-doma-dark-gray focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input value={category} onChange={e=>setCategory(e.target.value)} disabled={isSuggesting} className="w-full bg-white border border-gray-300 rounded-lg shadow-inner-soft p-2 text-doma-dark-gray focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma separated)</label>
            <input value={tags} onChange={e=>setTags(e.target.value)} disabled={isSuggesting} className="w-full bg-white border border-gray-300 rounded-lg shadow-inner-soft p-2 text-doma-dark-gray focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold transition-colors border border-gray-300">Cancel</button>
          <button
            onClick={handleSave}
            disabled={isSuggesting}
            className="px-4 py-2 rounded-xl bg-doma-green text-white font-bold hover:bg-opacity-90 transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}