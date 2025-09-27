import React from 'react';
import { PromptData } from '../types';
import { TrashIcon } from './icons';

interface StylePresetSelectorProps {
  presets: { name: string; data: PromptData }[];
  customPresets: { name: string; data: PromptData }[];
  onSelect: (preset: { name: string; data: PromptData }) => void;
  onDelete: (presetName: string) => void;
  selectedPreset: string | null;
}

const StylePresetSelector: React.FC<StylePresetSelectorProps> = ({ presets, customPresets, onSelect, onDelete, selectedPreset }) => {
  const allPresets = [...presets, ...customPresets];

  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">Start with a style preset:</label>
      <div className="flex flex-wrap gap-2">
        {allPresets.map((preset) => {
          const isCustom = customPresets.some(p => p.name === preset.name);

          if (isCustom) {
            return (
              <div key={preset.name} className="flex items-center bg-gray-700 rounded-full group">
                <button
                  type="button"
                  onClick={() => onSelect(preset)}
                  className={`pl-3 pr-2 py-1.5 text-sm font-semibold transition-colors duration-200 rounded-l-full ${
                    selectedPreset === preset.name
                      ? 'bg-cyan-600 text-white'
                      : 'text-gray-300 group-hover:bg-gray-600 group-hover:text-white'
                  }`}
                >
                  {preset.name}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(preset.name);
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-400 rounded-r-full group-hover:bg-gray-600 transition-colors"
                  title={`Delete preset "${preset.name}"`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            );
          } else {
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => onSelect(preset)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors duration-200 ${
                  selectedPreset === preset.name
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
              >
                {preset.name}
              </button>
            );
          }
        })}
      </div>
    </div>
  );
};

export default StylePresetSelector;