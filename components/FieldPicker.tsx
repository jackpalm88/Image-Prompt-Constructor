

import React, { useState, useEffect, useRef } from 'react';
import { PromptData } from '../types';
import { suggestFieldOptions } from '../services/geminiService';
import { SparklesIcon, ShuffleIcon, LockClosedIcon, LockOpenIcon } from './icons';
import MiniSpinner from './MiniSpinner';
import { Notification } from '../App';

interface FieldPickerProps {
  label: string;
  value: string;
  name: keyof PromptData;
  onChange: (name: keyof PromptData, value: string) => void;
  placeholder: string;
  isTextarea?: boolean;
  initialOptions?: string[];
  promptContext: PromptData;
  setNotification: (notification: Notification | null) => void;
  disabled?: boolean;
  isLocked: boolean;
  onToggleLock: (name: keyof PromptData) => void;
}

const FieldPicker: React.FC<FieldPickerProps> = ({ label, value, name, onChange, placeholder, isTextarea, initialOptions = [], promptContext, setNotification, disabled = false, isLocked, onToggleLock }) => {
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
    setNotification(null);
    try {
      const newOptions = await suggestFieldOptions(name, promptContext);
      setCurrentOptions(newOptions);
    } catch (err) {
      setNotification({ type: 'error', message: (err as Error).message });
      setIsPickerOpen(false);
    } finally {
      setIsSuggesting(false);
    }
  };

  const InputComponent = isTextarea ? 'textarea' : 'input';

  return (
    <div ref={pickerRef} className="relative">
      <div className="flex justify-between items-center mb-1">
        <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
        <button
          type="button"
          onClick={() => onToggleLock(name)}
          className="text-gray-400 hover:text-doma-green transition-colors disabled:opacity-50"
          title={isLocked ? "Unlock field" : "Lock field (will not be changed by AI remix)"}
          disabled={disabled}
        >
          {isLocked ? <LockClosedIcon className="h-4 w-4 text-doma-yellow" /> : <LockOpenIcon className="h-4 w-4" />}
        </button>
      </div>
      <div className="relative">
        <InputComponent
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          rows={isTextarea ? 3 : undefined}
          disabled={disabled}
          className={`w-full bg-white border rounded-lg shadow-inner-soft p-2 pr-10 text-doma-dark-gray focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green disabled:bg-gray-100 disabled:opacity-70 disabled:cursor-not-allowed transition ${isLocked ? 'border-doma-yellow/80 ring-1 ring-doma-yellow/50' : 'border-gray-300'}`}
          placeholder={placeholder}
          onClick={() => {
            if (disabled) return;
            setCurrentOptions(initialOptions); // Reset to initial on click
            setIsPickerOpen(true);
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!isPickerOpen) setCurrentOptions(initialOptions);
            setIsPickerOpen(!isPickerOpen)
          }}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-doma-green transition-colors disabled:text-gray-300 disabled:cursor-not-allowed"
          title="Show suggestions"
        >
          <SparklesIcon className="h-5 w-5" />
        </button>
      </div>

      {isPickerOpen && !disabled && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg animate-fade-in-up">
          <div className="p-2 flex justify-between items-center border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-600 px-2">Suggestions</h4>
            <button
              onClick={handleSuggest}
              disabled={isSuggesting}
              className="flex items-center space-x-2 text-xs bg-doma-green/10 hover:bg-doma-green/20 text-doma-green font-semibold rounded-full px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Generate new suggestions with AI"
            >
              {isSuggesting ? <MiniSpinner /> : <ShuffleIcon className="h-4 w-4" />}
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
                    className="w-full text-left px-4 py-2 text-sm text-doma-dark-gray hover:bg-gray-100 transition-colors"
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
