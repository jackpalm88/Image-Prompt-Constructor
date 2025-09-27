import React, { useState, useEffect, useRef } from 'react';
import { PromptData } from '../types';
import { suggestFieldOptions } from '../services/geminiService';
import { SparklesIcon, ShuffleIcon } from './icons';
import MiniSpinner from './MiniSpinner';

interface FieldPickerProps {
  label: string;
  value: string;
  name: keyof PromptData;
  onChange: (name: keyof PromptData, value: string) => void;
  placeholder: string;
  isTextarea?: boolean;
  initialOptions: string[];
  promptContext: PromptData;
  setError: (error: string | null) => void;
}

const FieldPicker: React.FC<FieldPickerProps> = ({ label, value, name, onChange, placeholder, isTextarea, initialOptions, promptContext, setError }) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [currentOptions, setCurrentOptions] = useState(initialOptions);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectOption = (option: string) => {
    onChange(name, option);
    setIsPickerOpen(false);
  };

  const handleSuggest = async () => {
    setIsSuggesting(true);
    setError(null);
    try {
      const newOptions = await suggestFieldOptions(name, promptContext);
      setCurrentOptions(newOptions);
    } catch (err) {
      setError((err as Error).message);
      setIsPickerOpen(false);
    } finally {
      setIsSuggesting(false);
    }
  };

  const InputComponent = isTextarea ? 'textarea' : 'input';

  return (
    <div ref={pickerRef} className="relative">
      <label htmlFor={name} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <div className="relative">
        <InputComponent
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          rows={isTextarea ? 2 : undefined}
          className="w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm p-2 pr-10 text-white focus:ring-cyan-500 focus:border-cyan-500"
          placeholder={placeholder}
          onClick={() => {
            setCurrentOptions(initialOptions); // Reset to initial on click
            setIsPickerOpen(true);
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (!isPickerOpen) setCurrentOptions(initialOptions);
            setIsPickerOpen(!isPickerOpen)
          }}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-cyan-400 transition-colors"
          title="Show suggestions"
        >
          <SparklesIcon className="h-5 w-5" />
        </button>
      </div>

      {isPickerOpen && (
        <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl animate-fade-in-up">
          <div className="p-2 flex justify-between items-center border-b border-gray-700">
            <h4 className="text-sm font-semibold text-gray-300 px-2">Suggestions</h4>
            <button
              onClick={handleSuggest}
              disabled={isSuggesting}
              className="flex items-center space-x-2 text-xs bg-cyan-900/70 hover:bg-cyan-800/90 text-cyan-200 rounded-full px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Generate new suggestions with AI"
            >
              <ShuffleIcon className="h-4 w-4" />
              <span>Suggest with AI</span>
            </button>
          </div>
          {isSuggesting ? (
            <div className="flex justify-center items-center p-4">
              <MiniSpinner />
            </div>
          ) : (
            <ul className="max-h-48 overflow-y-auto">
              {currentOptions.map((option, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => handleSelectOption(option)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/80 transition-colors"
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default FieldPicker;