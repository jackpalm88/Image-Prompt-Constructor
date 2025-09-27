import React, { useState, useEffect } from 'react';
import { PromptData } from '../types';
import { generateImage } from '../services/geminiService';
import Spinner from './Spinner';
import { DownloadIcon, WarningIcon, SaveIcon } from './icons';
import ImageViewer from './ImageViewer';
import { STYLE_PRESETS, QUICK_SELECT_OPTIONS } from '../constants';
import StylePresetSelector from './StylePresetSelector';
import FieldPicker from './FieldPicker';

interface GenerateViewProps {
  setError: (error: string | null) => void;
  addHistoryItem: (resultImage: string, prompt: string, inputImages?: string[]) => void;
}

const GenerateView: React.FC<GenerateViewProps> = ({ setError, addHistoryItem }) => {
  const [promptData, setPromptData] = useState<PromptData>({
    subject: 'A majestic lion with a golden mane',
    action: 'roaring on a cliff at sunrise',
    environment: 'in the Serengeti, vast plains stretching to the horizon',
    style: 'photorealistic, cinematic, epic',
    lighting: 'warm golden hour light, long shadows, high contrast',
    camera: 'low-angle shot, 50mm lens, shallow depth of field',
  });
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customPresets, setCustomPresets] = useState<{ name: string; data: PromptData }[]>([]);

  useEffect(() => {
    try {
      const savedPresets = localStorage.getItem('nano-banana-presets');
      if (savedPresets) {
        setCustomPresets(JSON.parse(savedPresets));
      }
    } catch (e) {
      console.error("Failed to parse custom presets from localStorage", e);
    }
  }, []);

  const handleChange = (name: keyof PromptData, value: string) => {
    setPromptData(prev => ({ ...prev, [name]: value }));
    setSelectedPreset(null); // Deselect preset on manual change
  };

  const handlePresetSelect = (preset: { name: string; data: PromptData }) => {
      setPromptData(preset.data);
      setSelectedPreset(preset.name);
  };
  
  const handleSavePreset = () => {
    const name = prompt("Enter a name for your new preset:");
    if (!name || name.trim() === "") {
      return;
    }

    let operation: 'duplicate' | 'saved' | null = null;
    let newPresetsSnapshot: { name: string; data: PromptData }[] | null = null;

    setCustomPresets(prevPresets => {
      if (prevPresets.some(p => p.name === name) || STYLE_PRESETS.some(p => p.name === name)) {
        operation = 'duplicate';
        return prevPresets;
      }

      const newPreset = { name, data: { ...promptData } };
      const newPresets = [...prevPresets, newPreset];
      newPresetsSnapshot = newPresets;
      operation = 'saved';
      return newPresets;
    });

    if (operation === 'duplicate') {
      alert("A preset with this name already exists. Please choose a different name.");
      return;
    }

    if (operation === 'saved' && newPresetsSnapshot) {
      try {
        localStorage.setItem('nano-banana-presets', JSON.stringify(newPresetsSnapshot));
        setError(null);
        alert(`Preset "${name}" saved!`);
      } catch (error) {
        console.warn('Failed to persist custom presets to localStorage.', error);
        setError('Unable to persist custom presets. Changes may not be saved for future sessions.');
      }
    }
  };

  const handleDeletePreset = (presetName: string) => {
    if (!confirm(`Are you sure you want to delete the preset "${presetName}"?`)) {
      return;
    }

    let newPresetsSnapshot: { name: string; data: PromptData }[] | null = null;

    setCustomPresets(prevPresets => {
      const newPresets = prevPresets.filter(p => p.name !== presetName);
      newPresetsSnapshot = newPresets;
      return newPresets;
    });

    if (newPresetsSnapshot) {
      try {
        localStorage.setItem('nano-banana-presets', JSON.stringify(newPresetsSnapshot));
        setError(null);
      } catch (error) {
        console.warn('Failed to persist preset deletion to localStorage.', error);
        setError('Unable to update stored presets. Changes may not persist.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setError(null);
    setResultImage(null);
    try {
      const compiledPrompt = `Subject: ${promptData.subject}. Action: ${promptData.action}. Environment: ${promptData.environment}. Style: ${promptData.style}. Lighting: ${promptData.lighting}. Camera: ${promptData.camera}.`;
      const imageUrl = await generateImage(promptData);
      setResultImage(imageUrl);
      addHistoryItem(imageUrl, compiledPrompt);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `nano-banana-generated-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-4 md:p-8 h-full">
      <div className="flex flex-col space-y-4">
        <h2 className="text-2xl font-bold text-cyan-300">Scene Composer</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
            <StylePresetSelector 
                presets={STYLE_PRESETS}
                customPresets={customPresets}
                onSelect={handlePresetSelect}
                onDelete={handleDeletePreset}
                selectedPreset={selectedPreset}
            />
            <div className="border-t border-gray-700 !mt-6 pt-4">
                <p className="text-sm font-medium text-gray-300 mb-2">Or customize the fields below:</p>
            </div>
            <FieldPicker label="Subject" name="subject" value={promptData.subject} onChange={handleChange} placeholder="e.g., A robot holding a red skateboard." initialOptions={QUICK_SELECT_OPTIONS.subject} promptContext={promptData} setError={setError} />
            <FieldPicker label="Action" name="action" value={promptData.action} onChange={handleChange} placeholder="e.g., cruising down a futuristic city street." initialOptions={QUICK_SELECT_OPTIONS.action} promptContext={promptData} setError={setError} />
            <FieldPicker label="Environment / Background" name="environment" value={promptData.environment} onChange={handleChange} placeholder="e.g., neon-lit skyscrapers, flying vehicles." isTextarea initialOptions={QUICK_SELECT_OPTIONS.environment} promptContext={promptData} setError={setError} />
            <FieldPicker label="Style" name="style" value={promptData.style} onChange={handleChange} placeholder="e.g., hyperrealistic, 8k, digital art." initialOptions={QUICK_SELECT_OPTIONS.style} promptContext={promptData} setError={setError} />
            <FieldPicker label="Lighting" name="lighting" value={promptData.lighting} onChange={handleChange} placeholder="e.g., dramatic backlighting, lens flare." initialOptions={QUICK_SELECT_OPTIONS.lighting} promptContext={promptData} setError={setError} />
            <FieldPicker label="Camera / Angle" name="camera" value={promptData.camera} onChange={handleChange} placeholder="e.g., wide-angle lens, low-angle shot." initialOptions={QUICK_SELECT_OPTIONS.camera} promptContext={promptData} setError={setError} />
             <div className="flex items-center space-x-4 !mt-6">
                <button type="submit" disabled={isGenerating} className="flex-grow bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-lg disabled:bg-cyan-800 disabled:cursor-not-allowed">
                    Generate Image
                </button>
                <button type="button" onClick={handleSavePreset} title="Save current fields as a preset" className="flex-shrink-0 p-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition duration-300">
                    <SaveIcon className="h-6 w-6" />
                </button>
            </div>
        </form>
      </div>
      <div className="bg-gray-800/50 rounded-lg flex flex-col justify-center p-4 min-h-[400px] lg:min-h-0">
         {isGenerating ? <Spinner message="Generating with Nano Banana..."/> : (
            resultImage ? (
                <>
                  <div className="flex-grow w-full relative">
                     <ImageViewer src={resultImage} alt="Generated result" />
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-center space-y-3 pt-4">
                     <div className="flex space-x-4">
                        <button onClick={handleDownload} className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                            <DownloadIcon className="h-5 w-5" />
                            <span>Download</span>
                        </button>
                     </div>
                     <div className="flex items-center p-3 rounded-md bg-yellow-900/50 text-yellow-300 text-sm">
                        <WarningIcon className="h-5 w-5 mr-2 flex-shrink-0"/>
                        <span>Downloaded images may contain a SynthID watermark for identification.</span>
                    </div>
                  </div>
                </>
             ) : (
                <div className="flex-grow flex items-center justify-center text-center text-gray-400">
                    <p>Your generated image will appear here.</p>
                </div>
             )
         )}
      </div>
    </div>
  );
};

export default GenerateView;
