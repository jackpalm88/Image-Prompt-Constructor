import React, { useState } from 'react';
import { Template } from '../types';
import * as templatesStore from '../services/templatesStore';
import MiniSpinner from './MiniSpinner';

interface CreateVariantModalProps {
  parentTemplate: Template;
  onClose: () => void;
  onVariantCreated: (newTemplate: Template) => void;
}

const CreateVariantModal: React.FC<CreateVariantModalProps> = ({ parentTemplate, onClose, onVariantCreated }) => {
  const [patch, setPatch] = useState({
    style: parentTemplate.style,
    lighting: parentTemplate.lighting,
    environment: parentTemplate.environment,
    camera: parentTemplate.camera,
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPatch(prev => ({ ...prev, [name]: value }));
  };

  const handleCreate = async () => {
    setIsLoading(true);
    const result = await templatesStore.createVariant(parentTemplate.signature, patch);
    if (result.status === 'error') {
      alert(`Error creating variant: ${result.error}`);
    } else {
      onVariantCreated(result.template);
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-doma-cream rounded-2xl shadow-xl w-full max-w-2xl animate-fade-in-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h3 className="font-display text-2xl font-medium text-doma-green">Create Variant</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-doma-dark-gray text-2xl">&times;</button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-gray-600">
            Creating a variant of <span className="font-semibold text-doma-dark-gray">"{parentTemplate.name}"</span>.
            <br />
            Only the following fields can be modified. Other fields like subject and action will be inherited.
          </p>
          
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Environment</label>
            <textarea name="environment" value={patch.environment} onChange={handleChange} rows={3} className="w-full bg-white border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green"/>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Style</label>
            <textarea name="style" value={patch.style} onChange={handleChange} rows={2} className="w-full bg-white border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green"/>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Lighting</label>
            <textarea name="lighting" value={patch.lighting} onChange={handleChange} rows={2} className="w-full bg-white border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green"/>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Camera</label>
            <textarea name="camera" value={patch.camera} onChange={handleChange} rows={2} className="w-full bg-white border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green"/>
          </div>
        </div>
        <div className="flex justify-end items-center p-4 border-t border-gray-200 space-x-3 bg-white/30 rounded-b-lg">
          <button onClick={onClose} disabled={isLoading} className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-xl transition-colors border border-gray-300 shadow-sm disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={isLoading} className="bg-doma-green hover:bg-opacity-90 text-white font-bold py-2 px-4 rounded-xl transition-colors shadow-md disabled:opacity-50 flex items-center gap-2">
            {isLoading && <MiniSpinner />}
            {isLoading ? 'Creating...' : 'Create Variant'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateVariantModal;