
import React, { useState, useRef, useEffect } from 'react';
import { ImageFile } from '../types';
import { editImage, fileToBase64 } from '../services/geminiService';
import { DownloadIcon, WarningIcon } from './icons';
import ImageViewer from './ImageViewer';
import Spinner from './Spinner';
import { Notification } from '../App';

interface EditViewProps {
  setNotification: (notification: Notification | null) => void;
  addHistoryItem: (resultImage: string, prompt: string, inputImages?: string[]) => void;
  imageToLoad: string | null;
  onImageLoaded: () => void;
}

const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
};

const EditView: React.FC<EditViewProps> = ({ setNotification, addHistoryItem, imageToLoad, onImageLoaded }) => {
  const [sourceImage, setSourceImage] = useState<ImageFile | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [changePrompt, setChangePrompt] = useState('a small, friendly llama');
  const [keepPrompt, setKeepPrompt] = useState('the background, original lighting, and shadows');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
      const loadImage = async () => {
          if (imageToLoad) {
              const file = await dataUrlToFile(imageToLoad, `source-${Date.now()}.png`);
              const base64 = await fileToBase64(file);
              if (sourceImage?.preview) URL.revokeObjectURL(sourceImage.preview);
              setSourceImage({
                  file,
                  preview: imageToLoad, // data URL can be used for preview directly
                  base64,
              });
              setResultImage(null);
              setNotification({ type: 'success', message: 'Image loaded for editing.' });
              onImageLoaded();
          }
      }
      loadImage();
  }, [imageToLoad]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (sourceImage?.preview) URL.revokeObjectURL(sourceImage.preview);
      const base64 = await fileToBase64(file);
      setSourceImage({
        file,
        preview: URL.createObjectURL(file),
        base64,
      });
      setResultImage(null);
    }
  };

  const handleSubmit = async () => {
    if (!sourceImage) {
      setNotification({ type: 'error', message: "Please upload an image first." });
      return;
    }
    setIsEditing(true);
    setNotification(null);
    setResultImage(null);
    try {
      const imageUrl = await editImage(sourceImage.base64, sourceImage.file.type, changePrompt, keepPrompt);
      setResultImage(imageUrl);
      addHistoryItem(imageUrl, `Change: ${changePrompt}, Keep: ${keepPrompt}`, [sourceImage.preview]);
    } catch (err) {
      setNotification({ type: 'error', message: (err as Error).message });
    } finally {
      setIsEditing(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `doma-edited-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-4 md:p-8 h-full">
      <div className="flex flex-col space-y-6 bg-white/50 p-4 sm:p-6 rounded-2xl shadow-lg-doma border border-black/5">
        <h2 className="font-display text-3xl font-medium text-doma-green">Image Editor</h2>
        
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">1. Upload Image</label>
            <input type="file" onChange={handleImageUpload} accept="image/*" className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-doma-green/10 file:text-doma-green hover:file:bg-doma-green/20 cursor-pointer"/>
        </div>

        {sourceImage && (
            <div className="space-y-4">
                <div className="space-y-2">
                    <label htmlFor="change-prompt" className="block text-sm font-medium text-gray-700">2. Describe what to change or add</label>
                    <textarea id="change-prompt" value={changePrompt} onChange={e => setChangePrompt(e.target.value)} rows={2} className="w-full bg-white border border-gray-300 rounded-lg shadow-inner-soft p-2 text-doma-dark-gray focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" placeholder="e.g., a blue bird" />
                </div>
                <div className="space-y-2">
                    <label htmlFor="keep-prompt" className="block text-sm font-medium text-gray-700">3. Describe what to keep untouched</label>
                    <textarea id="keep-prompt" value={keepPrompt} onChange={e => setKeepPrompt(e.target.value)} rows={2} className="w-full bg-white border border-gray-300 rounded-lg shadow-inner-soft p-2 text-doma-dark-gray focus:ring-2 focus:ring-doma-yellow/50 focus:border-doma-green" placeholder="e.g., the background" />
                </div>
                <div className="flex space-x-4">
                    <button onClick={handleSubmit} disabled={isEditing} className="flex-grow bg-doma-green hover:bg-opacity-90 text-white font-bold py-3 px-4 rounded-xl transition duration-300 shadow-lg-doma disabled:opacity-50 disabled:cursor-not-allowed">Apply Edit</button>
                </div>
            </div>
        )}
      </div>
      <div className="bg-white/50 rounded-2xl flex items-center justify-center p-4 min-h-[400px] lg:min-h-0 border border-black/5 shadow-lg-doma">
        <div className="relative w-full h-full flex items-center justify-center">
            {isEditing ? <Spinner message="Applying edits..." /> :
             sourceImage && !resultImage ? (
                <div className="relative w-full h-full flex items-center justify-center">
                    <ImageViewer src={sourceImage.preview} alt="Source" />
                </div>
            ) : resultImage ? (
                <div className="w-full h-full flex flex-col">
                  <div className="flex-grow w-full relative">
                    <ImageViewer src={resultImage} alt="Edited result" />
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-center space-y-3 pt-4">
                     <div className="flex space-x-4">
                        <button onClick={handleDownload} className="flex items-center space-x-2 bg-doma-green hover:bg-opacity-90 text-white font-bold py-2 px-4 rounded-xl transition duration-300 shadow-md">
                            <DownloadIcon className="h-5 w-5" />
                            <span>Download</span>
                        </button>
                     </div>
                     <div className="flex items-center p-3 rounded-lg bg-yellow-100/80 text-yellow-900 text-sm border border-yellow-300/50">
                        <WarningIcon className="h-5 w-5 mr-2 flex-shrink-0"/>
                        <span>Downloaded images may contain a SynthID watermark for identification.</span>
                    </div>
                  </div>
                </div>
            ) : (
                <p className="text-center text-gray-500">Upload an image to start editing.</p>
            )}
        </div>
      </div>
    </div>
  );
};

export default EditView;