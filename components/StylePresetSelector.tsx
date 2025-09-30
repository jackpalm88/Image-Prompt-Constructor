
import React from 'react';
import { Template } from '../types';
import { PinIcon } from './icons';

interface StylePresetSelectorProps {
  templates: Template[];
  onSelect: (template: Template) => void;
  onUnpin: (templateId: string) => void;
  selectedPreset: string | null;
}

const StylePresetSelector: React.FC<StylePresetSelectorProps> = ({ templates, onSelect, onUnpin, selectedPreset }) => {
  if (templates.length === 0) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quick Access:</label>
            <p className="text-sm text-gray-500 bg-gray-100/80 p-3 rounded-lg">Pin your favorite templates in the <span className="font-semibold">Prompts Manager</span> to see them here!</p>
        </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Quick Access:</label>
      <div className="flex flex-wrap gap-2">
        {templates.map((template) => {
          const isSelected = selectedPreset === template.name;
          return (
            <div key={template.id} className={`flex items-center rounded-lg group transition-colors duration-200 shadow-sm ${isSelected ? 'bg-doma-green' : 'bg-white'}`}>
              <button
                type="button"
                onClick={() => onSelect(template)}
                className={`pl-3 pr-2 py-1.5 text-sm font-semibold transition-colors duration-200 rounded-l-lg border-y border-l ${
                  isSelected
                    ? 'bg-doma-green text-white border-transparent'
                    : 'text-gray-700 group-hover:bg-gray-100 border-gray-200 group-hover:border-gray-300'
                }`}
              >
                {template.name}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnpin(template.id);
                }}
                className={`p-1.5 rounded-r-lg border-y border-r transition-colors ${
                  isSelected
                    ? 'text-red-300 hover:text-white border-transparent'
                    : 'text-gray-400 hover:text-doma-red border-gray-200 group-hover:bg-gray-100 group-hover:border-gray-300'
                }`}
                title={`Unpin "${template.name}" from Quick Access`}
              >
                <PinIcon className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StylePresetSelector;